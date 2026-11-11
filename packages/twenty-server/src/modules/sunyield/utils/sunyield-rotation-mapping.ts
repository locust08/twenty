import { type DataSource } from 'typeorm';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

export const findSunyieldMappedRotationCandidateIds = async (
  database: Pick<DataSource, 'query'>,
  candidateIds: string[],
): Promise<Set<string>> => {
  const schema = escapeIdentifier(
    getWorkspaceSchemaName(SUNYIELD_WORKSPACE_ID),
  );
  const records = await database.query<{ id: string }[]>(
    `SELECT s.id
     FROM ${schema}."_salesperson" s
     JOIN ${schema}."workspaceMember" m
       ON m.id=s."workspaceMemberId" AND m."deletedAt" IS NULL
     WHERE s.id=ANY($1::uuid[]) AND s.active=true AND s."deletedAt" IS NULL
       AND EXISTS (
         SELECT 1 FROM core."userWorkspace" u
         WHERE u."userId"=m."userId" AND u."workspaceId"=$2 AND u."deletedAt" IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM ${schema}."_salesperson" duplicate
         WHERE duplicate."workspaceMemberId"=m.id
           AND duplicate.id<>s.id AND duplicate."deletedAt" IS NULL
       )`,
    [candidateIds, SUNYIELD_WORKSPACE_ID],
  );
  return new Set(records.map((record) => record.id));
};
