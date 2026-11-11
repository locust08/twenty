import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { useSunyieldFieldAccess } from '@/sunyield/hooks/useSunyieldFieldAccess';
import { useSunyieldMapping } from '@/sunyield/hooks/useSunyieldMapping';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import {
  canEditSunyieldStatus,
  isSunyieldStatus,
} from '@/sunyield/utils/canEditSunyieldStatus';
import { SUNYIELD_LEAD_SNAPSHOT_SCHEMA } from '@/sunyield/utils/saveSunyieldStatus';
export const useSunyieldStatus = ({
  recordId,
  fieldMetadataId,
}: {
  recordId: string;
  fieldMetadataId: string;
}) => {
  const canManageField = useSunyieldFieldAccess(recordId, fieldMetadataId);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );
  const permissions = useObjectPermissionsForObject(
    'd3247b81-eece-4d86-825e-b3b2d4d80566',
  );
  const mapping = useSunyieldMapping(
    currentWorkspace?.id,
    currentWorkspaceMember?.id,
    fieldMetadataId === 'd068b8ef-e5e9-474f-a31a-f527daf5abfb' &&
      !permissions.canUpdateObjectRecords,
  );
  const recordStore = useAtomFamilyStateValue(recordStoreFamilyState, recordId);
  const snapshot = SUNYIELD_LEAD_SNAPSHOT_SCHEMA.safeParse(recordStore).data;
  const input = {
    workspaceId: currentWorkspace?.id,
    memberId: currentWorkspaceMember?.id,
    mapping,
    objectMetadataId: 'd3247b81-eece-4d86-825e-b3b2d4d80566',
    fieldName: 'status',
    nativeCanUpdate: permissions.canUpdateObjectRecords,
    ...snapshot,
  };
  const isProtectedStatus =
    fieldMetadataId === 'd068b8ef-e5e9-474f-a31a-f527daf5abfb' &&
    isSunyieldStatus(input) &&
    !input.nativeCanUpdate;
  return {
    isSunyieldWorkspace: currentWorkspace?.id === SUNYIELD_WORKSPACE_ID,
    snapshot,
    isProtectedStatus,
    hasMappingConflict:
      isProtectedStatus && (mapping?.salespersonIds.length ?? 0) > 1,
    canEdit:
      canManageField ||
      (isProtectedStatus &&
        !isLayoutCustomizationModeEnabled &&
        permissions.canReadObjectRecords &&
        canEditSunyieldStatus(input)),
  };
};
