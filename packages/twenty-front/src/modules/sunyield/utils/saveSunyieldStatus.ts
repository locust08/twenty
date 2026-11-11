import { z } from 'zod';
import { doNotTranslate } from 'twenty-shared/i18n';
export const SUNYIELD_LEAD_SNAPSHOT_SCHEMA = z.object({
  id: z.string(),
  status: z.string(),
  updatedAt: z.string(),
  assignedSalespersonId: z.string().nullable(),
  deletedAt: z.string().nullable(),
  updatedBy: z
    .object({
      source: z.string().nullable(),
      workspaceMemberId: z.string().nullable(),
      name: z.string().nullable(),
      context: z.unknown().optional(),
    })
    .nullable()
    .optional(),
});
export type SunyieldLeadSnapshot = z.infer<
  typeof SUNYIELD_LEAD_SNAPSHOT_SCHEMA
>;
export const saveSunyieldStatus = async ({
  baseUrl,
  recordId,
  status,
  expectedUpdatedAt,
  request,
}: {
  baseUrl: string;
  recordId: string;
  status: string;
  expectedUpdatedAt: string;
  request: typeof fetch;
}): Promise<SunyieldLeadSnapshot> => {
  const response = await request(baseUrl + '/rest/sunyield/status', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, status, expectedUpdatedAt }),
  });
  if (!response.ok)
    throw new Error(
      doNotTranslate('Sunyield status update rejected: ' + response.status),
    );
  const result = z
    .object({ lead: SUNYIELD_LEAD_SNAPSHOT_SCHEMA })
    .parse(await response.json());
  if (
    result.lead.id !== recordId ||
    result.lead.status !== status ||
    result.lead.deletedAt !== null ||
    result.lead.updatedAt === expectedUpdatedAt
  )
    throw new Error(doNotTranslate('Unconfirmed Sunyield status update'));
  return result.lead;
};
