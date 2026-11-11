import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isNonEmptyString } from '@sniptt/guards';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { buildActorMetadataFromAuthContext } from 'src/engine/core-modules/actor/utils/build-actor-metadata-from-auth-context.util';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  parseSunyieldAccessQuery,
  parseSunyieldManagementRequest,
  SUNYIELD_CUSTOMER_FIELDS,
  type SunyieldManagementRequest,
} from 'src/modules/sunyield/management/sunyield-management.schema';
import {
  SunyieldManagementStore,
  type SunyieldManagementSession,
  type SunyieldRelatedActivity,
} from 'src/modules/sunyield/management/sunyield-management.store';

const version = (record: ObjectRecord, expected: string) => {
  if (
    (record.updatedAt instanceof Date
      ? record.updatedAt.getTime()
      : Date.parse(String(record.updatedAt))) !== Date.parse(expected)
  )
    throw new ConflictException('This record changed. Refresh before saving');
};
const requireRecord = (record: ObjectRecord | null): ObjectRecord => {
  if (!record || isDefined(record.deletedAt))
    throw new NotFoundException('Sunyield record not available');
  return record;
};
const leadIds = (targets: ObjectRecord[]): string[] => {
  if (
    targets.length === 0 ||
    targets.some(
      (target) =>
        !isNonEmptyString(target.targetLeadId) ||
        Object.entries(target).some(
          ([field, value]) =>
            field.startsWith('target') &&
            field.endsWith('Id') &&
            field !== 'targetLeadId' &&
            isDefined(value),
        ),
    )
  )
    throw new ForbiddenException('Activity links require admin review');
  return [...new Set(targets.map((target) => String(target.targetLeadId)))];
};
const ownedLead = async (
  session: SunyieldManagementSession,
  recordId: string,
) => {
  const lead = requireRecord(await session.read('lead', recordId, true));
  if (
    !session.isAdmin &&
    (session.salespersonIds.length !== 1 ||
      lead.assignedSalespersonId !== session.salespersonIds[0])
  )
    throw new NotFoundException('Sunyield record not available');
  return lead;
};
const requireAdmin = (session: SunyieldManagementSession) => {
  if (!session.isAdmin) throw new ForbiddenException('Sunyield Admin required');
};
const validateTransitions = (activities: SunyieldRelatedActivity[]) => {
  for (const activity of activities) {
    if (leadIds(activity.targets).length !== 1)
      throw new BadRequestException(
        'Resolve shared activity links before changing ownership',
      );
    if (
      activity.kind === 'task' &&
      !['TODO', 'IN_PROGRESS', 'DONE'].includes(String(activity.record.status))
    )
      throw new BadRequestException(
        'Resolve unknown task status before changing ownership',
      );
  }
};

@Injectable()
export class SunyieldManagementService {
  constructor(private readonly store: SunyieldManagementStore) {}

  async visibility(context: WorkspaceAuthContext) {
    return this.store.transaction(context, async (session) => {
      const leadIds = await session.visibility();
      return {
        fingerprint: createHash('sha256')
          .update(
            JSON.stringify([session.isAdmin, session.salespersonIds, leadIds]),
          )
          .digest('hex'),
        isAdmin: session.isAdmin,
        leadIds,
      };
    });
  }

  async access(context: WorkspaceAuthContext, input: unknown) {
    const query = parseSunyieldAccessQuery(input);
    return this.store.transaction(context, async (session) => {
      let record: ObjectRecord;
      if (query.objectName === 'lead')
        record = await ownedLead(session, query.recordId);
      else if (query.objectName === 'salesperson') {
        requireAdmin(session);
        record = requireRecord(
          await session.read('salesperson', query.recordId),
        );
      } else {
        record = requireRecord(
          await session.read(query.objectName, query.recordId),
        );
        if (!session.isAdmin) {
          for (const leadId of leadIds(
            await session.targets(query.objectName, query.recordId),
          ))
            await ownedLead(session, leadId);
        }
      }
      const ownNote =
        query.objectName !== 'note' ||
        (isPlainObject(record.createdBy) &&
          record.createdBy.workspaceMemberId ===
            session.context.workspaceMemberId);
      return {
        record,
        isAdmin: session.isAdmin,
        canEdit: session.isAdmin || ownNote,
        editableFields:
          query.objectName === 'lead'
            ? [...SUNYIELD_CUSTOMER_FIELDS]
            : query.objectName === 'task'
              ? ['title', 'bodyV2', 'dueAt', 'status']
              : query.objectName === 'note'
                ? ['title', 'bodyV2']
                : ['workspaceMemberId'],
      };
    });
  }

