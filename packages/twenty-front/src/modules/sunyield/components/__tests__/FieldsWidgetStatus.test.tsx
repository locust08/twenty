import { render, screen } from '@testing-library/react';
import { createElement, useContext, type ComponentProps } from 'react';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { FieldsWidgetFieldItem } from '@/page-layout/widgets/fields/components/FieldsWidgetFieldItem';
jest.mock('@/sunyield/hooks/useSunyieldStatus', () => ({
  useSunyieldStatus: () => ({ isProtectedStatus: true, canEdit: true }),
}));
jest.mock(
  '@/object-metadata/utils/formatFieldMetadataItemAsColumnDefinition',
  () => ({
    formatFieldMetadataItemAsColumnDefinition: () => ({
      metadata: { fieldName: 'status' },
      fieldMetadataId: 'status',
    }),
  }),
);
jest.mock('@/object-record/read-only/utils/isRecordFieldReadOnly', () => ({
  isRecordFieldReadOnly: () => true,
}));
jest.mock(
  '@/object-record/record-field/ui/utils/junction/isJunctionRelationForbidden',
  () => ({ isJunctionRelationForbidden: () => false }),
);
jest.mock(
  '@/object-record/record-inline-cell/components/RecordInlineCell',
  () => ({
    RecordInlineCell: () => {
      const field = useContext(FieldContext);
      return <button disabled={field.isRecordFieldReadOnly}>Status</button>;
    },
  }),
);
const props = {
  fieldMetadataItem: { id: 'status', name: 'status' },
  globalIndex: 0,
  recordId: 'lead',
  restrictedFieldNames: [],
  objectMetadataItem: { id: 'leadObject' },
  objectMetadataItems: [],
  objectPermissionsByObjectMetadataId: {},
  isRecordReadOnly: true,
  useUpdateRecord: () => [() => {}, {}],
  recordLoading: false,
  instanceId: 'record',
  onMouseEnter: () => {},
} as unknown as ComponentProps<typeof FieldsWidgetFieldItem>;
it('opens owned Status on the actual record-page widget', () => {
  render(createElement(FieldsWidgetFieldItem, props));
  expect(screen.getByRole('button', { name: 'Status' })).toBeEnabled();
});
it('retains field restrictions on the record page', () => {
  render(
    createElement(FieldsWidgetFieldItem, {
      ...props,
      restrictedFieldNames: ['status'],
    }),
  );
  expect(screen.getByRole('button', { name: 'Status' })).toBeDisabled();
});
