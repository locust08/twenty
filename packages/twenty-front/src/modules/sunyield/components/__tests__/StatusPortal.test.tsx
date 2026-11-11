import { render, screen } from '@testing-library/react';
import { createElement, useContext, type ComponentProps } from 'react';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { RecordInlineCellAnchoredPortal } from '@/object-record/record-inline-cell/components/RecordInlineCellAnchoredPortal';
let mockCanEdit = true;
let mockIsSunyieldWorkspace = true;
let mockNativeReadOnly = true;
let mockRestricted: string[] = [];
jest.mock('@/sunyield/hooks/useSunyieldStatus', () => ({
  useSunyieldStatus: () => ({
    canEdit: mockCanEdit,
    isSunyieldWorkspace: mockIsSunyieldWorkspace,
  }),
}));
jest.mock('@/object-record/read-only/hooks/useIsRecordFieldReadOnly', () => ({
  useIsRecordFieldReadOnly: () => mockNativeReadOnly,
}));
jest.mock(
  '@/object-record/record-store/hooks/useRecordRestrictedFieldNames',
  () => ({ useRecordRestrictedFieldNames: () => mockRestricted }),
);
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));
jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({ objectPermissionsByObjectMetadataId: {} }),
}));
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: jest.fn() }),
}));
jest.mock(
  '@/object-metadata/utils/formatFieldMetadataItemAsColumnDefinition',
  () => ({
    formatFieldMetadataItemAsColumnDefinition: () => ({
      metadata: { fieldName: 'status' },
    }),
  }),
);
jest.mock(
  '@/object-record/record-field/ui/utils/junction/isJunctionRelationForbidden',
  () => ({ isJunctionRelationForbidden: () => false }),
);
jest.mock('@/object-record/utils/getRecordFieldInputId', () => ({
  getRecordFieldInputInstanceId: () => 'status-anchor',
}));
jest.mock(
  '@/object-record/record-inline-cell/components/RecordInlineCellCloseOnSidePanelOpeningEffect',
  () => ({ RecordInlineCellCloseOnSidePanelOpeningEffect: () => null }),
);
const StatusEditor = () => {
  const field = useContext(FieldContext);
  return (
    <button disabled={field.isRecordFieldReadOnly || field.isForbidden}>
      Choose status
    </button>
  );
};
const props = {
  fieldMetadataItem: { id: 'status', name: 'status' },
  objectMetadataItem: { id: 'lead', nameSingular: 'lead' },
  recordId: 'owned-lead',
  instanceIdPrefix: 'record',
} as unknown as Omit<
  ComponentProps<typeof RecordInlineCellAnchoredPortal>,
  'children'
>;
beforeEach(() => {
  mockCanEdit = true;
  mockIsSunyieldWorkspace = true;
  mockNativeReadOnly = true;
  mockRestricted = [];
  const anchor = document.createElement('div');
  anchor.id = 'status-anchor';
  document.body.append(anchor);
});
afterEach(() => {
  document.getElementById('status-anchor')?.remove();
});
it('permits the owned Status dropdown through its anchored portal', () => {
  render(
    createElement(RecordInlineCellAnchoredPortal, {
      ...props,
      children: <StatusEditor />,
    }),
  );
  expect(screen.getByRole('button', { name: 'Choose status' })).toBeEnabled();
});
it('keeps another owner’s Status read-only', () => {
  mockCanEdit = false;
  render(
    createElement(RecordInlineCellAnchoredPortal, {
      ...props,
      children: <StatusEditor />,
    }),
  );
  expect(screen.getByRole('button', { name: 'Choose status' })).toBeDisabled();
});
it('retains restricted-field protection inside the popup', () => {
  mockRestricted = ['status'];
  render(
    createElement(RecordInlineCellAnchoredPortal, {
      ...props,
      children: <StatusEditor />,
    }),
  );
  expect(screen.getByRole('button', { name: 'Choose status' })).toBeDisabled();
});

const renderAssignee = () => {
  const anchor = document.getElementById('status-anchor');
  if (anchor) anchor.textContent = 'Test Sales A';
  render(
    createElement(RecordInlineCellAnchoredPortal, {
      ...props,
      fieldMetadataItem: { ...props.fieldMetadataItem, name: 'assignee' },
      objectMetadataItem: { ...props.objectMetadataItem, nameSingular: 'task' },
      children: <span>Test Sales A</span>,
    }),
  );
};
it('keeps a single stable assignee display when the restricted task field is hovered', () => {
  mockCanEdit = false;
  renderAssignee();
  expect(screen.getAllByText('Test Sales A')).toHaveLength(1);
});
it('preserves native assignee editing for admins', () => {
  mockNativeReadOnly = false;
  renderAssignee();
  expect(screen.getAllByText('Test Sales A')).toHaveLength(2);
});
it('does not alter assignee hover in another workspace', () => {
  mockCanEdit = false;
  mockIsSunyieldWorkspace = false;
  renderAssignee();
  expect(screen.getAllByText('Test Sales A')).toHaveLength(2);
});
