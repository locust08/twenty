import { type ObjectRecord } from 'twenty-shared/types';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SunyieldManagementService } from 'src/modules/sunyield/management/sunyield-management.service';
import {
  type SunyieldManagementSession,
  type SunyieldManagementStore,
} from 'src/modules/sunyield/management/sunyield-management.store';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

const id = (number: number) =>
  '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
const VERSION = '2026-11-04T07:00:00.000Z';
const context = {
  type: 'user',
  workspace: { id: SUNYIELD_WORKSPACE_ID },
  user: { id: id(1) },
  workspaceMemberId: id(2),
  userWorkspaceId: id(3),
  workspaceMember: { id: id(2), name: { firstName: 'Sales', lastName: 'One' } },
} as UserWorkspaceAuthContext;
const build = ({
  admin = false,
  mappings = [id(10)],
}: { admin?: boolean; mappings?: string[] } = {}) => {
  const records: Record<string, Map<string, ObjectRecord>> = {
    lead: new Map(),
    note: new Map(),
    task: new Map(),
    salesperson: new Map(),
  };
  const links: Record<string, Map<string, ObjectRecord[]>> = {
    note: new Map(),
    task: new Map(),
  };
  let sequence = 0;
  const add = (kind: string, record: ObjectRecord) =>
    records[kind].set(record.id, {
      createdAt: VERSION,
      updatedAt: VERSION,
      deletedAt: null,
      ...record,
    });
  add('lead', {
    id: id(100),
    name: 'Customer A',
    status: 'NEW',
    assignedSalespersonId: id(10),
  });
  add('lead', {
    id: id(101),
    name: 'Customer B',
    status: 'NEW',
    assignedSalespersonId: id(11),
  });
  add('salesperson', { id: id(10), workspaceMemberId: id(2) });
  add('salesperson', { id: id(11), workspaceMemberId: id(4) });
  add('salesperson', { id: id(12), workspaceMemberId: null });
  const targets = (kind: string, recordId: string) =>
    links[kind].get(recordId) ?? [];
  const session: SunyieldManagementSession = {
    context,
    isAdmin: admin,
    salespersonIds: mappings,
    visibility: async () =>
      [...records.lead.values()]
        .filter(
          (lead) =>
            admin || mappings.includes(String(lead.assignedSalespersonId)),
        )
        .map((lead) => lead.id)
        .sort(),
    read: async (kind, recordId) => records[kind].get(recordId) ?? null,
    write: async (kind, recordId, changes) => {
      const record = {
        ...records[kind].get(recordId),
        ...changes,
        id: recordId,
        updatedAt: new Date(
          Date.parse(VERSION) + ++sequence * 1000,
        ).toISOString(),
      };
      records[kind].set(recordId, record);
      return record;
    },
    create: async (kind, record) => {
      if (records[kind].has(record.id)) throw Error('Duplicate record');
      add(kind, record);
      return records[kind].get(record.id)!;
    },
    createTarget: async (kind, recordId, leadId) => {
      links[kind].set(recordId, [
        { id: id(900 + sequence++), targetLeadId: leadId, deletedAt: null },
      ]);
    },
    targets: async (kind, recordId) => targets(kind, recordId),
    relatedActivities: async (leadIds) =>
      ['note', 'task'].flatMap((kind) =>
        [...records[kind].values()]
          .filter((record) =>
            targets(kind, record.id).some((target) =>
              leadIds.includes(String(target.targetLeadId)),
            ),
          )
          .map((record) => ({
            kind: kind as 'note' | 'task',
            record,
            targets: targets(kind, record.id),
          })),
      ),
    leadIdsForSalesperson: async (salespersonId) =>
      [...records.lead.values()]
        .filter((record) => record.assignedSalespersonId === salespersonId)
        .map((record) => record.id),
    memberForSalesperson: async (salespersonId) => {
      const member = records.salesperson.get(salespersonId)?.workspaceMemberId;
      return typeof member === 'string' &&
        [id(2), id(4)].includes(member) &&
        [...records.salesperson.values()].filter(
          (record) => record.workspaceMemberId === member,
        ).length === 1
        ? member
        : null;
    },
    isUniqueActiveMember: async (memberId, salespersonId) =>
      [id(2), id(4)].includes(memberId) &&
      ![...records.salesperson.values()].some(
        (record) =>
          record.id !== salespersonId && record.workspaceMemberId === memberId,
      ),
  };
  const store = {
    transaction: async (
      _context: UserWorkspaceAuthContext,
      work: (scope: SunyieldManagementSession) => Promise<unknown>,
    ) => {
      const saved = Object.fromEntries(
        Object.entries(records).map(([kind, values]) => [
          kind,
          structuredClone([...values.entries()]),
        ]),
      );
      const savedLinks = Object.fromEntries(
        Object.entries(links).map(([kind, values]) => [
          kind,
          structuredClone([...values.entries()]),
        ]),
      );
      try {
        return await work(session);
      } catch (error) {
        for (const kind of Object.keys(records))
          records[kind] = new Map(saved[kind]);
        for (const kind of Object.keys(links))
          links[kind] = new Map(savedLinks[kind]);
        throw error;
      }
    },
  } as unknown as SunyieldManagementStore;
  const service = new SunyieldManagementService(store);
  const task = (number: number, status = 'TODO', target = id(100)) => {
    add('task', {
      id: id(number),
      title: 'Follow up',
      status,
      assigneeId: id(2),
    });
    links.task.set(id(number), [
      { id: id(number + 1000), targetLeadId: target, deletedAt: null },
    ]);
  };
  return { service, records, links, session, add, task };
};
const update = {
  action: 'updateLead',
  recordId: id(100),
  expectedUpdatedAt: VERSION,
  changes: { name: 'Corrected', rawPhone: '+60120000000' },
};
const reassign = {
  action: 'reassignLead',
  recordId: id(100),
  expectedUpdatedAt: VERSION,
  salespersonId: id(11),
};

