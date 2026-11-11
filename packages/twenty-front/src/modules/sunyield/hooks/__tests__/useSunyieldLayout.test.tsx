import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useSunyieldLayout } from '@/sunyield/hooks/useSunyieldLayout';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { renderHook } from '@testing-library/react';
let mockWorkspaceId: string | undefined;
let mockIsAdmin = false;
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (state: unknown) =>
    state === currentWorkspaceState && mockWorkspaceId
      ? { id: mockWorkspaceId }
      : null,
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockIsAdmin,
}));
it.each([undefined, 'locus-workspace', SUNYIELD_WORKSPACE_ID])(
  'only enables the cleanup in Sunyield (%s)',
  (workspaceId) => {
    mockWorkspaceId = workspaceId;
    const { result } = renderHook(useSunyieldLayout);
    expect(result.current.enabled).toBe(workspaceId === SUNYIELD_WORKSPACE_ID);
  },
);
it('preserves administrator configuration while keeping sales presentation separate', () => {
  mockWorkspaceId = SUNYIELD_WORKSPACE_ID;
  mockIsAdmin = true;
  const { result, rerender } = renderHook(useSunyieldLayout);
  expect(result.current).toEqual({ enabled: true, isAdmin: true });
  mockIsAdmin = false;
  rerender();
  expect(result.current).toEqual({ enabled: true, isAdmin: false });
});
