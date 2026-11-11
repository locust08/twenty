import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';
import {
  prepareSunyieldNativeWrite,
  assertSunyieldOwnershipTransition,
} from 'src/modules/sunyield/permissions/sunyield-native-write-guard';
import { withSunyieldManagementWrite } from 'src/modules/sunyield/management/sunyield-write-context';

const user = {
  type: 'user',
  workspace: { id: SUNYIELD_WORKSPACE_ID },
  user: { id: 'user' },
  userWorkspaceId: 'membership',
  workspaceMemberId: 'member',
} as WorkspaceAuthContext;
const build = ({ admin = false, active = true, history = false } = {}) => {
  const execute = jest.fn(async (sql: string) =>
    sql.startsWith('LOCK')
      ? []
      : sql.includes('AS "hasHistory"')
        ? [{ hasHistory: history }]
        : sql.includes('core."roleTarget"')
          ? [{ isAdmin: admin }]
          : active
            ? [{ id: 'existing' }]
            : [],
  );
  return {
    workspaceId: SUNYIELD_WORKSPACE_ID,
    schemaName: 'workspace_test',
    authContext: user,
    execute,
  };
};
const initial = {
  id: 'lead',
  assignedSalespersonId: null,
  status: 'NEW',
  leadType: 'RESIDENTIAL',
};

