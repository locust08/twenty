import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';
import { buildSunyieldRowVisibility } from 'src/modules/sunyield/permissions/sunyield-row-visibility';

const user = {
  type: 'user',
  workspace: { id: SUNYIELD_WORKSPACE_ID },
  user: { id: '00000000-0000-4000-8000-000000000001' },
  userWorkspaceId: '00000000-0000-4000-8000-000000000002',
  workspaceMemberId: '00000000-0000-4000-8000-000000000003',
} as WorkspaceAuthContext;

const input = {
  workspaceId: SUNYIELD_WORKSPACE_ID,
  authContext: user,
  objectName: 'lead',
  tableAlias: 'lead',
  schemaName: 'workspace_test',
  targetColumns: ['targetLeadId', 'targetPersonId'],
};

describe('Sunyield row visibility', () => {
  it('preserves only live verified Twenty standard automation, excluding agents', () => {
    const application = {
      id: 'standard-app',
      workspaceId: SUNYIELD_WORKSPACE_ID,
      universalIdentifier: TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      deletedAt: null,
    };
    const context = {
      type: 'application',
      workspace: user.workspace,
      application,
    } as WorkspaceAuthContext;
    const policy = buildSunyieldRowVisibility({
      ...input,
      authContext: context,
    });
    expect(policy?.sql).toContain('core.\"application\"');
    expect(policy?.parameters).toMatchObject({
      sunyieldAutomationId: 'standard-app',
    });
    expect(
      buildSunyieldRowVisibility({
        ...input,
        authContext: { ...context, agentId: 'agent' } as WorkspaceAuthContext,
      })?.sql,
    ).toBe('FALSE');
  });

  it('fails closed for a mismatched workspace context', () => {
    expect(
      buildSunyieldRowVisibility({
        ...input,
        authContext: {
          ...user,
          workspace: { id: 'other' },
        } as WorkspaceAuthContext,
      })?.sql,
    ).toBe('FALSE');
  });
  it('does not expose deleted activity records to Sales', () => {
    expect(
      buildSunyieldRowVisibility({ ...input, objectName: 'note' })?.sql,
    ).toContain('"lead"."deletedAt" IS NULL');
  });

  it('does not affect other workspaces or unrelated objects', () => {
    expect(
      buildSunyieldRowVisibility({ ...input, workspaceId: 'other' }),
    ).toBeNull();
    expect(
      buildSunyieldRowVisibility({
        ...input,
        objectName: 'company',
        targetColumns: [],
      }),
    ).toBeNull();
  });

  it('retains explicitly trusted system operations', () => {
    expect(
      buildSunyieldRowVisibility({
        ...input,
        authContext: { type: 'system', workspace: user.workspace },
      }),
    ).toBeNull();
  });

  it.each(['apiKey', 'application', 'pendingActivationUser'] as const)(
    'fails closed for a %s principal',
    (type) => {
      const policy = buildSunyieldRowVisibility({
        ...input,
        authContext: {
          type,
          workspace: user.workspace,
        } as WorkspaceAuthContext,
      });
      expect(policy?.sql).toBe('FALSE');
    },
  );

  it('does not let an agent act as its admin user', () => {
    const policy = buildSunyieldRowVisibility({
      ...input,
      authContext: { ...user, agentId: 'agent' } as WorkspaceAuthContext,
    });
    expect(policy?.sql).toBe('FALSE');
  });

  it('checks membership and canonical admin using bound values, not cached roles', () => {
    const policy = buildSunyieldRowVisibility(input);
    expect(policy?.parameters).toMatchObject({
      sunyieldUserId: '00000000-0000-4000-8000-000000000001',
      sunyieldUserWorkspaceId: '00000000-0000-4000-8000-000000000002',
      sunyieldMemberId: '00000000-0000-4000-8000-000000000003',
      sunyieldWorkspaceId: SUNYIELD_WORKSPACE_ID,
    });
    expect(policy?.sql).toContain('core."userWorkspace"');
    expect(policy?.sql).toContain('core."roleTarget"');
    expect(policy?.sql).toContain('"universalIdentifier"');
    expect(policy?.sql).toContain('"isEditable" = false');
    expect(policy?.sql).not.toContain(SUNYIELD_WORKSPACE_ID);
  });

  it('uses exactly one nondeleted mapping and assigned salesperson rather than Owner or Active', () => {
    const sql = buildSunyieldRowVisibility(input)?.sql;
    expect(sql).toContain('count(*)');
    expect(sql).toContain('"assignedSalespersonId"');
    expect(sql).toContain('"workspaceMemberId"');
    expect(sql).not.toContain('"ownerId"');
    expect(sql).not.toContain('"active"');
  });

  it.each(['note', 'task'])(
    'requires visible lead targets and rejects mixed targets for %s',
    (objectName) => {
      const sql = buildSunyieldRowVisibility({ ...input, objectName })?.sql;
      expect(sql).toContain('"targetLeadId"');
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('"targetPersonId"');
      expect(sql).toContain('"deletedAt" IS NULL');
    },
  );

  it.each(['noteTarget', 'taskTarget'])(
    'checks direct %s rows instead of exposing raw targets',
    (objectName) => {
      const sql = buildSunyieldRowVisibility({ ...input, objectName })?.sql;
      expect(sql).toContain('"lead"."targetLeadId"');
      expect(sql).toContain('"lead"."targetPersonId" IS NULL');
    },
  );

  it('fails closed when target metadata cannot identify the custom lead relation', () => {
    const sql = buildSunyieldRowVisibility({
      ...input,
      objectName: 'taskTarget',
      targetColumns: ['targetPersonId'],
    })?.sql;
    expect(sql).toContain('FALSE');
  });

  it.each(['attachment', 'workflowRun'])(
    'keeps potentially hidden %s snapshots admin-only',
    (objectName) => {
      const sql = buildSunyieldRowVisibility({ ...input, objectName })?.sql;
      expect(sql).toContain('core."roleTarget"');
      expect(sql).not.toContain('"assignedSalespersonId"');
    },
  );

  it('escapes aliases and schema names', () => {
    const sql = buildSunyieldRowVisibility({
      ...input,
      tableAlias: 'lead"alias',
      schemaName: 'workspace"test',
    })?.sql;
    expect(sql).toContain('"lead""alias"');
    expect(sql).toContain('"workspace""test"');
  });
});
