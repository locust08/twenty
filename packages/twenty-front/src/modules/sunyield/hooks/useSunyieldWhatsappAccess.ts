import { useEffect, useState } from 'react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
export const useSunyieldWhatsappAccess = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    setAllowed(false);
    if (currentWorkspace?.id !== 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6') return;
    const refresh = async () => {
      try {
        const response = await fetch(
          REACT_APP_SERVER_BASE_URL + '/rest/sunyield/whatsapp/access',
          { credentials: 'include', cache: 'no-store' },
        );
        if (active) setAllowed(response.ok);
      } catch {
        if (active) setAllowed(false);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [currentWorkspace?.id, currentWorkspaceMember?.id]);
  return (
    allowed && currentWorkspace?.id === 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6'
  );
};