describe('Sunyield native write boundary', () => {
  it.each(['TODO', 'IN_PROGRESS', null])(
    'blocks native Admin reopening to %s while preserving personal tasks',
    async (status) => {
      const scope = {
        ...build({ admin: true }),
        objectName: 'task',
        operation: 'update',
        data: { status },
        recordsBefore: [{ id: 'task', status: 'DONE' }],
      };
      await expect(
        assertSunyieldOwnershipTransition({
          ...scope,
          execute: async () => [{ hasLeadTarget: true }],
        }),
      ).rejects.toThrow();
      await expect(
        assertSunyieldOwnershipTransition({
          ...scope,
          execute: async () => [{ hasLeadTarget: false }],
        }),
      ).resolves.toBeUndefined();
    },
  );
  it('preserves the existing standard workflow application only after a live check', async () => {
    const authContext = {
      type: 'application',
      workspace: user.workspace,
      application: {
        id: 'standard-app',
        workspaceId: SUNYIELD_WORKSPACE_ID,
        universalIdentifier: TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        deletedAt: null,
      },
    } as WorkspaceAuthContext;
    const scope = {
      ...build(),
      authContext,
      execute: jest.fn(async (sql: string) =>
        sql.startsWith('SELECT') ? [{ id: 'standard-app' }] : [],
      ),
    };
    await prepareSunyieldNativeWrite(scope);
    expect(scope.execute).toHaveBeenCalledWith(
      expect.stringContaining('core.\"application\"'),
      expect.any(Array),
    );
    await expect(
      prepareSunyieldNativeWrite({ ...scope, execute: async () => [] }),
    ).rejects.toThrow();
    await expect(
      prepareSunyieldNativeWrite({
        ...scope,
        authContext: {
          ...authContext,
          agentId: 'agent',
        } as WorkspaceAuthContext,
      }),
    ).rejects.toThrow();
  });

  it('requires existing leads to be reassigned before deleting their salesperson', async () => {
    const scope = {
      ...build({ admin: true }),
      execute: jest.fn(async () => [{ hasAssignedLeads: true }]),
    };
    await expect(
      assertSunyieldOwnershipTransition({
        ...scope,
        objectName: 'salesperson',
        operation: 'soft-delete',
        recordsBefore: [{ id: 'salesperson' }],
      }),
    ).rejects.toThrow();
    await assertSunyieldOwnershipTransition({
      ...scope,
      execute: async () => [{ hasAssignedLeads: false }],
      objectName: 'salesperson',
      operation: 'delete',
      recordsBefore: [{ id: 'salesperson' }],
    });
  });

  it('does not touch another workspace', async () => {
    const scope = { ...build(), workspaceId: 'other' };
    await prepareSunyieldNativeWrite(scope);
    expect(scope.execute).not.toHaveBeenCalled();
  });
  it('denies ordinary Sales writes even if a caller bypasses native permissions', async () => {
    await expect(prepareSunyieldNativeWrite(build())).rejects.toThrow();
  });
  it('checks live canonical Admin and membership', async () => {
    const scope = build({ admin: true });
    await prepareSunyieldNativeWrite(scope);
    expect(scope.execute).toHaveBeenCalledWith(
      expect.stringContaining('FOR SHARE OF'),
      expect.any(Array),
    );
    await expect(
      prepareSunyieldNativeWrite(build({ admin: true, active: false })),
    ).rejects.toThrow();
  });
  it('allows a checked scoped Sales mutation and retains system automation', async () => {
    await withSunyieldManagementWrite(user, () =>
      prepareSunyieldNativeWrite(build()),
    );
    await prepareSunyieldNativeWrite({
      ...build(),
      authContext: { type: 'system', workspace: user.workspace },
    });
  });
  it.each(['application', 'apiKey', 'pendingActivationUser'] as const)(
    'denies an unknown %s writer',
    async (type) => {
      await expect(
        prepareSunyieldNativeWrite({
          ...build({ admin: true }),
          authContext: {
            type,
            workspace: user.workspace,
          } as WorkspaceAuthContext,
        }),
      ).rejects.toThrow();
    },
  );
  it('does not treat an agent as its admin owner', async () => {
    await expect(
      prepareSunyieldNativeWrite({
        ...build({ admin: true }),
        authContext: { ...user, agentId: 'agent' } as WorkspaceAuthContext,
      }),
    ).rejects.toThrow();
  });
  it('rejects native reassignment but permits the verified first rotation assignment', async () => {
    const scope = build({ admin: true });
    const changes = {
      assignedSalespersonId: 'new',
      assignmentState: 'ASSIGNED',
    };
    await expect(
      assertSunyieldOwnershipTransition({
        ...scope,
        objectName: 'lead',
        operation: 'update',
        data: changes,
        recordsBefore: [{ ...initial, assignedSalespersonId: 'old' }],
      }),
    ).rejects.toThrow();
    await assertSunyieldOwnershipTransition({
      ...scope,
      objectName: 'lead',
      operation: 'update',
      data: changes,
      recordsBefore: [initial],
    });
  });
  it('rejects first-assignment shortcuts when history exists or the lead does not qualify', async () => {
    for (const [scope, record] of [
      [build({ history: true }), initial],
      [build(), { ...initial, status: 'FOLLOW_UP' }],
      [build(), { ...initial, leadType: 'COMMERCIAL' }],
    ] as const) {
      await expect(
        assertSunyieldOwnershipTransition({
          ...scope,
          objectName: 'lead',
          operation: 'update',
          data: { assignedSalespersonId: 'new' },
          recordsBefore: [record],
        }),
      ).rejects.toThrow();
    }
  });
  it('preserves preassigned new lead intake and unchanged assignments', async () => {
    const scope = build({ admin: true });
    await assertSunyieldOwnershipTransition({
      ...scope,
      objectName: 'lead',
      operation: 'insert',
      data: { assignedSalespersonId: 'new' },
      recordsBefore: [],
    });
    await assertSunyieldOwnershipTransition({
      ...scope,
      objectName: 'lead',
      operation: 'update',
      data: { assignedSalespersonId: 'old' },
      recordsBefore: [{ ...initial, assignedSalespersonId: 'old' }],
    });
  });
  it('requires mapping transitions to use the transactional management path', async () => {
    const scope = build({ admin: true });
    await expect(
      assertSunyieldOwnershipTransition({
        ...scope,
        objectName: 'salesperson',
        operation: 'update',
        data: { workspaceMemberId: null },
        recordsBefore: [{ id: 'salesperson', workspaceMemberId: 'old' }],
      }),
    ).rejects.toThrow();
    await withSunyieldManagementWrite(user, () =>
      assertSunyieldOwnershipTransition({
        ...scope,
        objectName: 'salesperson',
        operation: 'update',
        data: { workspaceMemberId: null },
        recordsBefore: [{ id: 'salesperson', workspaceMemberId: 'old' }],
      }),
    );
  });
});
