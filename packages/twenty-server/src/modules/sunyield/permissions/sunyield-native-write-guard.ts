import { buildSunyieldStandardAutomation } from 'src/modules/sunyield/permissions/sunyield-standard-automation';
import { getAdIntakeProvenanceForLead } from 'src/modules/sunyield/ad-intake/sunyield-ad-intake.identity';
import { compileNamedParameters } from 'src/engine/twenty-orm/sql/utils/compile-named-parameters.util';
import { ForbiddenException } from '@nestjs/common';
import { isDefined } from 'twenty-shared/utils';
import { type ObjectRecord } from 'twenty-shared/types';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';
import { isSunyieldManagementWrite } from 'src/modules/sunyield/management/sunyield-write-context';

type SunyieldWriteBoundary = {
  workspaceId: string;
  schemaName: string;
  authContext: WorkspaceAuthContext;
  execute: (
    sql: string,
    parameters?: unknown[],
  ) => Promise<Record<string, unknown>[]>;
};

export const prepareSunyieldNativeWrite = async (
  scope: SunyieldWriteBoundary,
): Promise<void> => {
  if (scope.workspaceId !== SUNYIELD_WORKSPACE_ID) return;
  const context = scope.authContext;
  const automation = buildSunyieldStandardAutomation(context);
  if (
    context.workspace.id !== SUNYIELD_WORKSPACE_ID ||
    (!['system', 'user'].includes(context.type) && !automation) ||
    (context.type === 'user' && context.agentId)
  )
    throw new ForbiddenException('Sunyield native write not permitted');
  const schema = escapeIdentifier(scope.schemaName);
  await scope.execute("SET LOCAL lock_timeout = '5s'", []);
  await scope.execute(
    `LOCK TABLE ${schema}."_salesperson" IN SHARE ROW EXCLUSIVE MODE`,
    [],
  );
  if (context.type === 'system') return;
  if (automation) {
    const compiled = compileNamedParameters(
      automation.query,
      automation.parameters,
    );
    const rows = await scope.execute(compiled.text, compiled.values);
    if (
      rows.length !== 1 ||
      rows[0].id !== automation.parameters.sunyieldAutomationId
    )
      throw new ForbiddenException(
        'Active Sunyield standard automation required',
      );
    return;
  }
  if (context.type !== 'user')
    throw new ForbiddenException('Sunyield member required');
  const memberships = await scope.execute(
    'SELECT id FROM core."userWorkspace" WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 AND "deletedAt" IS NULL FOR SHARE',
    [context.userWorkspaceId, scope.workspaceId, context.user.id],
  );
  const members = await scope.execute(
    `SELECT id FROM ${schema}."workspaceMember" WHERE id=$1 AND "userId"=$2 AND "deletedAt" IS NULL FOR SHARE`,
    [context.workspaceMemberId, context.user.id],
  );
  const roles = await scope.execute(
    'SELECT (r."universalIdentifier"=$3 AND r."isEditable"=false) AS "isAdmin" FROM core."roleTarget" t JOIN core.role r ON r.id=t."roleId" AND r."workspaceId"=t."workspaceId" WHERE t."userWorkspaceId"=$1 AND t."workspaceId"=$2 FOR SHARE OF t,r',
    [
      context.userWorkspaceId,
      scope.workspaceId,
      STANDARD_ROLE.admin.universalIdentifier,
    ],
  );
  if (
    memberships.length !== 1 ||
    members.length !== 1 ||
    roles.length === 0 ||
    (!roles.some((role) => role.isAdmin === true) &&
      !isSunyieldManagementWrite(context))
  )
    throw new ForbiddenException(
      'Use the authorized Sunyield management action',
    );
};

