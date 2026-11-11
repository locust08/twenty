import { canEditSunyieldStatus } from '@/sunyield/utils/canEditSunyieldStatus';
const ownLead = {
  workspaceId: 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6',
  objectMetadataId: 'd3247b81-eece-4d86-825e-b3b2d4d80566',
  fieldName: 'status',
  memberId: '07ce7457-93b2-547e-889b-a45a2f2bbc1a',
  assignedSalespersonId: '7d4447c3-e2f6-5b70-9e2c-e32800f88263',
  mapping: {
    memberId: '07ce7457-93b2-547e-889b-a45a2f2bbc1a',
    salespersonIds: ['7d4447c3-e2f6-5b70-9e2c-e32800f88263'],
  },
  updatedAt: '2026-11-03T00:00:00.000Z',
  deletedAt: null,
  nativeCanUpdate: false,
};
describe('Sunyield inline status eligibility', () => {
  it('allows the mapped salesperson to edit their own lead status', () => {
    expect(canEditSunyieldStatus(ownLead)).toBe(true);
  });
  it('accepts a newly mapped member without a code change', () => {
    expect(
      canEditSunyieldStatus({
        ...ownLead,
        memberId: 'new-member',
        assignedSalespersonId: 'new-salesperson',
        mapping: {
          memberId: 'new-member',
          salespersonIds: ['new-salesperson'],
        },
      }),
    ).toBe(true);
  });
  it.each([
    { mapping: undefined },
    { mapping: { memberId: ownLead.memberId, salespersonIds: [] } },
    {
      mapping: {
        memberId: ownLead.memberId,
        salespersonIds: [ownLead.assignedSalespersonId, 'duplicate'],
      },
    },
    { workspaceId: 'other' },
    { objectMetadataId: 'other' },
    { fieldName: 'assignedSalesperson' },
    { memberId: 'unmapped' },
    { memberId: undefined },
    { assignedSalespersonId: 'other' },
    { assignedSalespersonId: null },
    { updatedAt: undefined },
    { deletedAt: '2026-11-03T00:00:00Z' },
    { nativeCanUpdate: true },
  ])('does not enable protected editing for %j', (change) => {
    expect(canEditSunyieldStatus({ ...ownLead, ...change })).toBe(false);
  });
});
