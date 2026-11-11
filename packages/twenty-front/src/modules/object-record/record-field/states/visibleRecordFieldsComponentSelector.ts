import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { permissionFlagMapSelector } from '@/settings/roles/states/permissionFlagMapSelector';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import {
  arrangeSunyieldFields,
  getSunyieldFieldOrder,
} from '@/sunyield/utils/sunyieldLayout';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isActiveFieldMetadataItem } from '@/object-metadata/utils/isActiveFieldMetadataItem';
import { RecordFieldsComponentInstanceContext } from '@/object-record/record-field/states/context/RecordFieldsComponentInstanceContext';
import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { createAtomComponentSelector } from '@/ui/utilities/state/jotai/utils/createAtomComponentSelector';
import { findById } from 'twenty-shared/utils';
import { sortByProperty } from '~/utils/array/sortByProperty';

export const visibleRecordFieldsComponentSelector = createAtomComponentSelector<
  RecordField[]
>({
  key: 'visibleRecordFieldsComponentSelector',
  componentInstanceContext: RecordFieldsComponentInstanceContext,
  get:
    (componentStateKey) =>
    ({ get }) => {
      const currentRecordFields = get(
        currentRecordFieldsComponentState,
        componentStateKey,
      );

      const objectMetadataItems = get(objectMetadataItemsSelector);

      const enabled =
        get(currentWorkspaceState)?.id === SUNYIELD_WORKSPACE_ID &&
        !get(isLayoutCustomizationModeEnabledState);
      const isAdmin = get(permissionFlagMapSelector)[
        PermissionFlagType.WORKSPACE_MEMBERS
      ];
      const object = objectMetadataItems.find((item) =>
        item.fields.some((field) =>
          currentRecordFields.some(
            (recordField) => recordField.fieldMetadataItemId === field.id,
          ),
        ),
      );
      const order =
        enabled && object
          ? getSunyieldFieldOrder(object.nameSingular, 'index', isAdmin)
          : undefined;
      const effectiveFields =
        order && object
          ? currentRecordFields.map((field) => ({
              ...field,
              isVisible: order.includes(
                object.fields.find(
                  (metadata) => metadata.id === field.fieldMetadataItemId,
                )?.name ?? '',
              ),
            }))
          : currentRecordFields;
      const readable = filterVisibleAndReadableRecordFields(
        effectiveFields,
        objectMetadataItems,
      );
      return enabled && object
        ? arrangeSunyieldFields(
            readable,
            (field) =>
              object.fields.find(
                (metadata) => metadata.id === field.fieldMetadataItemId,
              )?.name ?? '',
            object.nameSingular,
            'index',
            isAdmin,
          )
        : readable;
    },
});

const filterVisibleAndReadableRecordFields = (
  currentRecordFields: RecordField[],
  objectMetadataItems: EnrichedObjectMetadataItem[],
): RecordField[] => {
  const filteredVisibleAndReadableRecordFields = currentRecordFields.filter(
    (recordFieldToFilter) => {
      if (!recordFieldToFilter.isVisible) {
        return false;
      }

      const objectMetadataItem = objectMetadataItems.find(
        (objectMetadataItem) =>
          objectMetadataItem.fields.some(
            (fieldMetadataItem) =>
              fieldMetadataItem.id === recordFieldToFilter.fieldMetadataItemId,
          ),
      );

      if (!objectMetadataItem) {
        return false;
      }

      const fieldMetadataItem = objectMetadataItem.fields.find(
        (fieldMetadataItem) =>
          fieldMetadataItem.id === recordFieldToFilter.fieldMetadataItemId,
      );

      if (!fieldMetadataItem) {
        return false;
      }

      const isLabelIdentifier =
        fieldMetadataItem.id ===
        objectMetadataItem.labelIdentifierFieldMetadataId;

      const isActive =
        isLabelIdentifier ||
        isActiveFieldMetadataItem({
          fieldMetadata: fieldMetadataItem,
        });

      const isReadable = objectMetadataItem.readableFields.some(
        findById(fieldMetadataItem.id),
      );

      return isReadable && isActive;
    },
  );

  return [...filteredVisibleAndReadableRecordFields].sort(
    sortByProperty('position'),
  );
};
