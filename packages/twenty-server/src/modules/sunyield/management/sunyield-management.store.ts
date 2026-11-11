import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isNonEmptyString } from '@sniptt/guards';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { withSunyieldManagementWrite } from 'src/modules/sunyield/management/sunyield-write-context';

import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

type ManagedKind = 'lead' | 'note' | 'task' | 'salesperson';
export type SunyieldRelatedActivity = {
  kind: 'note' | 'task';
  record: ObjectRecord;
  targets: ObjectRecord[];
};
export type SunyieldManagementSession = {
  context: UserWorkspaceAuthContext;
  isAdmin: boolean;
  salespersonIds: string[];
  visibility: () => Promise<string[]>;
  read: (
    kind: ManagedKind,
    recordId: string,
    lock?: boolean,
  ) => Promise<ObjectRecord | null>;
  write: (
    kind: ManagedKind,
    recordId: string,
    changes: Partial<ObjectRecord>,
  ) => Promise<ObjectRecord>;
  create: (
    kind: 'note' | 'task',
    record: ObjectRecord,
  ) => Promise<ObjectRecord>;
  createTarget: (
    kind: 'note' | 'task',
    recordId: string,
    leadId: string,
  ) => Promise<void>;
  targets: (kind: 'note' | 'task', recordId: string) => Promise<ObjectRecord[]>;
  relatedActivities: (leadIds: string[]) => Promise<SunyieldRelatedActivity[]>;
  leadIdsForSalesperson: (salespersonId: string) => Promise<string[]>;
  memberForSalesperson: (salespersonId: string) => Promise<string | null>;
  isUniqueActiveMember: (
    memberId: string,
    salespersonId: string,
  ) => Promise<boolean>;
};

const recordsWithIds = (rows: Record<string, unknown>[]): ObjectRecord[] =>
  rows.map((row) => {
    if (!isNonEmptyString(row.id))
      throw new Error('Invalid Sunyield record identity');
    return { ...row, id: row.id };
  });

@Injectable()
export class SunyieldManagementStore {
  constructor(private readonly manager: WorkspaceOrmManager) {}

