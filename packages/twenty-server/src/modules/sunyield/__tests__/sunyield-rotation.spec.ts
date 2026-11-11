import { type DataSource } from 'typeorm';
import { PickRecordWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/record-crud/pick-record.workflow-action';
import { type FindRecordsService } from 'src/engine/core-modules/record-crud/services/find-records.service';
import { type GroupByRecordsService } from 'src/engine/core-modules/record-crud/services/group-by-records.service';
import { type WorkflowExecutionContextService } from 'src/modules/workflow/workflow-executor/services/workflow-execution-context.service';
import { type CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { type WorkflowActionInput } from 'src/modules/workflow/workflow-executor/types/workflow-action-input.type';

const SUNYIELD_WORKSPACE_ID = 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6';
const ROTATION_STEP_ID = 'ce86d209-38c0-4f28-8f5c-a1ed5457b223';
const SALESPERSON_A_ID = 'fca35263-38a6-5d8e-b1be-0fbc19ed5860',
  SALESPERSON_B_ID = 'e32c3ed9-18db-5043-b4b8-bcdb5f32e4bf',
  SALESPERSON_C_ID = 'e9f57ed2-bf76-5425-adbe-92cdaa883b67';
type Candidate = { id: string; active: boolean; rotationOrder: number | null };
const getPickedId = (
  output: Awaited<ReturnType<PickRecordWorkflowAction['execute']>>,
) => (output.result && 'id' in output.result ? output.result.id : undefined);
const setup = (
  initial: Candidate[] = [
    { id: SALESPERSON_B_ID, active: true, rotationOrder: 2 },
    { id: SALESPERSON_A_ID, active: true, rotationOrder: 1 },
    { id: SALESPERSON_C_ID, active: true, rotationOrder: 3 },
  ],
) => {
  let records = initial,
    cursor = 0;
  const execute = jest.fn(
    async (input: {
      filter: { active?: { eq: boolean }; id?: { in: string[] } };
    }) => ({
      success: true,
      result: {
        records: records.filter((record) =>
          input.filter.active
            ? record.active
            : input.filter.id?.in.includes(record.id),
        ),
        hasNextPage: false,
      },
    }),
  );
  const incrBy = jest.fn(async () => ++cursor);
  let mappedIds = initial.map((record) => record.id);
  const query = jest.fn(async () => mappedIds.map((id) => ({ id })));
  const action = new PickRecordWorkflowAction(
    { execute } as unknown as FindRecordsService,
    {} as GroupByRecordsService,
    {
      getExecutionContext: async () => ({
        authContext: {},
        rolePermissionConfig: {},
      }),
    } as unknown as WorkflowExecutionContextService,
    { incrBy, expire: async () => undefined } as unknown as CacheStorageService,
    { query } as unknown as DataSource,
  );
  const input = {
    currentStepId: ROTATION_STEP_ID,
    steps: [
      {
        id: ROTATION_STEP_ID,
        type: 'PICK_RECORD',
        settings: {
          input: {
            objectName: 'salesperson',
            strategy: 'ROUND_ROBIN',
            recordIds: [SALESPERSON_A_ID, SALESPERSON_B_ID],
          },
        },
      },
    ],
    context: {},
    runInfo: {
      workspaceId: SUNYIELD_WORKSPACE_ID,
      workflowRunId: '11111111-1111-4111-8111-111111111111',
    },
  } as unknown as WorkflowActionInput;
  return {
    action,
    input,
    execute,
    incrBy,
    query,
    setMappedIds: (value: string[]) => {
      mappedIds = value;
    },
    setRecords: (value: Candidate[]) => {
      records = value;
    },
  };
};
it('rotates by current field order and includes a newly added active salesperson outside legacy IDs', async () => {
  const value = setup();
  const selected = [];
  for (let index = 0; index < 4; index++)
    selected.push(getPickedId(await value.action.execute(value.input)));
  expect(selected).toEqual([
    SALESPERSON_A_ID,
    SALESPERSON_B_ID,
    SALESPERSON_C_ID,
    SALESPERSON_A_ID,
  ]);
});
it('excludes inactive salespeople and responds to live order changes without resetting the counter', async () => {
  const value = setup();
  expect(getPickedId(await value.action.execute(value.input))).toBe(
    SALESPERSON_A_ID,
  );
  value.setRecords([
    { id: SALESPERSON_A_ID, active: false, rotationOrder: 1 },
    { id: SALESPERSON_B_ID, active: true, rotationOrder: 20 },
    { id: SALESPERSON_C_ID, active: true, rotationOrder: 10 },
  ]);
  expect(getPickedId(await value.action.execute(value.input))).toBe(
    SALESPERSON_B_ID,
  );
  expect(getPickedId(await value.action.execute(value.input))).toBe(
    SALESPERSON_C_ID,
  );
});
it.each(
  [
    [],
    [{ id: SALESPERSON_A_ID, active: false, rotationOrder: 1 }],
    [{ id: SALESPERSON_A_ID, active: true, rotationOrder: null }],
    [{ id: SALESPERSON_A_ID, active: true, rotationOrder: 0 }],
    [
      { id: SALESPERSON_A_ID, active: true, rotationOrder: 1 },
      { id: SALESPERSON_B_ID, active: true, rotationOrder: 1 },
    ],
  ].map((records) => ({ records })),
)(
  'fails safely for an empty or invalid active pool %j',
  async ({ records }) => {
    const value = setup(records);
    expect((await value.action.execute(value.input)).error).toBeDefined();
    expect(value.incrBy).not.toHaveBeenCalled();
  },
);
it('uses the existing atomic counter for concurrent eligible picks', async () => {
  const value = setup();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => value.action.execute(value.input)),
  );
  expect(results.map(getPickedId)).toEqual([
    SALESPERSON_A_ID,
    SALESPERSON_B_ID,
    SALESPERSON_C_ID,
    SALESPERSON_A_ID,
    SALESPERSON_B_ID,
    SALESPERSON_C_ID,
  ]);
});
it.each([
  { workspaceId: 'other-workspace', stepId: ROTATION_STEP_ID },
  { workspaceId: SUNYIELD_WORKSPACE_ID, stepId: 'other-step' },
])(
  'retains native UUID ordering and fixed candidates outside the target %j',
  async ({ workspaceId, stepId }) => {
    const value = setup();
    const input = {
      ...value.input,
      currentStepId: stepId,
      steps: value.input.steps.map((step) => ({ ...step, id: stepId })),
      runInfo: { ...value.input.runInfo, workspaceId },
    };
    expect(getPickedId(await value.action.execute(input))).toBe(
      SALESPERSON_B_ID,
    );
    expect(value.query).not.toHaveBeenCalled();
  },
);
it('rejects a truncated dynamic candidate pool instead of rotating only its first page', async () => {
  const value = setup();
  value.execute.mockResolvedValue({
    success: true,
    result: {
      records: [{ id: SALESPERSON_A_ID, active: true, rotationOrder: 1 }],
      hasNextPage: true,
    },
  });
  expect((await value.action.execute(value.input)).error).toBeDefined();
  expect(value.incrBy).not.toHaveBeenCalled();
});

