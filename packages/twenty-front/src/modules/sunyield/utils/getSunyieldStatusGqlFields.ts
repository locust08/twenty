import { type RecordGqlFields } from 'twenty-shared/types';
import { isSunyieldStatus } from './canEditSunyieldStatus';
export const getSunyieldStatusGqlFields = (
  workspaceId: string | undefined,
  objectMetadataId: string,
): RecordGqlFields =>
  isSunyieldStatus({ workspaceId, objectMetadataId, fieldName: 'status' })
    ? {
        assignedSalespersonId: true,
        status: true,
        updatedAt: true,
        deletedAt: true,
      }
    : {};
