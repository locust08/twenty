export type SunyieldStatusEligibility = {
  workspaceId?: string;
  objectMetadataId: string;
  fieldName: string;
  memberId?: string;
  mapping?: { memberId: string; salespersonIds: string[] };
  assignedSalespersonId?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
  nativeCanUpdate: boolean;
};
export const isSunyieldStatus = (
  input: Pick<
    SunyieldStatusEligibility,
    'workspaceId' | 'objectMetadataId' | 'fieldName'
  >,
) =>
  input.workspaceId === 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6' &&
  input.objectMetadataId === 'd3247b81-eece-4d86-825e-b3b2d4d80566' &&
  input.fieldName === 'status';
export const canEditSunyieldStatus = (
  input: SunyieldStatusEligibility,
): boolean =>
  isSunyieldStatus(input) &&
  !input.nativeCanUpdate &&
  input.deletedAt === null &&
  typeof input.updatedAt === 'string' &&
  input.updatedAt.length > 0 &&
  typeof input.memberId === 'string' &&
  input.mapping?.memberId === input.memberId &&
  input.mapping.salespersonIds.length === 1 &&
  input.mapping.salespersonIds[0] === input.assignedSalespersonId;