it('skips unmapped active salespeople before validating rotation order', async () => {
  const value = setup();
  value.setMappedIds([SALESPERSON_B_ID, SALESPERSON_C_ID]);
  value.setRecords([
    { id: SALESPERSON_A_ID, active: true, rotationOrder: null },
    { id: SALESPERSON_B_ID, active: true, rotationOrder: 1 },
    { id: SALESPERSON_C_ID, active: true, rotationOrder: 2 },
  ]);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => value.action.execute(value.input)),
  );
  expect(results.map(getPickedId)).toEqual([
    SALESPERSON_B_ID,
    SALESPERSON_C_ID,
    SALESPERSON_B_ID,
    SALESPERSON_C_ID,
  ]);
});
it('leaves an entirely unmapped pool unassigned without advancing rotation', async () => {
  const value = setup();
  value.setMappedIds([]);
  const output = await value.action.execute(value.input);
  expect(output.result).toBeUndefined();
  expect(output.error).toBe(
    'Sunyield rotation has no active salespeople with a valid, unique workspace-member mapping.',
  );
  expect(value.incrBy).not.toHaveBeenCalled();
});
it('rechecks mappings on every pick without resetting the rotation counter', async () => {
  const value = setup();
  expect(getPickedId(await value.action.execute(value.input))).toBe(
    SALESPERSON_A_ID,
  );
  value.setMappedIds([SALESPERSON_C_ID]);
  expect(getPickedId(await value.action.execute(value.input))).toBe(
    SALESPERSON_C_ID,
  );
  value.setMappedIds([SALESPERSON_B_ID, SALESPERSON_C_ID]);
  expect(getPickedId(await value.action.execute(value.input))).toBe(
    SALESPERSON_B_ID,
  );
});
it('does not advance rotation when mapping validation fails', async () => {
  const value = setup();
  value.query.mockRejectedValueOnce(new Error('Mapping lookup unavailable'));
  const output = await value.action.execute(value.input);
  expect(output.result).toBeUndefined();
  expect(output.error).toBeDefined();
  expect(value.incrBy).not.toHaveBeenCalled();
});
