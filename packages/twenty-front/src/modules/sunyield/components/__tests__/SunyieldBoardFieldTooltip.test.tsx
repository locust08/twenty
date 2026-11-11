import { SunyieldBoardFieldTooltip } from '@/sunyield/components/SunyieldBoardFieldTooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
let mockEnabled = true;
jest.mock('@/sunyield/hooks/useSunyieldLayout', () => ({
  useSunyieldLayout: () => ({ enabled: mockEnabled }),
}));
beforeEach(() => {
  mockEnabled = true;
});
it.each([
  ['rawPhone', 'Raw phone', 'Customer phone'],
  ['area', 'Area', 'Area'],
  ['leadType', 'Lead type', 'Lead type'],
])('labels the whole %s value on hover', async (fieldName, label, expected) => {
  const user = userEvent.setup();
  render(
    <SunyieldBoardFieldTooltip
      objectName="lead"
      fieldName={fieldName}
      label={label}
    >
      <span>Field value</span>
    </SunyieldBoardFieldTooltip>,
  );
  await user.hover(screen.getByText('Field value'));
  expect(await screen.findByRole('tooltip')).toHaveTextContent(expected);
});
it('does not add lead tooltips in another workspace', async () => {
  mockEnabled = false;
  const user = userEvent.setup();
  render(
    <SunyieldBoardFieldTooltip objectName="lead" fieldName="area" label="Area">
      <span>Field value</span>
    </SunyieldBoardFieldTooltip>,
  );
  await user.hover(screen.getByText('Field value'));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
