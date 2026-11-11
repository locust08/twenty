import { createHash } from 'node:crypto';
export const WORKSPACE_ID = 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6';
export const normalizePhone = (value) => {
  if (typeof value !== 'string' || !/^[+\d ()-]+$/.test(value)) return null;
  const phone = value.replace(/[ ()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
};
const text = (value) =>
  String(value ?? '-')
    .replace(/[\u0000-\u001f\u007f*_~`]/g, ' ')
    .trim()
    .slice(0, 350) || '-';
export const formatLead = (lead, kind = 'initial-assignment') =>
  `${kind === 'commercial-awaiting-assignment' ? 'New Commercial lead — manual assignment required' : 'New Lead'}\n\nName: ${text(lead.name)}\nPhone: ${text(lead.phone)}\nArea: ${text(lead.area)}\nBill: ${text(lead.bill)}\nSource: ${text(lead.source)}${kind === 'commercial-awaiting-assignment' ? '' : `\n\nAssigned to: ${text(lead.salespersonName)}`}`;
export const assignmentKey = (lead) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        lead.assignedSalespersonId,
        lead.assignedAt,
        lead.workspaceMemberId,
        normalizePhone(lead.recipient),
      ]),
    )
    .digest('hex');
export const eligible = (lead) =>
  Boolean(
    lead &&
    !lead.deletedAt &&
    lead.assignmentState === 'ASSIGNED' &&
    lead.assignedSalespersonId &&
    lead.assignedAt &&
    lead.workspaceMemberId &&
    lead.mappingCount === 1 &&
    normalizePhone(lead.recipient),
  );
