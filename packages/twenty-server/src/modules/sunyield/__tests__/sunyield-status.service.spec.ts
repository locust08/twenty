import { isSunyieldManagementWrite } from 'src/modules/sunyield/management/sunyield-write-context';
import { SunyieldStatusService } from 'src/modules/sunyield/sunyield-status.service';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

const context = {
  type: 'user',
  workspace: { id: 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6' },
  userWorkspaceId: 'membership',
  user: { id: 'user' },
  workspaceMemberId: 'member',
  workspaceMember: { name: { firstName: 'Sunyield', lastName: 'QA' } },
} as WorkspaceAuthContext;
const body = {
  recordId: 'f453c74a-3f6e-55e7-8db8-dfb048901b26',
  status: 'FOLLOW_UP',
  expectedUpdatedAt: '2026-11-03T01:00:00.000Z',
};

const createStore = ({
  mappings = ['salesperson'],
  memberExists = true,
  readable = true,
} = {}) => {
  let scopedWrite = false;
  let lead = {
    id: body.recordId,
    assignedSalespersonId: 'salesperson',
    updatedAt: body.expectedUpdatedAt,
    deletedAt: null,
    status: 'NEW',
    name: 'Preserved',
  };
  const repository = {
    findOneBy: async () => (readable ? lead : null),
    update: async (_id: string, change: { status: string }) => {
      scopedWrite = isSunyieldManagementWrite(context);
      lead = { ...lead, ...change, updatedAt: '2026-11-03T02:00:00.000Z' };
      return { affected: 1 };
    },
  };
  const transaction = {
    executeRawQuery: async (sql: string) => {
      if (sql.includes('FROM core.'))
        return memberExists ? [{ id: 'membership' }] : [];
      if (sql.includes('"workspaceMember"'))
        return memberExists ? [{ id: 'member' }] : [];
      if (sql.includes('FROM') && sql.includes('"_salesperson"'))
        return mappings.map((id) => ({ id }));
      return [];
    },
    getRepository: () => repository,
  };
  const manager = {
    executeInWorkspaceContext: async (work: () => Promise<unknown>) => work(),
    runInWorkspaceTransaction: async (
      work: (scope: typeof transaction) => Promise<unknown>,
    ) => work(transaction),
    getRepositoryWithContextPermissions: () => repository,
  } as unknown as WorkspaceOrmManager;
  return {
    service: new SunyieldStatusService(manager),
    getLead: () => lead,
    getScopedWrite: () => scopedWrite,
  };
};

describe('transactional Sunyield Status service', () => {
  it('uses the internal scoped capability for the existing narrow writer', async () => {
    const { service, getScopedWrite } = createStore();
    await service.update(context, body);
    expect(getScopedWrite()).toBe(true);
  });
  it('updates only Status and returns the confirmed snapshot', async () => {
    const { service, getLead } = createStore();
    const result = await service.update(context, body);
    expect(result.lead).toMatchObject({
      status: 'FOLLOW_UP',
      updatedAt: '2026-11-03T02:00:00.000Z',
    });
    expect(getLead()).toMatchObject({
      name: 'Preserved',
      assignedSalespersonId: 'salesperson',
    });
  });
  it('attributes the change to the authenticated member', async () => {
    const { service, getLead } = createStore();
    await service.update(context, body);
    expect(getLead()).toMatchObject({
      updatedBy: {
        workspaceMemberId: 'member',
        name: 'Sunyield QA',
        source: 'MANUAL',
      },
    });
  });
  it.each([
    { mappings: [] },
    { mappings: ['salesperson', 'duplicate'] },
    { mappings: ['someone-else'] },
    { memberExists: false },
    { readable: false },
  ])(
    'denies unauthorized writes without changing data: %j',
    async (options) => {
      const { service, getLead } = createStore(options);
      await expect(service.update(context, body)).rejects.toThrow();
      expect(getLead().status).toBe('NEW');
    },
  );
});