  async transaction<TResult>(
    auth: WorkspaceAuthContext,
    work: (session: SunyieldManagementSession) => Promise<TResult>,
  ): Promise<TResult> {
    if (
      auth.type !== 'user' ||
      auth.workspace.id !== SUNYIELD_WORKSPACE_ID ||
      isNonEmptyString(auth.agentId) ||
      isDefined(auth.application) ||
      isDefined(auth.viaApplication)
    )
      throw new ForbiddenException('Sunyield member session required');
    const schema = escapeIdentifier(
      getWorkspaceSchemaName(SUNYIELD_WORKSPACE_ID),
    );
    return withWorkspaceAuthContext(auth, () =>
      this.manager.executeInWorkspaceContext(
        () =>
          this.manager.runInWorkspaceTransaction(async (transaction) => {
            await transaction.executeRawQuery("SET LOCAL lock_timeout = '5s'");
            // Mapping inserts and activity links must not race an ownership transition.
            await transaction.executeRawQuery(
              `LOCK TABLE ${schema}."_salesperson" IN SHARE ROW EXCLUSIVE MODE`,
            );
            const memberships = await transaction.executeRawQuery(
              'SELECT id FROM core."userWorkspace" WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 AND "deletedAt" IS NULL FOR SHARE',
              [auth.userWorkspaceId, SUNYIELD_WORKSPACE_ID, auth.user.id],
            );
            const members = await transaction.executeRawQuery(
              `SELECT id FROM ${schema}."workspaceMember" WHERE id=$1 AND "userId"=$2 AND "deletedAt" IS NULL FOR SHARE`,
              [auth.workspaceMemberId, auth.user.id],
            );
            if (memberships.length !== 1 || members.length !== 1)
              throw new ForbiddenException(
                'Active Sunyield membership required',
              );
            const roles = await transaction.executeRawQuery(
              'SELECT (r."universalIdentifier"=$3 AND r."isEditable"=false) AS "isAdmin" FROM core."roleTarget" t JOIN core.role r ON r.id=t."roleId" AND r."workspaceId"=t."workspaceId" WHERE t."userWorkspaceId"=$1 AND t."workspaceId"=$2 FOR SHARE OF t,r',
              [
                auth.userWorkspaceId,
                SUNYIELD_WORKSPACE_ID,
                STANDARD_ROLE.admin.universalIdentifier,
              ],
            );
            if (roles.length === 0)
              throw new ForbiddenException('Active Sunyield role required');
            const mappings = await transaction.executeRawQuery(
              `SELECT id FROM ${schema}."_salesperson" WHERE "workspaceMemberId"=$1 AND "deletedAt" IS NULL ORDER BY id`,
              [auth.workspaceMemberId],
            );
            const repository = (kind: ManagedKind) =>
              this.manager.getRepositoryWithContextPermissions<ObjectRecord>(
                kind,
                transaction,
              );
            const writer = (kind: ManagedKind | 'noteTarget' | 'taskTarget') =>
              transaction.getRepository<ObjectRecord>(kind, {
                shouldBypassPermissionChecks: true,
              });
            const session: SunyieldManagementSession = {
              context: auth,
              isAdmin: roles.some((role) => role.isAdmin === true),
              salespersonIds: recordsWithIds(mappings).map(
                (mapping) => mapping.id,
              ),
              visibility: async () =>
                (
                  await repository('lead').find({
                    select: { id: true },
                    order: { id: 'ASC' },
                  })
                ).map((record) => record.id),
              read: async (kind, recordId, lock = false) => {
                if (lock)
                  await transaction.executeRawQuery(
                    `SELECT id FROM ${schema}.${escapeIdentifier(kind === 'lead' || kind === 'salesperson' ? '_' + kind : kind)} WHERE id=$1 FOR UPDATE`,
                    [recordId],
                  );
                return repository(kind).findOneBy({ id: recordId });
              },
              write: async (kind, recordId, changes) => {
                const result = await withSunyieldManagementWrite(auth, () =>
                  writer(kind).update(recordId, changes),
                );
                if (result.affected !== 1)
                  throw new ConflictException(
                    'Sunyield record changed or access was revoked',
                  );
                const confirmed = await repository(kind).findOneBy({
                  id: recordId,
                });
                if (!confirmed)
                  throw new ConflictException(
                    'Sunyield write could not be confirmed',
                  );
                return confirmed;
              },
              create: async (kind, record) => {
                const result = await withSunyieldManagementWrite(auth, () =>
                  writer(kind).insert(record),
                );
                return recordsWithIds(result.generatedMaps)[0];
              },
              createTarget: async (kind, recordId, leadId) => {
                await withSunyieldManagementWrite(auth, () =>
                  writer(kind === 'note' ? 'noteTarget' : 'taskTarget').insert({
                    id: randomUUID(),
                    [kind + 'Id']: recordId,
                    targetLeadId: leadId,
                  }),
                );
              },
              targets: async (kind, recordId) =>
                recordsWithIds(
                  await transaction.executeRawQuery(
                    `SELECT * FROM ${schema}.${escapeIdentifier(kind + 'Target')} WHERE ${escapeIdentifier(kind + 'Id')}=$1 AND "deletedAt" IS NULL ORDER BY id FOR UPDATE`,
                    [recordId],
                  ),
                ),
              relatedActivities: async (leadIds) => {
                const result: SunyieldRelatedActivity[] = [];
                for (const kind of ['note', 'task'] as const) {
                  const rows = await transaction.executeRawQuery(
                    `SELECT a.id FROM ${schema}.${escapeIdentifier(kind)} a WHERE a."deletedAt" IS NULL AND a.id IN (SELECT t.${escapeIdentifier(kind + 'Id')} FROM ${schema}.${escapeIdentifier(kind + 'Target')} t WHERE t."targetLeadId"=ANY($1::uuid[]) AND t."deletedAt" IS NULL) ORDER BY a.id FOR UPDATE`,
                    [leadIds],
                  );
                  for (const row of recordsWithIds(rows)) {
                    const record = await repository(kind).findOneBy({
                      id: row.id,
                    });
                    if (record)
                      result.push({
                        kind,
                        record,
                        targets: await session.targets(kind, row.id),
                      });
                  }
                }
                return result;
              },
              leadIdsForSalesperson: async (salespersonId) =>
                recordsWithIds(
                  await transaction.executeRawQuery(
                    `SELECT id FROM ${schema}."_lead" WHERE "assignedSalespersonId"=$1 AND "deletedAt" IS NULL ORDER BY id FOR UPDATE`,
                    [salespersonId],
                  ),
                ).map((record) => record.id),
              memberForSalesperson: async (salespersonId) => {
                const rows = await transaction.executeRawQuery(
                  `SELECT m.id FROM ${schema}."_salesperson" s JOIN ${schema}."workspaceMember" m ON m.id=s."workspaceMemberId" AND m."deletedAt" IS NULL JOIN core."userWorkspace" u ON u."userId"=m."userId" AND u."workspaceId"=$2 AND u."deletedAt" IS NULL WHERE s.id=$1 AND s."deletedAt" IS NULL AND (SELECT count(*) FROM ${schema}."_salesperson" d WHERE d."workspaceMemberId"=m.id AND d."deletedAt" IS NULL)=1 FOR SHARE OF m,u`,
                  [salespersonId, SUNYIELD_WORKSPACE_ID],
                );
                return rows.length === 1 && isNonEmptyString(rows[0].id)
                  ? rows[0].id
                  : null;
              },
              isUniqueActiveMember: async (memberId, salespersonId) => {
                const rows = await transaction.executeRawQuery(
                  `SELECT m.id FROM ${schema}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" AND u."workspaceId"=$2 AND u."deletedAt" IS NULL WHERE m.id=$1 AND m."deletedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM ${schema}."_salesperson" s WHERE s."workspaceMemberId"=m.id AND s.id<>$3 AND s."deletedAt" IS NULL) FOR SHARE OF m,u`,
                  [memberId, SUNYIELD_WORKSPACE_ID, salespersonId],
                );
                return rows.length === 1;
              },
            };
            return work(session);
          }),
        auth,
      ),
    );
  }
}
