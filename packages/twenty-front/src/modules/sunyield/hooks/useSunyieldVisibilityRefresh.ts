import {
  requiresSunyieldVisibilityReset,
  type SunyieldVisibilitySnapshot,
} from '@/sunyield/utils/requiresSunyieldVisibilityReset';
import { useCallback, useEffect } from 'react';
import { z } from 'zod';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  invalidateSunyieldRecordAccess,
  SUNYIELD_WORKSPACE_ID,
} from '@/sunyield/hooks/useSunyieldRecordAccess';
import { createSunyieldRevalidation } from '@/sunyield/utils/createSunyieldRevalidation';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

const SNAPSHOTS = new Map<string, SunyieldVisibilitySnapshot>();
const VISIBILITY = createSunyieldRevalidation<
  SunyieldVisibilitySnapshot | 'revoked'
>(async () => {
  const response = await fetch(
    REACT_APP_SERVER_BASE_URL + '/rest/sunyield/management/visibility',
    {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    },
  );
  if ([401, 403].includes(response.status)) return 'revoked';
  if (!response.ok) return undefined;
  return z
    .object({
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      isAdmin: z.boolean(),
      leadIds: z.array(z.string()),
    })
    .parse(await response.json());
});
export const useSunyieldVisibilityRefresh = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const client = useApolloCoreClient();
  const identity =
    currentWorkspace?.id === SUNYIELD_WORKSPACE_ID && currentWorkspaceMember?.id
      ? currentWorkspaceMember.id
      : '';
  const refresh = useCallback(async () => {
    if (!identity) return;
    await VISIBILITY.invalidate(identity);
    const snapshot = VISIBILITY.get(identity);
    const previous = SNAPSHOTS.get(identity);
    if (snapshot === undefined) {
      invalidateSunyieldRecordAccess();
      return;
    }
    if (
      snapshot === 'revoked' ||
      (previous && requiresSunyieldVisibilityReset(previous, snapshot))
    ) {
      // Reload discards record atoms, search results and open editors together.
      window.location.reload();
      return;
    }
    SNAPSHOTS.set(identity, snapshot);
    invalidateSunyieldRecordAccess();
    await client.refetchQueries({ include: 'active' });
  }, [identity, client]);
  useEffect(() => {
    if (!identity) {
      SNAPSHOTS.clear();
      return;
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 15000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [identity, refresh]);
  return refresh;
};
