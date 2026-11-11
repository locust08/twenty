import { SUNYIELD_LEAD_UNAVAILABLE_PARAMETER } from '@/sunyield/constants/SUNYIELD_LEAD_UNAVAILABLE_PARAMETER';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { useEffect, useSyncExternalStore } from 'react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  SUNYIELD_MANAGEMENT_ACCESS_SCHEMA,
  type SunyieldManagementAccess,
} from '@/sunyield/utils/saveSunyieldManagement';
import { createSunyieldRevalidation } from '@/sunyield/utils/createSunyieldRevalidation';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
type AccessResult =
  | { kind: 'allowed'; access: SunyieldManagementAccess }
  | { kind: 'denied' };
const ACCESS = createSunyieldRevalidation<AccessResult>(async (key) => {
  const [, , objectName, recordId] = key.split(':');
  const response = await fetch(
    REACT_APP_SERVER_BASE_URL +
      '/rest/sunyield/management/access?' +
      new URLSearchParams({ objectName, recordId }),
    { credentials: 'include', cache: 'no-store' },
  );
  if ([401, 403, 404].includes(response.status)) return { kind: 'denied' };
  const parsed = response.ok
    ? SUNYIELD_MANAGEMENT_ACCESS_SCHEMA.safeParse(await response.json())
    : undefined;
  return parsed?.success && parsed.data.record.id === recordId
    ? { kind: 'allowed', access: parsed.data }
    : undefined;
});
const REFRESHERS = new Map<string, { release: () => void; users: number }>();
export const invalidateSunyieldRecordAccess = () => {
  for (const key of REFRESHERS.keys()) void ACCESS.invalidate(key);
};
export const useSunyieldRecordAccess = (
  objectName: string,
  recordId: string,
  requested = true,
) => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const enabled =
    requested &&
    currentWorkspace?.id === SUNYIELD_WORKSPACE_ID &&
    !!currentWorkspaceMember?.id &&
    !!recordId &&
    ['lead', 'note', 'task', 'salesperson'].includes(objectName);
  const key = enabled
    ? [
        currentWorkspace.id,
        currentWorkspaceMember.id,
        objectName,
        recordId,
      ].join(':')
    : '';
  const result = useSyncExternalStore(ACCESS.subscribe, () => ACCESS.get(key));
  useEffect(() => {
    if (enabled && result?.kind === 'denied')
      window.location.replace(
        objectName === 'lead'
          ? '/objects/leads?' + SUNYIELD_LEAD_UNAVAILABLE_PARAMETER + '=1'
          : '/objects/leads',
      );
  }, [enabled, result, objectName]);
  useEffect(() => {
    if (!key) return;
    const existing = REFRESHERS.get(key);
    if (existing) {
      existing.users++;
      return () => {
        if (--existing.users === 0) {
          existing.release();
          REFRESHERS.delete(key);
          ACCESS.forget(key);
        }
      };
    }
    const refresh = () => {
      void ACCESS.invalidate(key);
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    const entry = {
      users: 1,
      release: () => {
        clearInterval(interval);
        window.removeEventListener('focus', refresh);
      },
    };
    REFRESHERS.set(key, entry);
    return () => {
      if (--entry.users === 0) {
        entry.release();
        REFRESHERS.delete(key);
        ACCESS.forget(key);
      }
    };
  }, [key]);
  return enabled && result?.kind === 'allowed' ? result.access : undefined;
};
