import { useSunyieldLayout } from '@/sunyield/hooks/useSunyieldLayout';
import { normalizeSunyieldTaskBody } from '@/sunyield/utils/normalizeSunyieldTaskBody';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useContext } from 'react';

import { type FieldRichTextValue } from '@/object-record/record-field/ui/types/FieldMetadata';
import { assertFieldMetadata } from '@/object-record/record-field/ui/types/guards/assertFieldMetadata';
import { isFieldRichText } from '@/object-record/record-field/ui/types/guards/isFieldRichText';
import { useRecordFieldValue } from '@/object-record/record-store/hooks/useRecordFieldValue';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';

export const useRichTextFieldDisplay = () => {
  const { recordId, fieldDefinition } = useContext(FieldContext);

  assertFieldMetadata(
    FieldMetadataType.RICH_TEXT,
    isFieldRichText,
    fieldDefinition,
  );

  const fieldName = fieldDefinition.metadata.fieldName;

  const fieldValue = useRecordFieldValue<FieldRichTextValue | undefined>(
    recordId,
    fieldName,
    fieldDefinition,
  );

  const { enabled: isSunyield } = useSunyieldLayout();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const isTaskBody = objectMetadataItems.some(
    (object) =>
      object.nameSingular === 'task' &&
      object.fields.some(
        (field) =>
          field.id === fieldDefinition.fieldMetadataId &&
          field.name === 'bodyV2',
      ),
  );
  return {
    fieldDefinition,
    fieldValue:
      isSunyield && isTaskBody
        ? normalizeSunyieldTaskBody(fieldValue)
        : fieldValue,
  };
};
