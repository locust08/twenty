import { buildActorMetadataFromAuthContext } from 'src/engine/core-modules/actor/utils/build-actor-metadata-from-auth-context.util';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { z } from 'zod';

import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { withSunyieldManagementWrite } from 'src/modules/sunyield/management/sunyield-write-context';
import {
  assertSunyieldUser,
  authorizeSunyieldStatus,
  parseSunyieldStatusRequest,
} from 'src/modules/sunyield/authorize-sunyield-status';

type SunyieldLead = ObjectRecord & {
  assignedSalespersonId: string | null;
  status: string;
  updatedAt: string | Date;
  deletedAt: string | Date | null;
};

@Injectable()
export class SunyieldStatusService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async update(authContext: WorkspaceAuthContext, body: unknown) {
    assertSunyieldUser(authContext);

    if (authContext.type !== 'user' || isDefined(authContext.agentId)) {
      throw new ForbiddenException('Sunyield member access required');
    }

    const request = parseSunyieldStatusRequest(body);
    const schema = escapeIdentifier(
      getWorkspaceSchemaName(authContext.workspace.id),
    );

    return withWorkspaceAuthContext(authContext, () =>
      this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.workspaceOrmManager.runInWorkspaceTransaction(
            async (transaction) => {
              await transaction.executeRawQuery(
                "SET LOCAL lock_timeout = '5s'",
              );
              // Serialize mapping transitions and activity links with this narrow writer.
              await transaction.executeRawQuery(
                `LOCK TABLE ${schema}."_salesperson" IN SHARE ROW EXCLUSIVE MODE`,
              );
              const memberships = await transaction.executeRawQuery(
                'SELECT id FROM core."userWorkspace" WHERE id = $1 AND "workspaceId" = $2 AND "userId" = $3 AND "deletedAt" IS NULL FOR SHARE',
                [
                  authContext.userWorkspaceId,
                  authContext.workspace.id,
                  authContext.user.id,
                ],
              );
              const members = await transaction.executeRawQuery(
                `SELECT id FROM ${schema}."workspaceMember" WHERE id = $1 AND "userId" = $2 AND "deletedAt" IS NULL FOR SHARE`,
                [authContext.workspaceMemberId, authContext.user.id],
              );

              if (memberships.length !== 1 || members.length !== 1) {
                throw new ForbiddenException(
                  'Active Sunyield membership required',
                );
              }

              const mappings = z
                .array(z.object({ id: z.string() }))
                .parse(
                  await transaction.executeRawQuery(
                    `SELECT id FROM ${schema}."_salesperson" WHERE "workspaceMemberId" = $1 AND "deletedAt" IS NULL`,
                    [authContext.workspaceMemberId],
                  ),
                );

              await transaction.executeRawQuery(
                `SELECT id FROM ${schema}."_lead" WHERE id = $1 FOR UPDATE`,
                [request.recordId],
              );
              const readableLeads =
                this.workspaceOrmManager.getRepositoryWithContextPermissions<SunyieldLead>(
                  'lead',
                  transaction,
                );
              const lead = await readableLeads.findOneBy({
                id: request.recordId,
              });

              authorizeSunyieldStatus(
                request,
                lead,
                mappings.map((mapping) => mapping.id),
              );

              const writer = transaction.getRepository<SunyieldLead>('lead', {
                shouldBypassPermissionChecks: true,
              });
              await withSunyieldManagementWrite(authContext, () =>
                writer.update(request.recordId, {
                  status: request.status,
                  updatedBy: buildActorMetadataFromAuthContext(authContext),
                }),
              );
              const confirmed = await writer.findOneBy({
                id: request.recordId,
              });

              if (
                !isDefined(confirmed) ||
                confirmed.status !== request.status ||
                new Date(confirmed.updatedAt).getTime() ===
                  new Date(request.expectedUpdatedAt).getTime()
              ) {
                throw new Error('Sunyield Status write was not confirmed');
              }

              return {
                lead: {
                  id: confirmed.id,
                  status: confirmed.status,
                  updatedBy: confirmed.updatedBy,
                  assignedSalespersonId: confirmed.assignedSalespersonId,
                  updatedAt: new Date(confirmed.updatedAt).toISOString(),
                  deletedAt: confirmed.deletedAt,
                },
              };
            },
          ),
        authContext,
      ),
    );
  }
}
