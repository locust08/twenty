import { useEffect } from 'react';
import { t } from '@lingui/core/macro';
import { useToast } from 'twenty-ui/components/feedback';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { SUNYIELD_LEAD_UNAVAILABLE_PARAMETER } from '@/sunyield/constants/SUNYIELD_LEAD_UNAVAILABLE_PARAMETER';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';

export const SunyieldLeadUnavailableNotificationEffect = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { enqueueToast } = useToast();
  useEffect(() => {
    const url = new URL(window.location.href);
    if (
      currentWorkspace?.id !== SUNYIELD_WORKSPACE_ID ||
      url.pathname !== '/objects/leads' ||
      url.searchParams.get(SUNYIELD_LEAD_UNAVAILABLE_PARAMETER) !== '1'
    )
      return;
    url.searchParams.delete(SUNYIELD_LEAD_UNAVAILABLE_PARAMETER);
    window.history.replaceState(
      window.history.state,
      '',
      url.pathname + url.search + url.hash,
    );
    enqueueToast({
      status: 'error',
      children: t`This lead is unavailable or you don’t have permission to view it`,
    });
  }, [currentWorkspace?.id, enqueueToast]);
  return null;
};
