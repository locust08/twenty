import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { useNavigationDrawerModes } from '@/navigation/hooks/useNavigationDrawerModes';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';
import { renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import {
  mockCurrentWorkspace,
  mockedUserData,
} from '~/testing/mock-data/users';
jest.mock('@/workspace/hooks/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: () => false,
}));
jest.mock('@/workspace/hooks/useIsWorkspaceActivationStatusEqualsTo', () => ({
  useIsWorkspaceActivationStatusEqualsTo: () => false,
}));
it.each([true, false])(
  'scopes optional AI navigation to the workspace (SunYield=%s)',
  (isSunyield) => {
    const store = createStore();
    store.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: isSunyield
        ? 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6'
        : mockCurrentWorkspace.id,
    });
    store.set(currentUserWorkspaceState.atom, {
      ...mockedUserData.currentUserWorkspace,
      permissionFlags: [PermissionFlagType.AI],
    });
    const before = store.get(currentUserWorkspaceState.atom);
    const { result } = renderHook(useNavigationDrawerModes, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <I18nProvider i18n={i18n}>
          <Provider store={store}>{children}</Provider>
        </I18nProvider>
      ),
    });
    expect(
      result.current.some(
        (item) => item.mode === NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
      ),
    ).toBe(!isSunyield);
    expect(
      result.current.some(
        (item) => item.mode === NAVIGATION_DRAWER_TABS.SETTINGS,
      ),
    ).toBe(true);
    expect(store.get(currentUserWorkspaceState.atom)).toEqual(before);
  },
);
