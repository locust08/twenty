import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { isDefined } from 'twenty-shared/utils';
import { z } from 'zod';

export const SUNYIELD_WORKSPACE_ID = 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6';

const SUNYIELD_STATUS_REQUEST = z
  .object({
    recordId: z.uuid(),
    status: z.enum([
      'NEW',
      'CALLBACK',
      'FOLLOW_UP',
      'HIGH',
      'LOW',
      'SITE_VISIT',
      'QUOTE',
      'NO_RESPONSE',
      'SECURED',
      'WITHDRAW',
      'INVALID',
    ]),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type SunyieldStatusRequest = z.infer<typeof SUNYIELD_STATUS_REQUEST>;

export const parseSunyieldStatusRequest = (
  input: unknown,
): SunyieldStatusRequest => {
  const result = SUNYIELD_STATUS_REQUEST.safeParse(input);

  if (!result.success) {
    throw new BadRequestException('Invalid Status request');
  }

  return result.data;
};

export const authorizeSunyieldStatus = (
  request: SunyieldStatusRequest,
  lead: {
    id: string;
    assignedSalespersonId: string | null;
    updatedAt: string | Date;
    deletedAt: string | Date | null;
  } | null,
  salespersonIds: string[],
): void => {
  if (salespersonIds.length > 1) {
    throw new ForbiddenException(
      'Multiple salespeople are mapped to your account. Ask an admin to correct the Workspace member mapping.',
    );
  }

  if (
    !isDefined(lead) ||
    lead.deletedAt !== null ||
    salespersonIds.length !== 1 ||
    lead.assignedSalespersonId !== salespersonIds[0]
  ) {
    throw new ForbiddenException(
      'Only the mapped salesperson can update this lead’s Status.',
    );
  }

  if (
    new Date(lead.updatedAt).getTime() !==
    new Date(request.expectedUpdatedAt).getTime()
  ) {
    throw new ConflictException(
      'This lead changed. Refresh it before updating Status.',
    );
  }
};

export const assertSunyieldUser = (context: {
  type: string;
  workspace: { id: string };
}): void => {
  if (
    context.type !== 'user' ||
    context.workspace.id !== SUNYIELD_WORKSPACE_ID
  ) {
    throw new ForbiddenException('Sunyield member access required');
  }
};
