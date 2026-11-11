import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen } from '@testing-library/react';
import { SunyieldMappingWarning } from '@/sunyield/components/SunyieldMappingWarning';

jest.mock('@/sunyield/hooks/useSunyieldStatus', () => ({
  useSunyieldStatus: () => ({ hasMappingConflict: true }),
}));

it('explains why a duplicate mapping prevents Status edits', () => {
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldMappingWarning recordId="lead" fieldMetadataId="status" />
    </I18nProvider>,
  );
  expect(
    screen.getByRole('img', { name: /Multiple salespeople.*admin/i }),
  ).toBeInTheDocument();
});
