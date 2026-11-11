import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const useSunyieldLayout = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const isAdmin = useHasPermissionFlag(PermissionFlagType.WORKSPACE_MEMBERS);
  return { enabled: currentWorkspace?.id === SUNYIELD_WORKSPACE_ID, isAdmin };
};