describe('Sunyield transactional management policy', () => {
  it('retains timestamp milliseconds when the database returns a Date', async () => {
    const { service, records } = build();
    records.lead.get(id(100))!.updatedAt = new Date('2026-11-04T07:00:00.123Z');
    await expect(
      service.execute(context, {
        ...update,
        expectedUpdatedAt: '2026-11-04T07:00:00.123Z',
      }),
    ).resolves.toHaveProperty('record.name', 'Corrected');
  });

  it('changes approved own customer fields and attributes the user', async () => {
    const { service, records } = build();
    const result = await service.execute(context, update);
    expect(result.record).toMatchObject({
      name: 'Corrected',
      rawPhone: '+60120000000',
      assignedSalespersonId: id(10),
      updatedBy: { workspaceMemberId: id(2), source: 'MANUAL' },
    });
    expect(records.lead.get(id(101))?.name).toBe('Customer B');
  });
  it.each([[], [id(11)], [id(10), id(11)]].map((mappings) => ({ mappings })))(
    'denies missing, foreign or duplicate mapping %j',
    async ({ mappings }) => {
      const { service, records } = build({ mappings });
      await expect(service.execute(context, update)).rejects.toThrow();
      expect(records.lead.get(id(100))?.name).toBe('Customer A');
    },
  );
  it('rejects stale edits without changing records', async () => {
    const { service, records } = build();
    await expect(
      service.execute(context, {
        ...update,
        expectedUpdatedAt: '2026-11-03T07:00:00.000Z',
      }),
    ).rejects.toThrow();
    expect(records.lead.get(id(100))?.name).toBe('Customer A');
  });
  it('creates a linked task atomically and derives its assignee', async () => {
    const { service, records, links } = build();
    const result = await service.execute(context, {
      action: 'createActivity',
      kind: 'task',
      recordId: id(200),
      leadId: id(100),
      title: 'Call tomorrow',
      bodyV2: { markdown: 'Remark' },
      dueAt: '2026-11-05T01:00:00.000Z',
    });
    expect(result.record).toMatchObject({
      id: id(200),
      assigneeId: id(2),
      status: 'TODO',
    });
    expect(links.task.get(id(200))).toEqual([
      expect.objectContaining({ targetLeadId: id(100) }),
    ]);
    expect(records.task.size).toBe(1);
  });
  it('denies task creation on a foreign lead', async () => {
    const { service, records } = build();
    await expect(
      service.execute(context, {
        action: 'createActivity',
        kind: 'task',
        recordId: id(200),
        leadId: id(101),
        title: 'Forbidden',
        bodyV2: null,
      }),
    ).rejects.toThrow();
    expect(records.task.size).toBe(0);
  });
  it('allows own note edits while preserving other authors history', async () => {
    const { service, add, links, records } = build();
    for (const [number, author] of [
      [200, 2],
      [201, 4],
    ]) {
      add('note', {
        id: id(number),
        title: 'Original',
        createdBy: { workspaceMemberId: id(author) },
      });
      links.note.set(id(number), [
        { id: id(number + 1000), targetLeadId: id(100) },
      ]);
    }
    await service.execute(context, {
      action: 'updateActivity',
      kind: 'note',
      recordId: id(200),
      expectedUpdatedAt: VERSION,
      changes: { title: 'Updated' },
    });
    await expect(
      service.execute(context, {
        action: 'updateActivity',
        kind: 'note',
        recordId: id(201),
        expectedUpdatedAt: VERSION,
        changes: { title: 'Forged' },
      }),
    ).rejects.toThrow();
    expect(records.note.get(id(201))?.title).toBe('Original');
  });
  it('rejects mixed/unlinked activities even if a record ID is known', async () => {
    const { service, task, links } = build();
    task(200);
    links.task.get(id(200))!.push({ id: id(1201), targetLeadId: id(101) });
    await expect(
      service.execute(context, {
        action: 'updateActivity',
        kind: 'task',
        recordId: id(200),
        expectedUpdatedAt: VERSION,
        changes: { status: 'DONE' },
      }),
    ).rejects.toThrow();
    links.task.set(id(200), []);
    await expect(
      service.execute(context, {
        action: 'updateActivity',
        kind: 'task',
        recordId: id(200),
        expectedUpdatedAt: VERSION,
        changes: { status: 'DONE' },
      }),
    ).rejects.toThrow();
  });
  it('reopens a historical task under the current mapped member', async () => {
    const { service, task, records } = build();
    task(200, 'DONE');
    records.task.get(id(200))!.assigneeId = id(4);
    await service.execute(context, {
      action: 'updateActivity',
      kind: 'task',
      recordId: id(200),
      expectedUpdatedAt: VERSION,
      changes: { status: 'TODO' },
    });
    expect(records.task.get(id(200))?.assigneeId).toBe(id(2));
  });
  it('only permits admins to reassign leads', async () => {
    const { service } = build();
    await expect(service.execute(context, reassign)).rejects.toThrow();
  });
  it('moves open tasks and preserves completed-task attribution', async () => {
    const { service, task, records } = build({ admin: true });
    task(200, 'TODO');
    task(201, 'IN_PROGRESS');
    task(202, 'DONE');
    const result = await service.execute(context, reassign);
    expect(result.record.assignedSalespersonId).toBe(id(11));
    expect(records.task.get(id(200))?.assigneeId).toBe(id(4));
    expect(records.task.get(id(201))?.assigneeId).toBe(id(4));
    expect(records.task.get(id(202))?.assigneeId).toBe(id(2));
  });
  it('blocks unmapped targets, unknown task states and shared history without partial moves', async () => {
    for (const mode of ['unmapped', 'unknown', 'shared']) {
      const { service, task, records, links } = build({ admin: true });
      task(200, mode === 'unknown' ? 'UNKNOWN' : 'TODO');
      if (mode === 'shared')
        links.task.get(id(200))!.push({ id: id(1201), targetLeadId: id(101) });
      await expect(
        service.execute(context, {
          ...reassign,
          salespersonId: mode === 'unmapped' ? id(12) : id(11),
        }),
      ).rejects.toThrow();
      expect(records.lead.get(id(100))?.assignedSalespersonId).toBe(id(10));
      expect(records.task.get(id(200))?.assigneeId).toBe(id(2));
    }
  });
  it('permits a placeholder assignment without open tasks', async () => {
    const { service } = build({ admin: true });
    expect(
      (await service.execute(context, { ...reassign, salespersonId: id(12) }))
        .record.assignedSalespersonId,
    ).toBe(id(12));
  });
  it('transfers tasks when replacing an account mapping', async () => {
    const { service, task, records } = build({ admin: true });
    task(200);
    records.salesperson.get(id(11))!.workspaceMemberId = null;
    await service.execute(context, {
      action: 'mapSalesperson',
      recordId: id(10),
      expectedUpdatedAt: VERSION,
      workspaceMemberId: id(4),
    });
    expect(records.task.get(id(200))?.assigneeId).toBe(id(4));
    expect(records.lead.get(id(100))?.assignedSalespersonId).toBe(id(10));
  });
  it('never blocks mapping removal for unknown status or shared links', async () => {
    const { service, task, records, links } = build({ admin: true });
    task(200, 'UNKNOWN');
    links.task.get(id(200))!.push({ id: id(1201), targetLeadId: id(101) });
    const result = await service.execute(context, {
      action: 'mapSalesperson',
      recordId: id(10),
      expectedUpdatedAt: VERSION,
      workspaceMemberId: null,
    });
    expect(result.reviewRequired).toBe(true);
    expect(records.salesperson.get(id(10))?.workspaceMemberId).toBeNull();
    expect(records.task.get(id(200))?.assigneeId).toBeNull();
    expect(records.lead.get(id(100))?.assignedSalespersonId).toBe(id(10));
  });
  it('does not expose a foreign lead via the access endpoint', async () => {
    const { service } = build();
    await expect(
      service.access(context, { objectName: 'lead', recordId: id(101) }),
    ).rejects.toThrow();
    expect(
      await service.access(context, { objectName: 'lead', recordId: id(100) }),
    ).toMatchObject({ canEdit: true, isAdmin: false });
  });
});

