import {
  arrangeSunyieldFields,
  getSunyieldNavigationObjects,
} from '@/sunyield/utils/sunyieldLayout';

describe('Sunyield daily layout', () => {
  it('keeps sales focused on leads and follow-ups, preserving admin configuration', () => {
    expect(getSunyieldNavigationObjects(false)).toEqual(['lead', 'task']);
    expect(getSunyieldNavigationObjects(true)).toEqual([
      'lead',
      'task',
      'salesperson',
      'dashboard',
      'workflow',
    ]);
  });
  it('prioritizes contact/status fields without technical identifiers in the lead index', () => {
    const fields = [
      'legacyId',
      'createdAt',
      'name',
      'owner',
      'area',
      'rawPhone',
      'status',
      'leadType',
      'submissionId',
    ];
    expect(
      arrangeSunyieldFields(fields, (field) => field, 'lead', 'index', false),
    ).toEqual(['name', 'status', 'rawPhone', 'area', 'leadType']);
    expect(fields).toContain('legacyId');
  });
  it('retains a compact personal task list and admin assignee visibility', () => {
    const fields = [
      'bodyV2',
      'createdBy',
      'assignee',
      'dueAt',
      'title',
      'status',
      'taskTargets',
    ];
    expect(
      arrangeSunyieldFields(fields, (field) => field, 'task', 'index', false),
    ).toEqual(['title', 'status', 'dueAt', 'taskTargets']);
    expect(
      arrangeSunyieldFields(fields, (field) => field, 'task', 'index', true),
    ).toEqual(['title', 'status', 'dueAt', 'taskTargets', 'assignee']);
  });
  it('keeps unknown objects unchanged and puts rotation settings first for admins', () => {
    const fields = [
      'createdAt',
      'whatsappNumber',
      'name',
      'workspaceMember',
      'rotationOrder',
      'active',
    ];
    expect(
      arrangeSunyieldFields(fields, (field) => field, 'company', 'index', true),
    ).toBe(fields);
    expect(
      arrangeSunyieldFields(
        fields,
        (field) => field,
        'salesperson',
        'index',
        true,
      ),
    ).toEqual([
      'name',
      'active',
      'rotationOrder',
      'workspaceMember',
      'whatsappNumber',
    ]);
  });
});
