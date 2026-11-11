import { type ReactNode } from 'react';
import { t } from '@lingui/core/macro';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { useSunyieldRecordAccess } from '@/sunyield/hooks/useSunyieldRecordAccess';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { WorkspaceRouteUnavailable } from '@/ui/layout/page/components/WorkspaceRouteUnavailable';

type SunyieldRecordPageAccessGateProps = {
  objectName: string;
  recordId: string;
  children: ReactNode;
};

export const SunyieldRecordPageAccessGate = ({
  objectName,
  recordId,
  children,
}: SunyieldRecordPageAccessGateProps) => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const enabled =
    currentWorkspace?.id === SUNYIELD_WORKSPACE_ID &&
    ['lead', 'note', 'task', 'salesperson'].includes(objectName);
  const access = useSunyieldRecordAccess(objectName, recordId, enabled);

  if (enabled && !access) {
    return (
      <WorkspaceRouteUnavailable>
        <span role="status">{t`Checking access…`}</span>
      </WorkspaceRouteUnavailable>
    );
  }

  return <>{children}</>;
};
