import { FieldMetadataType, type ObjectRecord } from 'twenty-shared/types';

import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { type CompiledStatement } from 'src/engine/twenty-orm/sql/utils/compile-named-parameters.util';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

type RepositoryOptions = ConstructorParameters<typeof WorkspaceRepository>[0];

const buildRepository = (
  workspaceId = SUNYIELD_WORKSPACE_ID,
  objectName = 'lead',
  {
    existingRecords = [],
    emitEvents = false,
  }: { existingRecords?: ObjectRecord[]; emitEvents?: boolean } = {},
) => {
  const fields = [
    'id',
    'name',
    'source',
    'leadType',
    'status',
    'assignedSalespersonId',
    'assignedAt',
    'assignmentState',
  ].map((name) =>
    getFlatFieldMetadataMock({
      id: name,
      universalIdentifier: name,
      objectMetadataId: 'lead-object',
      name,
      type:
        name === 'id' || name === 'assignedSalespersonId'
          ? FieldMetadataType.UUID
          : name === 'assignedAt'
            ? FieldMetadataType.DATE_TIME
            : FieldMetadataType.TEXT,
    }),
  );
  const shape: WorkspaceTableShape = {
    objectMetadataId: 'lead-object',
    nameSingular: objectName,
    schemaName: 'workspace_test',
    tableName: '_lead',
    columnNames: fields.map((field) => field.name),
    columnShapeByColumnName: Object.fromEntries(
      fields.map((field) => [
        field.name,
        {
          columnName: field.name,
          fieldName: field.name,
          fieldMetadataId: field.id,
          fieldMetadataType: field.type,
        },
      ]),
    ),
    relationShapeByFieldName: {},
    hasDeletedAtColumn: false,
  };
  const object = getFlatObjectMetadataMock({
    id: 'lead-object',
    universalIdentifier: 'lead-object',
    nameSingular: objectName,
    fieldIds: fields.map((field) => field.id),
    isSystem: true,
  });
  const statements: CompiledStatement[] = [];
  const events: unknown[] = [];
  const repository = new WorkspaceRepository({
    tableShape: shape,
    flatObjectMetadata: object,
    internalContext: {
      workspaceId,
      objectIdByNameSingular: { [objectName]: 'lead-object' },
      featureFlagsMap: {},
      coreDataSource: { getRepository: () => ({}) },
      eventEmitterService: {
        emitDatabaseBatchEvent: (event: unknown) => events.push(event),
      },
      flatFieldMetadataMaps: {
        byUniversalIdentifier: Object.fromEntries(
          fields.map((field) => [field.universalIdentifier, field]),
        ),
        universalIdentifierById: Object.fromEntries(
          fields.map((field) => [field.id, field.universalIdentifier]),
        ),
        universalIdentifiersByApplicationId: {},
      },
      flatObjectMetadataMaps: {
        byUniversalIdentifier: { 'lead-object': object },
        universalIdentifierById: { 'lead-object': 'lead-object' },
        universalIdentifiersByApplicationId: {},
      },
    },
    authContext: { type: 'system', workspace: { id: workspaceId } },
    executor: {
      execute: async (statement: CompiledStatement) => {
        statements.push(statement);
        const rows: ObjectRecord[] =
          emitEvents &&
          statements.some((entry) => entry.text.startsWith('INSERT INTO'))
            ? insertedRecords().map((record) => ({
                ...record,
                id: String(record.id),
              }))
            : existingRecords;
        if (statement.text.startsWith('INSERT INTO'))
          return emitEvents ? rows : [];
        if (!statement.text.startsWith('SELECT')) return [];
        const projections = [
          ...statement.text.matchAll(/"[^"]+"\."([^"]+)" AS "([^"]+)"/g),
        ];
        return projections.length === 0
          ? rows
          : rows.map((row) =>
              Object.fromEntries(
                projections.map(([, column, alias]) => [alias, row[column]]),
              ),
            );
      },
    },
    objectRecordsPermissions: {},
    rolePermissionConfig: { shouldBypassPermissionChecks: true },
    shouldBypassPermissionChecks: true,
    isTransactional: true,
    shouldSkipEventEmission: !emitEvents,
    tableShapeByObjectMetadataId: () => shape,
  } as unknown as RepositoryOptions);

  const insertedRecords = () => {
    const statement = statements.find((entry) =>
      entry.text.startsWith('INSERT INTO'),
    );
    if (!statement) throw new Error('Expected an INSERT statement');
    const match = statement.text.match(
      /INSERT INTO [^(]+\(([^)]+)\)\s+VALUES\s+(.+?)(?:\s+RETURNING|\s+ON CONFLICT|$)/s,
    );
    if (!match) throw new Error('Expected INSERT columns and values');
    const columns = match[1]
      .split(',')
      .map((column) => column.trim().slice(1, -1));
    return [...match[2].matchAll(/\(([^)]+)\)/g)].map((row) =>
      Object.fromEntries(
        row[1]
          .split(',')
          .map((parameter, index) => [
            columns[index],
            parameter.trim() === 'DEFAULT'
              ? undefined
              : statement.values[Number(parameter.trim().slice(1)) - 1],
          ]),
      ),
    );
  };
  return { repository, insertedRecords, statements, events };
};

