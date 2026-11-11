import { z } from 'zod';
import { doNotTranslate } from 'twenty-shared/i18n';

export const SUNYIELD_MANAGED_RECORD_SCHEMA = z
  .object({
    id: z.string(),
    updatedAt: z.string().datetime({ offset: true }),
    deletedAt: z.null(),
  })
  .passthrough();
export const SUNYIELD_MANAGEMENT_ACCESS_SCHEMA = z.object({
  record: SUNYIELD_MANAGED_RECORD_SCHEMA,
  isAdmin: z.boolean(),
  canEdit: z.boolean(),
  editableFields: z.array(z.string()),
});
export type SunyieldManagementAccess = z.infer<
  typeof SUNYIELD_MANAGEMENT_ACCESS_SCHEMA
>;
export const saveSunyieldManagement = async ({
  baseUrl,
  input,
  request,
}: {
  baseUrl: string;
  input: {
    action: string;
    recordId: string;
    expectedUpdatedAt?: string;
    [key: string]: unknown;
  };
  request: typeof fetch;
}) => {
  const response = await request(baseUrl + '/rest/sunyield/management', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(
      doNotTranslate('Sunyield save rejected: ' + response.status),
    );
  const result = z
    .object({
      record: SUNYIELD_MANAGED_RECORD_SCHEMA,
      relatedRecords: z.array(SUNYIELD_MANAGED_RECORD_SCHEMA).optional(),
      reviewRequired: z.boolean().optional(),
    })
    .parse(await response.json());
  if (
    result.record.id !== input.recordId ||
    result.record.updatedAt === input.expectedUpdatedAt
  )
    throw new Error(doNotTranslate('Unconfirmed Sunyield save'));
  return result;
};