  async execute(
    context: WorkspaceAuthContext,
    input: unknown,
  ): Promise<{
    record: ObjectRecord;
    relatedRecords?: ObjectRecord[];
    reviewRequired?: boolean;
  }> {
    const request = parseSunyieldManagementRequest(input);
    return this.store.transaction(context, async (session) => {
      const actor = buildActorMetadataFromAuthContext(session.context);
      if (request.action === 'updateLead') {
        const lead = await ownedLead(session, request.recordId);
        version(lead, request.expectedUpdatedAt);
        return {
          record: await session.write('lead', lead.id, {
            ...request.changes,
            updatedBy: actor,
          }),
        };
      }
      if (request.action === 'createActivity') {
        const lead = await ownedLead(session, request.leadId);
        const member = isNonEmptyString(lead.assignedSalespersonId)
          ? await session.memberForSalesperson(lead.assignedSalespersonId)
          : null;
        if (request.kind === 'task' && !member)
          throw new BadRequestException(
            'Map an active member before creating follow-up tasks',
          );
        await session.create(request.kind, {
          id: request.recordId,
          title: request.title ?? '',
          bodyV2: request.bodyV2,
          createdBy: actor,
          updatedBy: actor,
          ...(request.kind === 'task'
            ? {
                assigneeId: member,
                status: 'TODO',
                dueAt: request.dueAt ?? null,
              }
            : {}),
        });
        await session.createTarget(request.kind, request.recordId, lead.id);
        return {
          record: requireRecord(
            await session.read(request.kind, request.recordId),
          ),
        };
      }
      if (request.action === 'updateActivity') {
        const record = requireRecord(
          await session.read(request.kind, request.recordId, true),
        );
        version(record, request.expectedUpdatedAt);
        const activityTargets = await session.targets(request.kind, record.id);
        if (
          session.isAdmin &&
          request.kind === 'task' &&
          !activityTargets.some((target) =>
            isNonEmptyString(target.targetLeadId),
          )
        ) {
          return {
            record: await session.write('task', record.id, {
              ...request.changes,
              updatedBy: actor,
            }),
          };
        }
        const targets = leadIds(activityTargets);
        for (const target of targets) await ownedLead(session, target);
        if (
          !session.isAdmin &&
          request.kind === 'note' &&
          (!isPlainObject(record.createdBy) ||
            record.createdBy.workspaceMemberId !==
              session.context.workspaceMemberId)
        )
          throw new ForbiddenException(
            'Only the note author can edit this history',
          );
        const changes: Partial<ObjectRecord> = {
          ...request.changes,
          updatedBy: actor,
        };
        if (
          request.kind === 'task' &&
          request.changes.status &&
          request.changes.status !== 'DONE' &&
          record.status === 'DONE'
        ) {
          if (targets.length !== 1)
            throw new BadRequestException(
              'Resolve shared task links before reopening',
            );
          const lead = await ownedLead(session, targets[0]);
          const member = isNonEmptyString(lead.assignedSalespersonId)
            ? await session.memberForSalesperson(lead.assignedSalespersonId)
            : null;
          if (!member)
            throw new BadRequestException(
              'Map an active member before reopening',
            );
          changes.assigneeId = member;
        }
        return {
          record: await session.write(request.kind, record.id, changes),
        };
      }
      requireAdmin(session);
      if (request.action === 'reassignLead')
        return this.reassign(session, request);
      return this.mapMember(session, request);
    });
  }

  private async reassign(
    session: SunyieldManagementSession,
    request: Extract<SunyieldManagementRequest, { action: 'reassignLead' }>,
  ) {
    const lead = requireRecord(
      await session.read('lead', request.recordId, true),
    );
    version(lead, request.expectedUpdatedAt);
    requireRecord(
      await session.read('salesperson', request.salespersonId, true),
    );
    const activities = await session.relatedActivities([lead.id]);
    validateTransitions(activities);
    const open = activities.filter(
      (activity) =>
        activity.kind === 'task' && activity.record.status !== 'DONE',
    );
    const member = await session.memberForSalesperson(request.salespersonId);
    if (open.length > 0 && !member)
      throw new BadRequestException(
        'Map the target member before transferring open tasks',
      );
    const actor = buildActorMetadataFromAuthContext(session.context);
    const relatedRecords: ObjectRecord[] = [];
    for (const activity of open)
      relatedRecords.push(
        await session.write('task', activity.record.id, {
          assigneeId: member,
          updatedBy: actor,
        }),
      );
    const record = await session.write('lead', lead.id, {
      assignedSalespersonId: request.salespersonId,
      assignedAt: new Date().toISOString(),
      assignmentState: 'ASSIGNED',
      updatedBy: actor,
    });
    return { record, relatedRecords };
  }

  private async mapMember(
    session: SunyieldManagementSession,
    request: Extract<SunyieldManagementRequest, { action: 'mapSalesperson' }>,
  ) {
    const salesperson = requireRecord(
      await session.read('salesperson', request.recordId, true),
    );
    version(salesperson, request.expectedUpdatedAt);
    if (
      request.workspaceMemberId &&
      !(await session.isUniqueActiveMember(
        request.workspaceMemberId,
        salesperson.id,
      ))
    )
      throw new BadRequestException('Choose a unique active workspace member');
    const activities = await session.relatedActivities(
      await session.leadIdsForSalesperson(salesperson.id),
    );
    let reviewRequired = false;
    if (request.workspaceMemberId) validateTransitions(activities);
    else {
      try {
        validateTransitions(activities);
      } catch {
        reviewRequired = true;
      }
    }
    const actor = buildActorMetadataFromAuthContext(session.context);
    const relatedRecords: ObjectRecord[] = [];
    for (const activity of activities.filter(
      (activity) =>
        activity.kind === 'task' && activity.record.status !== 'DONE',
    ))
      relatedRecords.push(
        await session.write('task', activity.record.id, {
          assigneeId: request.workspaceMemberId,
          updatedBy: actor,
        }),
      );
    const record = await session.write('salesperson', salesperson.id, {
      workspaceMemberId: request.workspaceMemberId,
      updatedBy: actor,
    });
    return { record, relatedRecords, reviewRequired };
  }
}
