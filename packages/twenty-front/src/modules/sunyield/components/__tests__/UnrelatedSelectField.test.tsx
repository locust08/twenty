import { render, screen } from '@testing-library/react';
import { SelectFieldDisplay } from '@/object-record/record-field/ui/meta-types/display/components/SelectFieldDisplay';
jest.mock(
  '@/object-record/record-field/ui/meta-types/hooks/useSelectFieldDisplay',
  () => ({
    useSelectFieldDisplay: () => ({
      fieldValue: 'NEW',
      fieldDefinition: {
        fieldMetadataId: 'unrelated',
        metadata: { options: [{ value: 'NEW', label: 'New', color: 'green' }] },
      },
    }),
  }),
);
it('renders unrelated select fields without Sunyield authentication or data providers', () => {
  render(<SelectFieldDisplay />);
  expect(screen.getByText('New')).toBeInTheDocument();
});
