import { renderHook } from '@testing-library/react';
import { type PropsWithChildren, type ContextType } from 'react';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useIsFieldClearable } from '@/object-record/record-field/ui/hooks/useIsFieldClearable';
jest.mock('@/sunyield/hooks/useSunyieldStatus', () => ({
  useSunyieldStatus: () => ({ isProtectedStatus: true, canEdit: false }),
}));
it('does not clear a protected status even on another owner’s read-only lead', () => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <FieldContext.Provider
      value={
        {
          recordId: 'lead',
          fieldDefinition: { fieldMetadataId: 'status' },
          isLabelIdentifier: false,
        } as ContextType<typeof FieldContext>
      }
    >
      {children}
    </FieldContext.Provider>
  );
  expect(
    renderHook(() => useIsFieldClearable(), { wrapper }).result.current,
  ).toBe(false);
});
