import { getSunyieldStatusGqlFields } from '@/sunyield/utils/getSunyieldStatusGqlFields';
it('loads ownership and version independently of visible columns', () => {
  expect(
    getSunyieldStatusGqlFields(
      'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6',
      'd3247b81-eece-4d86-825e-b3b2d4d80566',
    ),
  ).toEqual({
    assignedSalespersonId: true,
    status: true,
    updatedAt: true,
    deletedAt: true,
  });
});
it('does not add fields to another workspace or object', () => {
  expect(
    getSunyieldStatusGqlFields('other', 'd3247b81-eece-4d86-825e-b3b2d4d80566'),
  ).toEqual({});
  expect(
    getSunyieldStatusGqlFields('e7e7d4f2-0f82-4a72-a12e-1f61494c61c6', 'other'),
  ).toEqual({});
});
