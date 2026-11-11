import { createHash } from 'node:crypto';
import {
  assignmentKey,
  eligible,
  formatLead,
  normalizePhone,
} from './policy.mjs';
export const notification = (lead, kind, expectedSender, commercialCutoff) => {
  if (kind === 'initial-assignment')
    return eligible(lead)
      ? {
          key: assignmentKey(lead),
          recipient: normalizePhone(lead.recipient),
          message: formatLead(lead),
        }
      : null;
  if (
    kind !== 'commercial-awaiting-assignment' ||
    !lead ||
    lead.deletedAt ||
    lead.leadType !== 'COMMERCIAL' ||
    lead.assignedSalespersonId ||
    lead.assignedAt ||
    lead.assignmentState === 'ASSIGNED' ||
    !normalizePhone(expectedSender) ||
    !Number.isFinite(Date.parse(commercialCutoff)) ||
    !Number.isFinite(Date.parse(lead.createdAt)) ||
    Date.parse(lead.createdAt) < Date.parse(commercialCutoff)
  )
    return null;
  const recipient = normalizePhone(expectedSender);
  return {
    key: createHash('sha256')
      .update(JSON.stringify([kind, lead.id, recipient]))
      .digest('hex'),
    recipient,
    message: formatLead(lead, kind),
  };
};
