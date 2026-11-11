import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { mockCurrentWorkspace } from '~/testing/mock-data/users';
import { useActiveNavigationDrawerMode } from '@/navigation/hooks/useActiveNavigationDrawerMode';
import { navigationDrawerActiveTabState } from '@/ui/navigation/states/navigationDrawerActiveTabState';
import {
  type NavigationDrawerActiveTab,
  NAVIGATION_DRAWER_TABS,
} from '@/ui/navigation/states/navigationDrawerTabs';
import { renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

const renderActiveNavigationDrawerMode = ({
  pathname,
  activeTab = NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
  isSunyield = false,
}: {
  pathname: string;
  activeTab?: NavigationDrawerActiveTab;
  isSunyield?: boolean;
}) => {
  const store = createStore();
  if (isSunyield)
    store.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6',
    });

  store.set(navigationDrawerActiveTabState.atom, activeTab);

  return renderHook(() => useActiveNavigationDrawerMode(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>
        <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>
      </Provider>
    ),
  });
};

describe('useActiveNavigationDrawerMode', () => {
  it('is the settings mode on a settings page', () => {
    const { result } = renderActiveNavigationDrawerMode({
      pathname: '/settings/profile',
      activeTab: NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
    });

    expect(result.current).toBe(NAVIGATION_DRAWER_TABS.SETTINGS);
  });

  it('is the AI mode on the AI chat page', () => {
    const { result } = renderActiveNavigationDrawerMode({
      pathname: '/chat/20202020-0687-4c41-b707-ed1bfca972a7',
    });

    expect(result.current).toBe(NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY);
  });

  it('is the AI mode on the inbox page', () => {
    const { result } = renderActiveNavigationDrawerMode({
      pathname: '/inbox',
    });

    expect(result.current).toBe(NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY);
  });

  it('is the AI mode when the chat history is open on another page', () => {
    const { result } = renderActiveNavigationDrawerMode({
      pathname: '/objects/people',
      activeTab: NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
    });

    expect(result.current).toBe(NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY);
  });

  it('is the navigation menu mode anywhere else', () => {
    const { result } = renderActiveNavigationDrawerMode({
      pathname: '/objects/people',
    });

    expect(result.current).toBe(NAVIGATION_DRAWER_TABS.NAVIGATION_MENU);
  });
});

it('returns SunYield to its navigation when an old AI tab is stored', () => {
  const { result } = renderActiveNavigationDrawerMode({
    pathname: '/objects/leads',
    activeTab: NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
    isSunyield: true,
  });
  expect(result.current).toBe(NAVIGATION_DRAWER_TABS.NAVIGATION_MENU);
});
