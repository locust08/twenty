import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useSunyieldRecordAccess } from '@/sunyield/hooks/useSunyieldRecordAccess';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isMetadataWritabilityRestricted } from '@/object-record/read-only/utils/internal/isMetadataWritabilityRestricted';

export const useSunyieldFieldAccess = (
  recordId: string,
  fieldMetadataId: string,
) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const object = objectMetadataItems.find((item) =>
    item.fields.some((field) => field.id === fieldMetadataId),
  );
  const field = object?.fields.find((item) => item.id === fieldMetadataId);
  const permissions = useObjectPermissionsForObject(object?.id ?? '');
  const enabled =
    !!object &&
    ['lead', 'note', 'task'].includes(object.nameSingular) &&
    !permissions.canUpdateObjectRecords;
  const access = useSunyieldRecordAccess(
    object?.nameSingular ?? '',
    recordId,
    enabled,
  );
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );
  return !!(
    enabled &&
    access?.canEdit &&
    field &&
    access.editableFields.includes(field.name) &&
    !isLayoutCustomizationModeEnabled &&
    !object.isRemote &&
    object.isUIEditable !== false &&
    field.isUIEditable !== false &&
    !isMetadataWritabilityRestricted(object.writability) &&
    !isMetadataWritabilityRestricted(field.writability)
  );
};
