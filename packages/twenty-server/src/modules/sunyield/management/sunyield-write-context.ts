import { ForbiddenException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

type ManagementWriteScope = {
  active: boolean;
  userId: string;
  memberId: string;
  membershipId: string;
  applicationId?: string;
  viaApplicationId?: string;
};
const writeScope = new AsyncLocalStorage<ManagementWriteScope>();

export const isSunyieldManagementWrite = (
  context: WorkspaceAuthContext,
): boolean => {
  const scope = writeScope.getStore();
  return (
    context.type === 'user' &&
    context.workspace.id === SUNYIELD_WORKSPACE_ID &&
    !context.agentId &&
    scope?.active === true &&
    scope.userId === context.user.id &&
    scope.memberId === context.workspaceMemberId &&
    scope.membershipId === context.userWorkspaceId &&
    scope.applicationId === context.application?.id &&
    scope.viaApplicationId === context.viaApplication?.id
  );
};

export const withSunyieldManagementWrite = async <TResult>(
  context: WorkspaceAuthContext,
  work: () => Promise<TResult>,
): Promise<TResult> => {
  if (
    context.type !== 'user' ||
    context.workspace.id !== SUNYIELD_WORKSPACE_ID ||
    context.agentId
  )
    throw new ForbiddenException('Sunyield management write required');
  const scope: ManagementWriteScope = {
    active: true,
    userId: context.user.id,
    memberId: context.workspaceMemberId,
    membershipId: context.userWorkspaceId,
    applicationId: context.application?.id,
    viaApplicationId: context.viaApplication?.id,
  };
  return writeScope.run(scope, async () => {
    try {
      return await work();
    } finally {
      scope.active = false;
    }
  });
};
