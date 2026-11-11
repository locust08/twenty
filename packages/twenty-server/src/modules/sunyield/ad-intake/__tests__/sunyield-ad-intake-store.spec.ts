import { type ObjectRecord } from 'twenty-shared/types';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceTransactionScope } from 'src/engine/twenty-orm/types/workspace-transaction-scope.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';
import { SunyieldAdIntakeStore } from '../sunyield-ad-intake.store';
import { mapMetaLead } from '../sunyield-ad-intake.mapping';
import { META_CONFIG, META_LEAD } from './sunyield-ad-intake.fixtures';

const setup = () => {
  const records: Record<string, ObjectRecord[]> = {
    lead: [],
    note: [],
    noteTarget: [],
  };
  let failTarget = false;
  let tail = Promise.resolve();
  const executed: string[] = [];
  const executeInWorkspaceContext = jest.fn(
    async (
      work: () => Promise<unknown>,
      auth: { type: string; workspace: { id: string } },
    ) => {
      expect(auth).toMatchObject({
        type: 'system',
        workspace: { id: SUNYIELD_WORKSPACE_ID },
      });
      return work();
    },
  );
  const runInWorkspaceTransaction = jest.fn(
    async (
      work: (transaction: WorkspaceTransactionScope) => Promise<unknown>,
    ) => {
      const predecessor = tail;
      let unlock = () => {};
      tail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await predecessor;
      const snapshot = structuredClone(records);
      const repository = (kind: string) => ({
        findOne: jest.fn(
          async (options: {
            withDeleted?: boolean;
            where:
              | { id?: string; submissionId?: string }[]
              | { submissionId: string };
          }) => {
            expect(options.withDeleted).toBe(true);
            const candidates = Array.isArray(options.where)
              ? options.where
              : [options.where];
            return (
              records[kind].find((record) =>
                candidates.some(
                  (where) =>
                    ('id' in where && where.id === record.id) ||
                    where.submissionId === record.submissionId,
                ),
              ) ?? null
            );
          },
        ),
        insert: jest.fn(async (record: ObjectRecord) => {
          if (kind === 'noteTarget' && failTarget)
            throw new Error('target insert failed');
          records[kind].push(record);
          return { generatedMaps: [record] };
        }),
      });
      const transaction = {
        workspaceId: SUNYIELD_WORKSPACE_ID,
        getRepository: repository,
        executeRawQuery: async (sql: string) => {
          executed.push(sql);
          return [];
        },
        afterCommit: () => {},
      } as unknown as WorkspaceTransactionScope;
      try {
        return await work(transaction);
      } catch (error) {
        for (const kind of Object.keys(records)) records[kind] = snapshot[kind];
        throw error;
      } finally {
        unlock();
      }
    },
  );
  const manager = {
    executeInWorkspaceContext,
    runInWorkspaceTransaction,
    getRepository: () => ({ findOne: async () => null }),
  } as unknown as WorkspaceOrmManager;
  return {
    store: new SunyieldAdIntakeStore(manager),
    records,
    executed,
    fail: () => {
      failTarget = true;
    },
    executeInWorkspaceContext,
  };
};
const record = () =>
  mapMetaLead(META_LEAD, META_CONFIG.pages[0], META_CONFIG.pages[0].forms[0]);
describe('SunYield atomic ad intake storage', () => {
  it('creates one native Lead and an attributed linked provenance note in one workspace transaction', async () => {
    const f = setup();
    const input = record();
    await f.store.create(input);
    expect(f.records.lead).toHaveLength(1);
    expect(f.records.note).toHaveLength(1);
    expect(f.records.noteTarget).toHaveLength(1);
    expect(f.records.lead[0]).toMatchObject({
      id: input.identity.id,
      submissionId: input.identity.submissionId,
      source: 'FACEBOOK',
      status: 'NEW',
      assignedSalespersonId: null,
      assignedAt: null,
      assignmentState: 'PENDING',
      createdBy: { source: 'SYSTEM' },
    });
    expect(f.records.note[0]).toMatchObject({
      id: input.identity.noteId,
      title: 'Meta Ads submission',
      createdBy: { source: 'SYSTEM' },
    });
    expect(f.records.note[0].bodyV2.markdown).toContain('qa@example.invalid');
    expect(f.records.noteTarget[0]).toMatchObject({
      id: input.identity.targetId,
      noteId: input.identity.noteId,
      targetLeadId: input.identity.id,
      createdBy: { source: 'SYSTEM' },
    });
    expect(
      f.executed.some((sql) => sql.includes('pg_advisory_xact_lock')),
    ).toBe(true);
  });
  it('serializes concurrent/replayed delivery without rewriting customer edits or resurrecting deleted leads', async () => {
    const f = setup();
    const input = record();
    await Promise.all([f.store.create(input), f.store.create(input)]);
    f.records.lead[0].name = 'Customer edited';
    f.records.lead[0].deletedAt = '2026-11-10T00:00:00Z';
    await f.store.create(input);
    expect(f.records.lead).toHaveLength(1);
    expect(f.records.note).toHaveLength(1);
    expect(f.records.noteTarget).toHaveLength(1);
    expect(f.records.lead[0].name).toBe('Customer edited');
    expect(f.records.lead[0].deletedAt).not.toBeNull();
  });
  it('rolls back the Lead and Note if their provenance link cannot be committed', async () => {
    const f = setup();
    f.fail();
    await expect(f.store.create(record())).rejects.toThrow();
    expect(f.records).toEqual({ lead: [], note: [], noteTarget: [] });
  });
  it('does not permit a forged identity or fixed-source override to reach a transaction', async () => {
    const f = setup();
    const input = record();
    input.identity.id = 'unrelated-record';
    await expect(f.store.create(input)).rejects.toThrow();
    expect(f.executed).toEqual([]);
  });
  it('renders submitted markdown as escaped JSON provenance instead of executable markup', async () => {
    const f = setup();
    const input = record();
    input.answers.custom = ['```\n![image](https://other.invalid)\n```'];
    await f.store.create(input);
    const markdown: string = f.records.note[0].bodyV2.markdown;
    expect(markdown.match(/```/g)).toHaveLength(2);
    expect(markdown).toContain('\\u0060');
    expect(
      JSON.parse(markdown.split('```json\n')[1].split('\n```')[0]).answers,
    ).toEqual(input.answers);
  });
});
