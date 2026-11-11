import { ForbiddenException } from '@nestjs/common';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

export type SunyieldFileIdentity = {
  userId: string;
  userWorkspaceId: string;
  workspaceMemberId: string;
};
export const authorizeSunyieldFile = async (
  workspaceId: string,
  identity: SunyieldFileIdentity | undefined,
  query: (
    sql: string,
    parameters: unknown[],
  ) => Promise<Record<string, unknown>[]>,
) => {
  if (workspaceId !== SUNYIELD_WORKSPACE_ID) return undefined;
  if (!identity)
    throw new ForbiddenException(
      'Sunyield private files require an active admin',
    );
  const schema = escapeIdentifier(getWorkspaceSchemaName(workspaceId));
  const rows = await query(
    `SELECT u.id FROM core."userWorkspace" u JOIN core."user" actor ON actor.id=u."userId" AND actor."deletedAt" IS NULL AND actor.disabled=false JOIN ${schema}."workspaceMember" m ON m."userId"=u."userId" AND m.id=$4 AND m."deletedAt" IS NULL JOIN core."roleTarget" t ON t."userWorkspaceId"=u.id AND t."workspaceId"=u."workspaceId" JOIN core.role r ON r.id=t."roleId" AND r."workspaceId"=t."workspaceId" WHERE u."workspaceId"=$1 AND u.id=$2 AND u."userId"=$3 AND u."deletedAt" IS NULL AND r."universalIdentifier"=$5 AND r."isEditable"=false`,
    [
      workspaceId,
      identity.userWorkspaceId,
      identity.userId,
      identity.workspaceMemberId,
      STANDARD_ROLE.admin.universalIdentifier,
    ],
  );
  if (!rows.some((row) => row.id === identity.userWorkspaceId))
    throw new ForbiddenException(
      'Sunyield private files require an active admin',
    );
  return identity;
};
