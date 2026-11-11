import { buildSunyieldStandardAutomation } from 'src/modules/sunyield/permissions/sunyield-standard-automation';
import { isNonEmptyString } from '@sniptt/guards';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

const PROTECTED_OBJECTS = new Set([
  'lead',
  'note',
  'task',
  'noteTarget',
  'taskTarget',
  'timelineActivity',
  'attachment',
  'workflowRun',
  'favorite',
  'recordShare',
  'recordShareTarget',
]);

type SunyieldVisibilityInput = {
  workspaceId: string;
  authContext: WorkspaceAuthContext;
  objectName: string;
  tableAlias: string;
  schemaName: string;
  targetColumns: string[];
  activityTargetColumns?: { note: string[]; task: string[] };
  objectMetadataIds?: Record<string, string>;
};

export const buildSunyieldRowVisibility = ({
  workspaceId,
  authContext,
  objectName,
  tableAlias,
  schemaName,
  targetColumns,
  activityTargetColumns = { note: targetColumns, task: targetColumns },
  objectMetadataIds = {},
}: SunyieldVisibilityInput): {
  sql: string;
  parameters: Record<string, unknown>;
} | null => {
  if (
    workspaceId !== SUNYIELD_WORKSPACE_ID ||
    (!PROTECTED_OBJECTS.has(objectName) &&
      !targetColumns.includes('targetLeadId')) ||
    authContext.type === 'system'
  ) {
    return null;
  }

  const automation = buildSunyieldStandardAutomation(authContext);
  if (automation)
    return {
      sql: `EXISTS (${automation.query})`,
      parameters: automation.parameters,
    };

  if (
    authContext.type !== 'user' ||
    authContext.workspace.id !== SUNYIELD_WORKSPACE_ID ||
    isNonEmptyString(authContext.agentId) ||
    !isNonEmptyString(authContext.user?.id) ||
    !isNonEmptyString(authContext.workspaceMemberId) ||
    !isNonEmptyString(authContext.userWorkspaceId)
  ) {
    return { sql: 'FALSE', parameters: {} };
  }

  const schema = escapeIdentifier(schemaName);
  const alias = escapeIdentifier(tableAlias);
  const parameters: Record<string, unknown> = {
    sunyieldWorkspaceId: workspaceId,
    sunyieldUserId: authContext.user.id,
    sunyieldUserWorkspaceId: authContext.userWorkspaceId,
    sunyieldMemberId: authContext.workspaceMemberId,
    sunyieldAdminIdentifier: STANDARD_ROLE.admin.universalIdentifier,
  };
  const membership = `EXISTS (SELECT 1 FROM core."userWorkspace" sy_user WHERE sy_user.id = :sunyieldUserWorkspaceId AND sy_user."workspaceId" = :sunyieldWorkspaceId AND sy_user."userId" = :sunyieldUserId AND sy_user."deletedAt" IS NULL) AND EXISTS (SELECT 1 FROM ${schema}."workspaceMember" sy_member WHERE sy_member.id = :sunyieldMemberId AND sy_member."userId" = :sunyieldUserId AND sy_member."deletedAt" IS NULL)`;
  const admin = `EXISTS (SELECT 1 FROM core."roleTarget" sy_target JOIN core."role" sy_role ON sy_role.id = sy_target."roleId" AND sy_role."workspaceId" = sy_target."workspaceId" WHERE sy_target."workspaceId" = :sunyieldWorkspaceId AND sy_target."userWorkspaceId" = :sunyieldUserWorkspaceId AND sy_role."universalIdentifier" = :sunyieldAdminIdentifier AND sy_role."isEditable" = false)`;
  const uniqueMapping = `(SELECT count(*) FROM ${schema}."_salesperson" sy_mapping WHERE sy_mapping."workspaceMemberId" = :sunyieldMemberId AND sy_mapping."deletedAt" IS NULL) = 1`;
  const ownLead = (leadId: string) =>
    `EXISTS (SELECT 1 FROM ${schema}."_lead" sy_lead JOIN ${schema}."_salesperson" sy_salesperson ON sy_salesperson.id = sy_lead."assignedSalespersonId" AND sy_salesperson."deletedAt" IS NULL WHERE sy_lead.id = ${leadId} AND sy_lead."deletedAt" IS NULL AND sy_salesperson."workspaceMemberId" = :sunyieldMemberId)`;
  const noOtherTargets = (targetAlias: string, columns: string[]) =>
    columns
      .filter((column) => column !== 'targetLeadId')
      .map((column) => `${targetAlias}.${escapeIdentifier(column)} IS NULL`)
      .join(' AND ') || 'TRUE';
  const activity = (kind: 'note' | 'task', recordId: string) => {
    const columns = activityTargetColumns[kind];

    if (!columns.includes('targetLeadId')) return 'FALSE';

    const table = `${schema}.${escapeIdentifier(kind + 'Target')}`;
    const key = escapeIdentifier(kind + 'Id');
    const targetIsVisible = `${noOtherTargets('sy_activity_target', columns)} AND ${ownLead('sy_activity_target."targetLeadId"')}`;

    return `EXISTS (SELECT 1 FROM ${table} sy_activity_target WHERE sy_activity_target.${key} = ${recordId} AND sy_activity_target."deletedAt" IS NULL) AND NOT EXISTS (SELECT 1 FROM ${table} sy_activity_target WHERE sy_activity_target.${key} = ${recordId} AND sy_activity_target."deletedAt" IS NULL AND NOT (${targetIsVisible}))`;
  };
  let sales = 'FALSE';

  if (objectName === 'lead') {
    sales = ownLead(`${alias}.id`);
  } else if (objectName === 'note' || objectName === 'task') {
    sales = activity(objectName, `${alias}.id`);
  } else if (objectName === 'noteTarget' || objectName === 'taskTarget') {
    const kind = objectName === 'noteTarget' ? 'note' : 'task';

    if (targetColumns.includes('targetLeadId')) {
      sales = `${noOtherTargets(alias, targetColumns)} AND ${ownLead(`${alias}."targetLeadId"`)} AND (${activity(kind, `${alias}.${escapeIdentifier(kind + 'Id')}`)})`;
    }
  } else if (objectName === 'timelineActivity') {
    const safeTargets = ['targetLeadId', 'targetNoteId', 'targetTaskId'];
    const visibleTargets: Record<string, string> = {
      targetLeadId: ownLead(`${alias}."targetLeadId"`),
      targetNoteId: activity('note', `${alias}."targetNoteId"`),
      targetTaskId: activity('task', `${alias}."targetTaskId"`),
    };
    const present = targetColumns.filter((column) =>
      safeTargets.includes(column),
    );
    const targetGuards = present.map(
      (column) =>
        `(${alias}.${escapeIdentifier(column)} IS NULL OR (${visibleTargets[column]}))`,
    );
    const linked = ['lead', 'note', 'task'].flatMap((kind) => {
      if (!isNonEmptyString(objectMetadataIds[kind])) return [];

      parameters['sunyieldLinked' + kind] = objectMetadataIds[kind];
      const check =
        kind === 'lead'
          ? ownLead(`${alias}."linkedRecordId"`)
          : activity(kind as 'note' | 'task', `${alias}."linkedRecordId"`);

      return [
        `(${alias}."linkedObjectMetadataId" = :sunyieldLinked${kind} AND (${check}))`,
      ];
    });
    if (present.length > 0) {
      sales = `(${present.map((column) => `${alias}.${escapeIdentifier(column)} IS NOT NULL`).join(' OR ')}) AND ${targetGuards.join(' AND ')} AND ${noOtherTargets(
        alias,
        targetColumns.filter((column) => !safeTargets.includes(column)),
      )} AND (${alias}."linkedRecordId" IS NULL${linked.map((condition) => ' OR ' + condition).join('')})`;
    }
  } else if (
    !PROTECTED_OBJECTS.has(objectName) &&
    targetColumns.includes('targetLeadId')
  ) {
    sales = `${alias}."targetLeadId" IS NULL OR (${ownLead(`${alias}."targetLeadId"`)})`;
  }

  return {
    sql: `(${membership}) AND ((${admin}) OR ((${uniqueMapping}) AND (${alias}.\"deletedAt\" IS NULL) AND (${sales})))`,
    parameters,
  };
};
