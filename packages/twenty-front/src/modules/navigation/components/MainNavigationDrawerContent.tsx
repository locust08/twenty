import { useSunyieldLayout } from '@/sunyield/hooks/useSunyieldLayout';
import { MainNavigationDrawerNavigationContent } from '@/navigation/components/MainNavigationDrawerNavigationContent';
import { NavigationDrawerTabbedContent } from '@/navigation/components/NavigationDrawerTabbedContent';
import { useActiveNavigationDrawerMode } from '@/navigation/hooks/useActiveNavigationDrawerMode';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { NavigationDrawerScrollableContent } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerScrollableContent';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const MainNavigationDrawerContent = () => {
  const { enabled: isSunyield } = useSunyieldLayout();
  const activeNavigationDrawerMode = useActiveNavigationDrawerMode();
  const hasAiPermission = useHasPermissionFlag(PermissionFlagType.AI);

  const showAiChatContent =
    hasAiPermission &&
    !isSunyield &&
    activeNavigationDrawerMode === NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY;

  return (
    <NavigationDrawerScrollableContent>
      <NavigationDrawerTabbedContent
        showAiChatContent={showAiChatContent}
        shouldMountAiChatContent={hasAiPermission && !isSunyield}
        navigationContent={<MainNavigationDrawerNavigationContent />}
      />
    </NavigationDrawerScrollableContent>
  );
};
