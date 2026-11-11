jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ canUpdateObjectRecords: false }),
}));
import { renderHook } from '@testing-library/react';
import { useSunyieldFieldAccess } from '@/sunyield/hooks/useSunyieldFieldAccess';
let mockAccess: { canEdit: boolean; editableFields: string[] } | undefined;
let mockLayout = false;
const mockObject = {
  nameSingular: 'lead',
  isUIEditable: true,
  isRemote: false,
  writability: 'OPEN',
  fields: [
    { id: 'name', name: 'name', isUIEditable: true, writability: 'OPEN' },
    {
      id: 'owner',
      name: 'assignedSalespersonId',
      isUIEditable: true,
      writability: 'OPEN',
    },
  ],
};
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [mockObject] }),
}));
jest.mock('@/sunyield/hooks/useSunyieldRecordAccess', () => ({
  useSunyieldRecordAccess: () => mockAccess,
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockLayout,
}));
describe('Sunyield native field access', () => {
  beforeEach(() => {
    mockAccess = { canEdit: true, editableFields: ['name'] };
    mockLayout = false;
  });
  it('opens the approved customer field', () => {
    expect(
      renderHook(() => useSunyieldFieldAccess('lead', 'name')).result.current,
    ).toBe(true);
  });
  it('keeps ownership read-only for sales', () => {
    expect(
      renderHook(() => useSunyieldFieldAccess('lead', 'owner')).result.current,
    ).toBe(false);
  });
  it('fails closed while access is unknown or revoked', () => {
    mockAccess = undefined;
    expect(
      renderHook(() => useSunyieldFieldAccess('lead', 'name')).result.current,
    ).toBe(false);
  });
  it('preserves layout customization restrictions', () => {
    mockLayout = true;
    expect(
      renderHook(() => useSunyieldFieldAccess('lead', 'name')).result.current,
    ).toBe(false);
  });
  it('does not let an inherited note reader edit history', () => {
    mockAccess = { canEdit: false, editableFields: ['name'] };
    expect(
      renderHook(() => useSunyieldFieldAccess('lead', 'name')).result.current,
    ).toBe(false);
  });
});
