import { isNonEmptyString } from '@sniptt/guards';
import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

export const buildSunyieldStandardAutomation = (
  context: WorkspaceAuthContext,
): { query: string; parameters: Record<string, unknown> } | null => {
  if (
    context.type !== 'application' ||
    context.workspace.id !== SUNYIELD_WORKSPACE_ID ||
    isDefined(context.agentId) ||
    isDefined(context.actingAgent) ||
    context.application?.workspaceId !== SUNYIELD_WORKSPACE_ID ||
    context.application.universalIdentifier !==
      TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER ||
    isDefined(context.application.deletedAt) ||
    !isNonEmptyString(context.application.id)
  )
    return null;
  return {
    query: `SELECT id FROM core."application" WHERE id=:sunyieldAutomationId AND "workspaceId"=:sunyieldAutomationWorkspaceId AND "universalIdentifier"=:sunyieldAutomationIdentifier AND "deletedAt" IS NULL AND state IN ('INSTALLED','INSTALLING','UPGRADING')`,
    parameters: {
      sunyieldAutomationId: context.application.id,
      sunyieldAutomationWorkspaceId: SUNYIELD_WORKSPACE_ID,
      sunyieldAutomationIdentifier:
        TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
    },
  };
};