describe('Admin task reopening compatibility', () => {
  it('preserves unlinked personal tasks through the native status action', async () => {
    const { service, records, add, session } = build({ admin: true });
    add('task', { id: id(500), status: 'DONE', assigneeId: id(4) });
    await service.execute(session.context, {
      action: 'updateActivity',
      kind: 'task',
      recordId: id(500),
      expectedUpdatedAt: VERSION,
      changes: { status: 'TODO' },
    });
    expect(records.task.get(id(500))?.status).toBe('TODO');
    expect(records.task.get(id(500))?.assigneeId).toBe(id(4));
  });
});

describe('Visibility snapshot scope', () => {
  it('returns only the current salesperson readable IDs alongside the opaque fingerprint', async () => {
    const { service, session } = build();
    const snapshot = await service.visibility(session.context);
    expect(snapshot).toMatchObject({ isAdmin: false, leadIds: [id(100)] });
    expect(snapshot.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Admin native personal activity access', () => {
  it('keeps a personal task readable/editable without requiring a lead target', async () => {
    const { service, session, add } = build({ admin: true });
    add('task', { id: id(501), title: 'Personal task', status: 'TODO' });
    const access = await service.access(session.context, {
      objectName: 'task',
      recordId: id(501),
    });
    expect(access).toMatchObject({
      isAdmin: true,
      canEdit: true,
      record: { id: id(501) },
    });
  });
});
