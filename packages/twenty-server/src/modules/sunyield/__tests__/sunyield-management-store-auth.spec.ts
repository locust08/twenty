import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { SunyieldManagementStore } from 'src/modules/sunyield/management/sunyield-management.store';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

const user = {
  type: 'user',
  workspace: { id: SUNYIELD_WORKSPACE_ID },
  user: { id: 'user' },
  userWorkspaceId: 'membership',
  workspaceMemberId: 'member',
} as WorkspaceAuthContext;
describe('management store principal boundary', () => {
  it.each([
    { ...user, viaApplication: { id: 'oauth' } },
    { ...user, application: { id: 'app' } },
    { ...user, agentId: 'agent' },
    { ...user, workspace: { id: 'other' } },
    { type: 'apiKey', workspace: user.workspace },
  ])(
    'denies delegated, agent and unrelated contexts before opening a transaction',
    async (context) => {
      const executeInWorkspaceContext = jest.fn();
      const store = new SunyieldManagementStore({
        executeInWorkspaceContext,
      } as unknown as WorkspaceOrmManager);
      await expect(
        store.transaction(context as WorkspaceAuthContext, async () => null),
      ).rejects.toThrow('Sunyield member session required');
      expect(executeInWorkspaceContext).not.toHaveBeenCalled();
    },
  );
});
