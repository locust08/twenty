import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { FieldMetadataType } from 'twenty-shared/types';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { type CompiledStatement } from 'src/engine/twenty-orm/sql/utils/compile-named-parameters.util';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

type RepositoryOptions = ConstructorParameters<typeof WorkspaceRepository>[0];

const build = (type = 'user', objectName = 'lead', admin = false) => {
  const shape: WorkspaceTableShape = {
    objectMetadataId: 'lead-object',
    nameSingular: objectName,
    schemaName: 'workspace_test',
    tableName: '_lead',
    columnNames: ['id', 'deletedAt', 'assignedSalespersonId'],
    columnShapeByColumnName: Object.fromEntries(
      ['id', 'deletedAt', 'assignedSalespersonId'].map((columnName) => [
        columnName,
        {
          columnName,
          fieldName: columnName,
          fieldMetadataId: columnName,
          fieldMetadataType: FieldMetadataType.UUID,
        },
      ]),
    ),
    relationShapeByFieldName: {},
    hasDeletedAtColumn: true,
  };
  const fields = shape.columnNames.map((name) =>
    getFlatFieldMetadataMock({
      id: name,
      universalIdentifier: name,
      objectMetadataId: 'lead-object',
      name,
      type: FieldMetadataType.UUID,
    }),
  );
  const object = getFlatObjectMetadataMock({
    fieldIds: fields.map((field) => field.id),
    id: 'lead-object',
    universalIdentifier: 'lead-object',
    nameSingular: objectName,
  });
  const statements: CompiledStatement[] = [];
  const repository = new WorkspaceRepository({
    tableShape: shape,
    flatObjectMetadata: object,
    internalContext: {
      workspaceId: SUNYIELD_WORKSPACE_ID,
      featureFlagsMap: {},
      coreDataSource: { getRepository: () => ({}) },
      eventEmitterService: { emitDatabaseBatchEvent: jest.fn() },
      flatFieldMetadataMaps: {
        byUniversalIdentifier: Object.fromEntries(
          fields.map((field) => [field.universalIdentifier, field]),
        ),
        universalIdentifierById: Object.fromEntries(
          fields.map((field) => [field.id, field.universalIdentifier]),
        ),
        universalIdentifiersByApplicationId: {},
      },
      objectIdByNameSingular: { lead: 'lead-object' },
      flatObjectMetadataMaps: {
        byUniversalIdentifier: { 'lead-object': object },
        universalIdentifierById: { 'lead-object': 'lead-object' },
      },
    },
    authContext: {
      type,
      workspace: { id: SUNYIELD_WORKSPACE_ID },
      user: { id: 'user-id' },
      userWorkspaceId: 'membership-id',
      workspaceMemberId: 'member-id',
    } as WorkspaceAuthContext,
    executor: {
      execute: async (statement: CompiledStatement) => {
        statements.push(statement);
        if (
          statement.text.startsWith('SELECT id FROM core.\"userWorkspace\"') ||
          statement.text.startsWith(
            'SELECT id FROM \"workspace_test\".\"workspaceMember\"',
          )
        )
          return [{ id: 'active' }];
        if (statement.text.startsWith('SELECT (r.'))
          return [{ isAdmin: admin }];
        if (
          admin &&
          statement.text.startsWith('SELECT') &&
          statement.text.includes('FROM \"workspace_test\".\"_lead\"')
        )
          return [
            {
              id: 'lead',
              assignedSalespersonId: 'old',
              status: 'NEW',
              leadType: 'RESIDENTIAL',
            },
          ];
        return [];
      },
    },
    objectRecordsPermissions: {},
    rolePermissionConfig: { shouldBypassPermissionChecks: true },
    shouldBypassPermissionChecks: true,
    isTransactional: true,
    shouldSkipEventEmission: true,
    tableShapeByObjectMetadataId: () => shape,
    flatObjectMetadataByObjectMetadataId: () => object,
  } as unknown as RepositoryOptions);
  return { repository, statements };
};

describe('Sunyield actual repository visibility', () => {
  it('denies bypassed native Sales writes before executing an UPDATE', async () => {
    const { repository, statements } = build();
    await expect(
      repository.update('lead', { assignedSalespersonId: 'new' }),
    ).rejects.toThrow('Use the authorized Sunyield management action');
    expect(
      statements.some((statement) => statement.text.startsWith('UPDATE')),
    ).toBe(false);
  });
  it('requires an admin reassignment to use the task-transfer service', async () => {
    const { repository, statements } = build('user', 'lead', true);
    await expect(
      repository.update('lead', { assignedSalespersonId: 'new' }),
    ).rejects.toThrow('Reassign leads through Sunyield management');
    expect(
      statements.some((statement) => statement.text.startsWith('UPDATE')),
    ).toBe(false);
  });

  it('guards user reads even on a bypass repository', async () => {
    const { repository, statements } = build();
    await repository.find({ select: { id: true } });
    expect(statements[0].text).toContain('"assignedSalespersonId"');
    expect(statements[0].values).toContain('member-id');
    expect(statements[0].values).toContain('membership-id');
  });
  it('keeps OR conditions inside an independently guarded expression', async () => {
    const { repository, statements } = build();
    await repository
      .createQueryBuilder()
      .select(['id'])
      .where('"lead"."id"=:first', { first: 'first' })
      .orWhere('"lead"."id"=:second', { second: 'second' })
      .getMany();
    expect(statements[0].text).toMatch(/OR.*AND.*core\."userWorkspace"/s);
  });
  it('guards cloned count queries without duplicating policy', async () => {
    const { repository, statements } = build();
    const query = repository
      .createQueryBuilder()
      .select(['id'])
      .applyRowLevelPermissions();
    await query.clone().getCount();
    expect(statements[0].text.split('core."userWorkspace"')).toHaveLength(2);
    expect(statements[0].text).toContain('"assignedSalespersonId"');
  });
  it('preserves system automation reads', async () => {
    const { repository, statements } = build('system');
    await repository.find({ select: { id: true } });
    expect(statements[0].text).not.toContain('core."userWorkspace"');
  });
  it('does not change unrelated objects', async () => {
    const { repository, statements } = build('user', 'company');
    await repository.find({ select: { id: true } });
    expect(statements[0].text).not.toContain('core."userWorkspace"');
  });
});
