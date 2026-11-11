import { useSunyieldLayout } from '@/sunyield/hooks/useSunyieldLayout';
import { getSunyieldNavigationObjects } from '@/sunyield/utils/sunyieldLayout';
import { getObjectMetadataForNavigationMenuItem } from '@/navigation-menu-item/display/object/utils/getObjectMetadataForNavigationMenuItem';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useNavigationObjectMetadataItems } from '@/navigation-menu-item/common/hooks/useNavigationObjectMetadataItems';
import { flattenNavigationMenuItemsWithFolderChildren } from '@/navigation-menu-item/common/utils/flattenNavigationMenuItemsWithFolderChildren';
import { getWorkspaceSidebarOrphanItemsInDisplayOrder } from '@/navigation-menu-item/display/utils/getWorkspaceSidebarOrphanItemsInDisplayOrder';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';

import { useNavigationMenuItemsByFolder } from '@/navigation-menu-item/display/folder/hooks/useNavigationMenuItemsByFolder';
import { useNavigationMenuItemsData } from './useNavigationMenuItemsData';
import { useSortedNavigationMenuItems } from './useSortedNavigationMenuItems';

export type NavigationMenuItemClickParams = {
  item: NavigationMenuItem;
  objectMetadataItem?: EnrichedObjectMetadataItem | null;
};

export const useNavigationMenuItemSectionItems = (): NavigationMenuItem[] => {
  const { workspaceNavigationMenuItems } = useNavigationMenuItemsData();
  const { workspaceNavigationMenuItemsSorted } = useSortedNavigationMenuItems();
  const { workspaceNavigationMenuItemsByFolder } =
    useNavigationMenuItemsByFolder();
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );
  const views = useAtomStateValue(viewsSelector);
  const objectMetadataItems = useNavigationObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const flatItems = getWorkspaceSidebarOrphanItemsInDisplayOrder({
    workspaceNavigationMenuItems,
    workspaceNavigationMenuItemsSorted,
    objectMetadataItems,
    views,
    objectPermissionsByObjectMetadataId,
    includeInaccessibleObjectBackedItems: isLayoutCustomizationModeEnabled,
  });

  const { enabled, isAdmin } = useSunyieldLayout();
  const result = flattenNavigationMenuItemsWithFolderChildren(
    flatItems,
    workspaceNavigationMenuItemsByFolder,
  );
  if (!enabled || isLayoutCustomizationModeEnabled) return result;
  const order = getSunyieldNavigationObjects(isAdmin);
  return result.sort((first, second) => {
    const priority = (item: NavigationMenuItem) => {
      const object = getObjectMetadataForNavigationMenuItem(
        item,
        objectMetadataItems,
        views,
      );
      const index = order.indexOf(object?.nameSingular ?? '');
      return index < 0 ? order.length : index;
    };
    return priority(first) - priority(second);
  });
};
