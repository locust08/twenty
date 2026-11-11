import { type ObjectRecord } from 'twenty-shared/types';

import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

export const applySunyieldLeadSourceMapping = ({
  workspaceId,
  objectName,
  record,
}: {
  workspaceId: string;
  objectName: string;
  record: Partial<ObjectRecord>;
}): Partial<ObjectRecord> => {
  if (workspaceId !== SUNYIELD_WORKSPACE_ID || objectName !== 'lead')
    return record;

  const leadType =
    record.source === 'FACEBOOK'
      ? 'RESIDENTIAL'
      : record.source === 'GOOGLE_ADS'
        ? 'COMMERCIAL'
        : 'UNKNOWN';

  if (leadType !== 'UNKNOWN') return { ...record, leadType };

  return {
    ...record,
    leadType,
    assignedSalespersonId: null,
    assignedAt: null,
    assignmentState: 'NEEDS_REVIEW',
  };
};
