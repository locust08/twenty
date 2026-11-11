import { describe, expect, it } from 'vitest';
import {
  updateStatus,
  type LeadStore,
  type LeadSnapshot,
} from '../src/update-status';

const WORKSPACE = 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6';
const MEMBER = '11111111-1111-4111-8111-111111111111';
const ASSIGNEE = '22222222-2222-4222-8222-222222222222';
const LEAD = '33333333-3333-4333-8333-333333333333';
const VERSION = '2026-11-03T01:00:00.000Z';
const request = {
  recordId: LEAD,
  status: 'CALLBACK',
  expectedUpdatedAt: VERSION,
};
const context = {
  workspaceId: WORKSPACE,
  workspaceMemberId: MEMBER,
  userWorkspaceId: MEMBER,
};

const setup = () => {
  let row: LeadSnapshot = {
    id: LEAD,
    status: 'NEW',
    updatedAt: VERSION,
    assignedSalespersonId: ASSIGNEE,
    deletedAt: null,
  };
  let writes = 0;
  const audit: unknown[] = [];
  const store: LeadStore = {
    read: async () => ({ ...row }),
    compareAndSet: async (condition, status) => {
      if (
        row.id !== condition.id ||
        row.updatedAt !== condition.updatedAt ||
        row.assignedSalespersonId !== condition.assignedSalespersonId ||
        row.deletedAt !== null
      )
        return null;
      writes += 1;
      row = { ...row, status, updatedAt: '2026-11-03T01:00:01.000Z' };
      return { ...row };
    },
  };
  const dependencies = {
    store,
    workspaceId: WORKSPACE,
    assignments: { [MEMBER]: ASSIGNEE },
    statuses: ['NEW', 'CALLBACK'],
    audit: (event: unknown) => {
      audit.push(event);
    },
  };
  return {
    dependencies,
    state: () => ({ row, writes, audit }),
    change: (changes: Partial<LeadSnapshot>) => {
      row = { ...row, ...changes };
    },
  };
};

describe('Sunyield status authorization', () => {
  it('changes only status for the authenticated assignee and records the actor', async () => {
    const fixture = setup();
    await expect(
      updateStatus(request, context, fixture.dependencies),
    ).resolves.toMatchObject({ status: 'CALLBACK' });
    expect(fixture.state().row).toEqual({
      id: LEAD,
      status: 'CALLBACK',
      updatedAt: '2026-11-03T01:00:01.000Z',
      assignedSalespersonId: ASSIGNEE,
      deletedAt: null,
    });
    expect(fixture.state().audit).toEqual([
      expect.objectContaining({
        workspaceMemberId: MEMBER,
        previousStatus: 'NEW',
        status: 'CALLBACK',
        recordId: LEAD,
      }),
    ]);
  });

  it.each([
    {
      workspaceId: 'other',
      workspaceMemberId: MEMBER,
      userWorkspaceId: MEMBER,
    },
    {
      workspaceId: WORKSPACE,
      workspaceMemberId: null,
      userWorkspaceId: MEMBER,
    },
    {
      workspaceId: WORKSPACE,
      workspaceMemberId: MEMBER,
      userWorkspaceId: null,
    },
    { workspaceId: WORKSPACE, workspaceMemberId: LEAD, userWorkspaceId: LEAD },
  ])(
    'denies foreign workspaces, app-only calls and unmapped identities',
    async (identity) => {
      const fixture = setup();
      await expect(
        updateStatus(request, identity, fixture.dependencies),
      ).rejects.toThrow();
      expect(fixture.state().writes).toBe(0);
    },
  );

  it.each([
    { ownerId: MEMBER },
    { assignedSalespersonId: ASSIGNEE },
    { workspaceMemberId: MEMBER },
    { status: 'UNKNOWN' },
    { recordId: 'bad-id' },
    { expectedUpdatedAt: 'yesterday' },
  ])(
    'rejects forged identity, extra writes and malformed requests',
    async (changes) => {
      const fixture = setup();
      await expect(
        updateStatus({ ...request, ...changes }, context, fixture.dependencies),
      ).rejects.toThrow();
      expect(fixture.state().writes).toBe(0);
    },
  );

  it.each([
    { assignedSalespersonId: null },
    { assignedSalespersonId: LEAD },
    { deletedAt: VERSION },
    { updatedAt: '2026-11-03T01:00:02.000Z' },
  ])(
    'denies unassigned, other-owned, deleted and stale leads',
    async (changes) => {
      const fixture = setup();
      fixture.change(changes);
      await expect(
        updateStatus(request, context, fixture.dependencies),
      ).rejects.toThrow();
      expect(fixture.state().writes).toBe(0);
    },
  );

  it('does not overwrite a reassignment between read and write', async () => {
    const fixture = setup();
    const originalRead = fixture.dependencies.store.read;
    fixture.dependencies.store.read = async (id) => {
      const previous = await originalRead(id);
      fixture.change({ assignedSalespersonId: LEAD });
      return previous;
    };
    await expect(
      updateStatus(request, context, fixture.dependencies),
    ).rejects.toThrow('changed');
    expect(fixture.state().writes).toBe(0);
  });

  it('rejects a repeated submission after the first update', async () => {
    const fixture = setup();
    await updateStatus(request, context, fixture.dependencies);
    await expect(
      updateStatus(request, context, fixture.dependencies),
    ).rejects.toThrow('changed');
    expect(fixture.state().writes).toBe(1);
  });
});
