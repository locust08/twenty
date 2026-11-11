import { z } from 'zod';

export type LeadSnapshot = {
  id: string;
  status: string;
  updatedAt: string;
  assignedSalespersonId: string | null;
  deletedAt: string | null;
};

export type LeadStore = {
  read: (id: string) => Promise<LeadSnapshot | null>;
  compareAndSet: (
    condition: { id: string; updatedAt: string; assignedSalespersonId: string },
    status: string,
  ) => Promise<LeadSnapshot | null>;
};

export type StatusContext = {
  workspaceId: string;
  workspaceMemberId: string | null;
  userWorkspaceId: string | null;
};

export type StatusDependencies = {
  store: LeadStore;
  workspaceId: string;
  assignments: Readonly<Record<string, string>>;
  statuses: readonly string[];
  audit: (event: {
    workspaceMemberId: string;
    recordId: string;
    previousStatus: string;
    status: string;
    updatedAt: string;
  }) => void;
};

export class StatusActionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const REQUEST_SCHEMA = z.strictObject({
  recordId: z.uuid(),
  status: z.string().min(1),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

export const updateStatus = async (
  input: unknown,
  context: StatusContext,
  dependencies: StatusDependencies,
): Promise<LeadSnapshot> => {
  if (
    context.workspaceId !== dependencies.workspaceId ||
    !context.workspaceMemberId ||
    !context.userWorkspaceId
  ) {
    throw new StatusActionError(
      403,
      'Sign in to the Sunyield workspace to update a status.',
    );
  }
  const parsed = REQUEST_SCHEMA.safeParse(input);
  if (!parsed.success || !dependencies.statuses.includes(parsed.data.status)) {
    throw new StatusActionError(
      400,
      'Select a valid lead and status. Refresh the lead before trying again.',
    );
  }
  const assignedSalespersonId =
    dependencies.assignments[context.workspaceMemberId];
  if (!assignedSalespersonId)
    throw new StatusActionError(
      403,
      'Your sales account has not been mapped. Contact an admin.',
    );
  const { recordId, status, expectedUpdatedAt } = parsed.data;
  const lead = await dependencies.store.read(recordId);
  if (!lead || lead.deletedAt !== null)
    throw new StatusActionError(404, 'This lead is unavailable.');
  if (lead.assignedSalespersonId !== assignedSalespersonId) {
    throw new StatusActionError(
      403,
      'You can update only leads assigned to you.',
    );
  }
  if (lead.updatedAt !== expectedUpdatedAt)
    throw new StatusActionError(
      409,
      'The lead changed. Refresh it before updating its status.',
    );
  const updated = await dependencies.store.compareAndSet(
    { id: recordId, updatedAt: expectedUpdatedAt, assignedSalespersonId },
    status,
  );
  if (!updated)
    throw new StatusActionError(
      409,
      'The lead changed or was reassigned. Refresh it before updating its status.',
    );
  dependencies.audit({
    workspaceMemberId: context.workspaceMemberId,
    recordId,
    previousStatus: lead.status,
    status,
    updatedAt: updated.updatedAt,
  });
  return updated;
};
