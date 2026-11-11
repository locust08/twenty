import { createHash } from 'node:crypto';
import { v5 } from 'uuid';
import { type ObjectRecord } from 'twenty-shared/types';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

export const buildAdIntakeProvenanceIds = (leadId: string) => ({
  noteId: v5(leadId + ':ad-provenance', SUNYIELD_WORKSPACE_ID),
  targetId: v5(leadId + ':ad-provenance-target', SUNYIELD_WORKSPACE_ID),
});
export const buildAdIntakeIdentity = (
  provider: 'meta' | 'google-ads',
  providerLeadId: string,
  pageId?: string,
) => {
  const digest = createHash('sha256')
    .update(JSON.stringify([provider, pageId ?? null, providerLeadId]))
    .digest('hex');
  const submissionId = 'ad-intake-' + provider + '-' + digest;
  const id = v5(submissionId, SUNYIELD_WORKSPACE_ID);
  return { id, submissionId, ...buildAdIntakeProvenanceIds(id) };
};
export const getAdIntakeProvenanceForLead = (record: ObjectRecord) => {
  if (
    record.source !== 'FACEBOOK' ||
    typeof record.submissionId !== 'string' ||
    !/^ad-intake-meta-[a-f0-9]{64}$/.test(record.submissionId) ||
    record.id !== v5(record.submissionId, SUNYIELD_WORKSPACE_ID) ||
    record.createdBySource !== 'SYSTEM'
  )
    return [];
  return [{ leadId: record.id, ...buildAdIntakeProvenanceIds(record.id) }];
};
