import { useSunyieldStatus } from '@/sunyield/hooks/useSunyieldStatus';
import { useContext } from 'react';

import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';

// TODO: have a better clearable settings in metadata ?
// We might want to define what's clearable in the metadata
// Instead of passing it in the context
// See: https://github.com/twentyhq/twenty/issues/4403
export const useIsFieldClearable = (): boolean => {
  const { clearable, isLabelIdentifier, recordId, fieldDefinition } =
    useContext(FieldContext);
  const { isProtectedStatus } = useSunyieldStatus({
    recordId,
    fieldMetadataId: fieldDefinition?.fieldMetadataId ?? '',
  });

  const fieldCanBeCleared =
    !isProtectedStatus && !isLabelIdentifier && clearable !== false;

  return fieldCanBeCleared;
};