describe('Sunyield new lead source classification', () => {
  it.each([
    ['FACEBOOK', undefined, 'RESIDENTIAL'],
    ['FACEBOOK', 'COMMERCIAL', 'RESIDENTIAL'],
    ['GOOGLE_ADS', undefined, 'COMMERCIAL'],
    ['GOOGLE_ADS', 'RESIDENTIAL', 'COMMERCIAL'],
  ])(
    'classifies %s before inserting even when the submitted type is %s',
    async (source, leadType, expected) => {
      const { repository, insertedRecords } = buildRepository();
      await repository.insert({ id: 'lead', source, leadType, status: 'NEW' });
      expect(insertedRecords()).toEqual([
        expect.objectContaining({ source, leadType: expected, status: 'NEW' }),
      ]);
    },
  );

  it.each([undefined, null, 'OTHER', 'WEB', 'WEB_POPUP', 'DEMO_LEAD'])(
    'retains source %s as an unassigned review item despite a claimed assignment',
    async (source) => {
      const { repository, insertedRecords } = buildRepository();
      await repository.insert({
        id: 'review-lead',
        name: 'Submitted customer',
        source,
        leadType: 'RESIDENTIAL',
        status: 'NEW',
        assignedSalespersonId: 'salesperson',
        assignedAt: '2026-11-10T00:00:00.000Z',
        assignmentState: 'ASSIGNED',
      });
      expect(insertedRecords()).toEqual([
        expect.objectContaining({
          name: 'Submitted customer',
          leadType: 'UNKNOWN',
          assignedSalespersonId: null,
          assignedAt: null,
          assignmentState: 'NEEDS_REVIEW',
        }),
      ]);
    },
  );

  it('classifies every row in a mixed batch without changing the caller input', async () => {
    const { repository, insertedRecords } = buildRepository();
    const records: Partial<ObjectRecord>[] = [
      { id: 'meta', source: 'FACEBOOK' },
      { id: 'google', source: 'GOOGLE_ADS' },
      { id: 'review', source: 'OTHER' },
    ];
    await repository.insert(records);
    expect(insertedRecords().map((record) => record.leadType)).toEqual([
      'RESIDENTIAL',
      'COMMERCIAL',
      'UNKNOWN',
    ]);
    expect(records).toEqual([
      { id: 'meta', source: 'FACEBOOK' },
      { id: 'google', source: 'GOOGLE_ADS' },
      { id: 'review', source: 'OTHER' },
    ]);
  });

  it('preserves explicit preassignment for a recognized source', async () => {
    const { repository, insertedRecords } = buildRepository();
    await repository.insert({
      id: 'preassigned',
      source: 'FACEBOOK',
      assignedSalespersonId: 'existing',
      assignedAt: '2026-11-10T00:00:00.000Z',
      assignmentState: 'ASSIGNED',
    });
    expect(insertedRecords()).toEqual([
      expect.objectContaining({
        leadType: 'RESIDENTIAL',
        assignedSalespersonId: 'existing',
        assignedAt: '2026-11-10T00:00:00.000Z',
        assignmentState: 'ASSIGNED',
      }),
    ]);
  });

  it.each([
    ['another-workspace', 'lead'],
    [SUNYIELD_WORKSPACE_ID, 'company'],
  ])('does not alter inserts for %s / %s', async (workspaceId, objectName) => {
    const { repository, insertedRecords } = buildRepository(
      workspaceId,
      objectName,
    );
    await repository.insert({
      id: 'unrelated',
      source: 'FACEBOOK',
      leadType: 'COMMERCIAL',
    });
    expect(insertedRecords()).toEqual([
      expect.objectContaining({ source: 'FACEBOOK', leadType: 'COMMERCIAL' }),
    ]);
  });
});

describe('Sunyield source mapping creation boundaries', () => {
  it('publishes normalized classification and review state in the creation event', async () => {
    const { repository, events } = buildRepository(
      SUNYIELD_WORKSPACE_ID,
      'lead',
      { emitEvents: true },
    );
    await repository.insert([
      { id: 'meta-event', source: 'FACEBOOK', leadType: 'COMMERCIAL' },
      {
        id: 'review-event',
        source: 'OTHER',
        leadType: 'RESIDENTIAL',
        assignedSalespersonId: 'claimed',
        assignedAt: '2026-11-10T00:00:00.000Z',
        assignmentState: 'ASSIGNED',
      },
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        action: 'created',
        events: [
          expect.objectContaining({
            recordId: 'meta-event',
            properties: {
              after: expect.objectContaining({ leadType: 'RESIDENTIAL' }),
            },
          }),
          expect.objectContaining({
            recordId: 'review-event',
            properties: {
              after: expect.objectContaining({
                leadType: 'UNKNOWN',
                assignmentState: 'NEEDS_REVIEW',
                assignedSalespersonId: null,
                assignedAt: null,
              }),
            },
          }),
        ],
      }),
    );
  });

  it.each(['save', 'upsert'] as const)(
    'classifies new records in mixed %s without reclassifying an existing record',
    async (method) => {
      const historical = {
        id: 'historical',
        name: 'Original name',
        source: 'DEMO_LEAD',
        leadType: 'RESIDENTIAL',
        assignedSalespersonId: 'existing-owner',
        assignedAt: '2026-11-01T00:00:00.000Z',
        assignmentState: 'ASSIGNED',
      };
      const { repository, insertedRecords, statements } = buildRepository(
        SUNYIELD_WORKSPACE_ID,
        'lead',
        { existingRecords: [historical] },
      );
      const records = [
        { id: 'historical', name: 'Updated name' },
        { id: 'new-google', source: 'GOOGLE_ADS', leadType: 'RESIDENTIAL' },
      ];
      if (method === 'save') await repository.save(records);
      else await repository.upsert(records, ['id']);
      expect(insertedRecords()).toEqual([
        expect.objectContaining({ id: 'new-google', leadType: 'COMMERCIAL' }),
      ]);
      const update = statements.find((statement) =>
        statement.text.startsWith('UPDATE'),
      );
      expect(update).toBeDefined();
      expect(update?.values).toContain('Updated name');
      expect(update?.text).not.toMatch(
        /"(?:leadType|assignedSalespersonId|assignedAt|assignmentState)"\s*=/,
      );
    },
  );
});