export const assertSunyieldOwnershipTransition = async (
  scope: SunyieldWriteBoundary & {
    objectName: string;
    operation: string;
    data?: Record<string, unknown>;
    recordsBefore: ObjectRecord[];
  },
): Promise<void> => {
  if (
    scope.workspaceId !== SUNYIELD_WORKSPACE_ID ||
    isSunyieldManagementWrite(scope.authContext)
  )
    return;
  const { data, recordsBefore } = scope;
  if (
    scope.objectName === 'task' &&
    isDefined(data) &&
    data.status !== undefined &&
    data.status !== 'DONE'
  ) {
    const reopening = recordsBefore.filter(
      (record) => record.status === 'DONE',
    );
    if (reopening.length > 0) {
      const schema = escapeIdentifier(scope.schemaName);
      const rows = await scope.execute(
        `SELECT EXISTS(SELECT 1 FROM ${schema}."taskTarget" WHERE "taskId"=ANY($1::uuid[]) AND "targetLeadId" IS NOT NULL AND "deletedAt" IS NULL) AS "hasLeadTarget"`,
        [reopening.map((record) => record.id)],
      );
      if (rows.length !== 1 || rows[0].hasLeadTarget !== false)
        throw new ForbiddenException(
          'Reopen lead tasks through Sunyield management',
        );
    }
  }

  if (
    scope.objectName === 'salesperson' &&
    ['delete', 'soft-delete'].includes(scope.operation) &&
    recordsBefore.length > 0
  ) {
    const schema = escapeIdentifier(scope.schemaName);
    const rows = await scope.execute(
      `SELECT EXISTS(SELECT 1 FROM ${schema}."_lead" WHERE "assignedSalespersonId"=ANY($1::uuid[]) AND "deletedAt" IS NULL) AS "hasAssignedLeads"`,
      [recordsBefore.map((record) => record.id)],
    );
    if (rows.length !== 1 || rows[0].hasAssignedLeads !== false)
      throw new ForbiddenException(
        'Reassign existing leads before deleting their salesperson',
      );
  }
  if (
    scope.objectName === 'salesperson' &&
    isDefined(data) &&
    Object.prototype.hasOwnProperty.call(data, 'workspaceMemberId')
  ) {
    if (
      scope.operation === 'insert'
        ? isDefined(data.workspaceMemberId)
        : recordsBefore.some(
            (record) => record.workspaceMemberId !== data.workspaceMemberId,
          )
    )
      throw new ForbiddenException(
        'Change member mappings through Sunyield management',
      );
  }
  if (
    scope.objectName !== 'lead' ||
    !isDefined(data) ||
    !Object.prototype.hasOwnProperty.call(data, 'assignedSalespersonId') ||
    scope.operation === 'insert'
  )
    return;
  const changed = recordsBefore.filter(
    (record) => record.assignedSalespersonId !== data.assignedSalespersonId,
  );
  if (changed.length === 0) return;
  if (
    changed.some(
      (record) =>
        isDefined(record.assignedSalespersonId) ||
        record.status !== 'NEW' ||
        record.leadType !== 'RESIDENTIAL',
    )
  )
    throw new ForbiddenException('Reassign leads through Sunyield management');
  const schema = escapeIdentifier(scope.schemaName);
  const rows = await scope.execute(
    `SELECT EXISTS(SELECT 1 FROM ${schema}."noteTarget" t WHERE t."targetLeadId"=ANY($1::uuid[]) AND t."deletedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS p("leadId" uuid,"noteId" uuid,"targetId" uuid) JOIN ${schema}.note n ON n.id=p."noteId" WHERE p."leadId"=t."targetLeadId" AND p."targetId"=t.id AND n.id=t."noteId" AND n.title='Meta Ads submission' AND n."deletedAt" IS NULL AND n."createdBySource"='SYSTEM' AND t."createdBySource"='SYSTEM' AND n."createdByName"='SunYield ad connector' AND t."createdByName"='SunYield ad connector' AND n."createdAt"=n."updatedAt" AND t."createdAt"=t."updatedAt") UNION ALL SELECT 1 FROM ${schema}."taskTarget" WHERE "targetLeadId"=ANY($1::uuid[]) AND "deletedAt" IS NULL) AS "hasHistory"`,
    [
      changed.map((record) => record.id),
      JSON.stringify(changed.flatMap(getAdIntakeProvenanceForLead)),
    ],
  );
  if (rows.length !== 1 || rows[0].hasHistory !== false)
    throw new ForbiddenException(
      'Assign leads with history through Sunyield management',
    );
};
