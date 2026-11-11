import { SunyieldRecordPageAccessGate } from '@/sunyield/components/SunyieldRecordPageAccessGate';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { type SunyieldManagementAccess } from '@/sunyield/utils/saveSunyieldManagement';
import { render, screen } from '@testing-library/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { type ReactNode } from 'react';
const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
);
let mockWorkspaceId = SUNYIELD_WORKSPACE_ID;
let mockAccess: SunyieldManagementAccess | undefined;
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ id: mockWorkspaceId }),
}));
jest.mock('@/sunyield/hooks/useSunyieldRecordAccess', () => ({
  useSunyieldRecordAccess: () => mockAccess,
}));
const Page = () => (
  <SunyieldRecordPageAccessGate objectName="lead" recordId="lead-1">
    <h1>Lead details</h1>
  </SunyieldRecordPageAccessGate>
);
beforeEach(() => {
  mockWorkspaceId = SUNYIELD_WORKSPACE_ID;
  mockAccess = undefined;
});
it('withholds the record layout until access is confirmed', () => {
  render(<Page />, { wrapper });
  expect(
    screen.queryByRole('heading', { name: 'Lead details' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Checking access');
});
it('shows the record only while access is confirmed', () => {
  const { rerender } = render(<Page />, { wrapper });
  mockAccess = {
    record: {
      id: 'lead-1',
      updatedAt: '2026-11-10T00:00:00Z',
      deletedAt: null,
    },
    isAdmin: false,
    canEdit: true,
    editableFields: [],
  };
  rerender(<Page />);
  expect(
    screen.getByRole('heading', { name: 'Lead details' }),
  ).toBeInTheDocument();
  mockAccess = undefined;
  rerender(<Page />);
  expect(
    screen.queryByRole('heading', { name: 'Lead details' }),
  ).not.toBeInTheDocument();
});
it('does not gate Locus-T records', () => {
  mockWorkspaceId = 'locus-t';
  render(<Page />, { wrapper });
  expect(
    screen.getByRole('heading', { name: 'Lead details' }),
  ).toBeInTheDocument();
});
