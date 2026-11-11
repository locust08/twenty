import { z } from 'zod';
import { type LeadStore, StatusActionError } from './update-status';

const LEAD_SCHEMA = z.object({
  id: z.string(),
  status: z.string(),
  updatedAt: z.string(),
  assignedSalespersonId: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
export type QueryExecutor = (
  method: 'GET' | 'PATCH',
  requestPath: string,
  body?: { status: string },
) => Promise<unknown>;

const decode = <TResult>(
  schema: z.ZodType<TResult>,
  response: unknown,
): TResult => {
  const errors = z
    .object({ errors: z.array(z.unknown()).min(1) })
    .safeParse(response);
  const parsed = schema.safeParse(response);
  if (errors.success || !parsed.success)
    throw new StatusActionError(
      502,
      'Unable to confirm the update. Refresh the lead before trying again.',
    );
  return parsed.data;
};

export const createLeadStore = (execute: QueryExecutor): LeadStore => ({
  read: async (id) => {
    const response = await execute(
      'GET',
      `/rest/leads/${encodeURIComponent(id)}?depth=0`,
    );
    return decode(
      z.object({ data: z.object({ lead: LEAD_SCHEMA.nullable() }) }),
      response,
    ).data.lead;
  },
  compareAndSet: async (condition, status) => {
    // Scalar predicates stay on the UPDATE; a joined ID subquery can retain a stale assignment snapshot.
    const response = await execute(
      'PATCH',
      `/rest/leads?${new URLSearchParams({ depth: '0', filter: `and(id[eq]:${JSON.stringify(condition.id)},assignedSalespersonId[eq]:${JSON.stringify(condition.assignedSalespersonId)},updatedAt[eq]:${JSON.stringify(condition.updatedAt)},deletedAt[is]:NULL)` })}`,
      { status },
    );
    const rows = decode(
      z.object({
        data: z.object({ updateLeads: z.array(LEAD_SCHEMA).max(1) }),
      }),
      response,
    ).data.updateLeads;
    return rows[0] ?? null;
  },
});
