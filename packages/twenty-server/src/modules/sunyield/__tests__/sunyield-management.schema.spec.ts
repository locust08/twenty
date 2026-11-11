import { parseSunyieldManagementRequest } from 'src/modules/sunyield/management/sunyield-management.schema';

const version = {
  recordId: '00000000-0000-4000-8000-000000000001',
  expectedUpdatedAt: '2026-11-04T07:00:00.000Z',
};
const lead = {
  action: 'updateLead',
  ...version,
  changes: { name: 'Corrected customer' },
};

describe('Sunyield management request boundary', () => {
  it('accepts only approved customer edits', () => {
    expect(parseSunyieldManagementRequest(lead)).toEqual(lead);
    expect(
      parseSunyieldManagementRequest({
        ...lead,
        changes: {
          rawPhone: '+60120000000',
          region: 'KLANG_VALLEY',
          electricityBillAmount: {
            amountMicros: '500000000',
            currencyCode: 'MYR',
          },
          phone: {
            primaryPhoneNumber: '120000000',
            primaryPhoneCountryCode: 'MY',
            primaryPhoneCallingCode: '60',
            additionalPhones: [],
          },
        },
      }).action,
    ).toBe('updateLead');
  });
  it.each([
    'assignedSalespersonId',
    'ownerId',
    'assignmentState',
    'assignedAt',
    'source',
    'leadType',
    'legacyId',
    'submissionId',
    'originalLeadDate',
    'updatedBy',
    'createdBy',
    'deletedAt',
    'id',
    'position',
  ])('rejects protected lead field %s', (field) => {
    expect(() =>
      parseSunyieldManagementRequest({
        ...lead,
        changes: { [field]: 'FORGED' },
      }),
    ).toThrow();
  });
  it.each([
    {},
    { name: '' },
    { region: 'ANYWHERE' },
    { electricityBillAmount: { amountMicros: -1, currencyCode: 'MYR' } },
    { phone: { primaryPhoneNumber: '123', workspaceMemberId: 'forged' } },
  ])('rejects malformed or empty lead changes %j', (changes) => {
    expect(() =>
      parseSunyieldManagementRequest({ ...lead, changes }),
    ).toThrow();
  });
  it('rejects forged top-level identity and missing versions', () => {
    expect(() =>
      parseSunyieldManagementRequest({ ...lead, workspaceMemberId: 'forged' }),
    ).toThrow();
    expect(() =>
      parseSunyieldManagementRequest({ ...lead, expectedUpdatedAt: undefined }),
    ).toThrow();
  });
  it('creates an activity with one explicit lead and no selectable assignee', () => {
    const input = {
      action: 'createActivity',
      kind: 'task',
      recordId: version.recordId,
      leadId: '00000000-0000-4000-8000-000000000002',
      title: 'Call tomorrow',
      bodyV2: { markdown: 'Follow up' },
      dueAt: '2026-11-05T01:00:00.000Z',
    };
    expect(parseSunyieldManagementRequest(input)).toEqual(input);
    expect(() =>
      parseSunyieldManagementRequest({
        ...input,
        assigneeId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
    expect(() =>
      parseSunyieldManagementRequest({ ...input, leadIds: [input.leadId] }),
    ).toThrow();
  });
  it('limits note updates to content and task updates to native follow-up fields', () => {
    expect(
      parseSunyieldManagementRequest({
        action: 'updateActivity',
        kind: 'note',
        ...version,
        changes: { title: 'Remark', bodyV2: { markdown: 'Spoke to customer' } },
      }).action,
    ).toBe('updateActivity');
    expect(() =>
      parseSunyieldManagementRequest({
        action: 'updateActivity',
        kind: 'note',
        ...version,
        changes: { dueAt: null },
      }),
    ).toThrow();
    expect(
      parseSunyieldManagementRequest({
        action: 'updateActivity',
        kind: 'task',
        ...version,
        changes: { status: 'DONE', dueAt: null },
      }).action,
    ).toBe('updateActivity');
    expect(() =>
      parseSunyieldManagementRequest({
        action: 'updateActivity',
        kind: 'task',
        ...version,
        changes: { status: 'CANCELLED' },
      }),
    ).toThrow();
    expect(() =>
      parseSunyieldManagementRequest({
        action: 'updateActivity',
        kind: 'task',
        ...version,
        changes: { taskTargets: [] },
      }),
    ).toThrow();
  });
  it('requires explicit admin transition targets and allows mapping removal', () => {
    expect(
      parseSunyieldManagementRequest({
        action: 'reassignLead',
        ...version,
        salespersonId: '00000000-0000-4000-8000-000000000003',
      }).action,
    ).toBe('reassignLead');
    expect(
      parseSunyieldManagementRequest({
        action: 'mapSalesperson',
        ...version,
        workspaceMemberId: null,
      }).action,
    ).toBe('mapSalesperson');
    expect(() =>
      parseSunyieldManagementRequest({
        action: 'mapSalesperson',
        ...version,
        workspaceMemberId: 'not-an-id',
      }),
    ).toThrow();
  });
});
