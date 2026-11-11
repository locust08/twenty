import { useSunyieldLayout } from '@/sunyield/hooks/useSunyieldLayout';
import { getSunyieldNavigationObjects } from '@/sunyield/utils/sunyieldLayout';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useNavigationObjectMetadataItems = () => {
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);

  const { enabled, isAdmin } = useSunyieldLayout();
  const allowed = getSunyieldNavigationObjects(isAdmin);

  return objectMetadataItems.filter(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular !==
        CoreObjectNameSingular.WorkflowVersion &&
      (!enabled || allowed.includes(objectMetadataItem.nameSingular)),
  );
};
