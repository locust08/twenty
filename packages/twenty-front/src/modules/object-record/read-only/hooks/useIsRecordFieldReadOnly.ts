import { useSunyieldFieldAccess } from '@/sunyield/hooks/useSunyieldFieldAccess';
import { useObjectMetadataItemById } from '@/object-metadata/hooks/useObjectMetadataItemById';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useIsRecordReadOnly } from '@/object-record/read-only/hooks/useIsRecordReadOnly';
import { isRecordFieldReadOnly } from '@/object-record/read-only/utils/isRecordFieldReadOnly';
import { useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

export type UseFieldIsReadOnlyParams = {
  fieldMetadataId: string;
  objectMetadataId: string;
  recordId: string;
};

export const useIsRecordFieldReadOnly = ({
  fieldMetadataId,
  objectMetadataId,
  recordId,
}: UseFieldIsReadOnlyParams) => {
  const canManageField = useSunyieldFieldAccess(recordId, fieldMetadataId);
  const { objectMetadataItem } = useObjectMetadataItemById({
    objectId: objectMetadataId,
  });

  const fieldMetadataItem = objectMetadataItem.fields.find(
    (field) => field.id === fieldMetadataId,
  );

  const fieldDefinition = useMemo(
    () =>
      isDefined(fieldMetadataItem)
        ? formatFieldMetadataItemAsFieldDefinition({
            field: fieldMetadataItem,
            objectMetadataItem,
          })
        : undefined,
    [fieldMetadataItem, objectMetadataItem],
  );

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const isRecordReadOnly = useIsRecordReadOnly({
    recordId,
    objectMetadataId,
  });

  if (!isDefined(fieldMetadataItem)) {
    return false;
  }

  if (canManageField) return false;

  return isRecordFieldReadOnly({
    isRecordReadOnly,
    objectMetadataId,
    fieldMetadataItem,
    fieldDefinition,
    objectPermissionsByObjectMetadataId,
  });
};
