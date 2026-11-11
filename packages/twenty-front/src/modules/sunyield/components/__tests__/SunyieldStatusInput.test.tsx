import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PropsWithChildren, type HTMLAttributes } from 'react';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { FieldInputEventContext } from '@/object-record/record-field/ui/contexts/FieldInputEventContext';
import { SunyieldStatusInput } from '@/sunyield/components/SunyieldStatusInput';
jest.mock('twenty-ui/components/feedback', () => ({
  useToast: () => ({ enqueueToast: jest.fn() }),
}));
jest.mock('twenty-ui/components/navigation', () => ({
  Dropdown: { Root: ({ children }: PropsWithChildren) => <>{children}</> },
}));
jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({
    children,
    onKeyDown,
  }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => (
    <div role="dialog" onKeyDown={onKeyDown}>
      {children}
    </div>
  ),
}));
jest.mock(
  '@/object-record/record-field/ui/contexts/FieldInputAnchorContext',
  () => ({ useFieldInputAnchorContextOrThrow: () => ({}) }),
);
jest.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({ upsertRecordsInStore: jest.fn() }),
}));
jest.mock('@/ui/input/components/SelectInput', () => ({
  SelectInput: () => <button>Follow up</button>,
}));
it.each([false, true])(
  'dismisses with Tab without native persistence (shift=%s)',
  async (shift) => {
    const user = userEvent.setup();
    const onTab = jest.fn();
    render(
      <I18nProvider i18n={i18n}>
        <FieldContext.Provider
          value={
            { fieldDefinition: { label: 'Status' } } as React.ContextType<
              typeof FieldContext
            >
          }
        >
          <FieldInputEventContext.Provider value={{ onTab, onShiftTab: onTab }}>
            <SunyieldStatusInput
              snapshot={{
                id: 'lead',
                status: 'NEW',
                updatedAt: '2026-11-03T00:00:00Z',
                assignedSalespersonId: 'sales',
                deletedAt: null,
              }}
              options={[]}
              onClose={() => {}}
            />
          </FieldInputEventContext.Provider>
        </FieldContext.Provider>
      </I18nProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Follow up' }));
    await user.tab({ shift });
    expect(onTab).toHaveBeenCalledWith({ skipPersist: true });
  },
);
