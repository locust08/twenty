import { useContext } from 'react';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { SunyieldMappingWarning } from '@/sunyield/components/SunyieldMappingWarning';
import { useSelectFieldDisplay } from '@/object-record/record-field/ui/meta-types/hooks/useSelectFieldDisplay';
import { SelectDisplay } from '@/ui/field/display/components/SelectDisplay/SelectDisplay';
import { isDefined } from 'twenty-shared/utils';

export const SelectFieldDisplay = () => {
  const { recordId } = useContext(FieldContext);
  const { fieldValue, fieldDefinition } = useSelectFieldDisplay();

  const selectedOption = fieldDefinition.metadata.options?.find(
    (option) => option.value === fieldValue,
  );

  if (!isDefined(selectedOption)) {
    return <></>;
  }

  return (
    <>
      <SelectDisplay
        color={selectedOption.color}
        label={selectedOption.label}
      />
      {fieldDefinition.fieldMetadataId ===
        'd068b8ef-e5e9-474f-a31a-f527daf5abfb' && (
        <SunyieldMappingWarning
          recordId={recordId}
          fieldMetadataId={fieldDefinition.fieldMetadataId}
        />
      )}
    </>
  );
};
