import { queueSunyieldRecordWrite } from '@/sunyield/utils/queueSunyieldRecordWrite';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useStore } from 'jotai';
import { useLingui } from '@lingui/react/macro';
import { useToast } from 'twenty-ui/components/feedback';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { getObjectTypename } from '@/object-record/cache/utils/getObjectTypename';
import { updateRecordFromCache } from '@/object-record/cache/utils/updateRecordFromCache';
import { generateDepthRecordGqlFieldsFromRecord } from '@/object-record/graphql/record-gql-fields/utils/generateDepthRecordGqlFieldsFromRecord';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { saveSunyieldManagement } from '@/sunyield/utils/saveSunyieldManagement';
import {
  invalidateSunyieldRecordAccess,
  SUNYIELD_WORKSPACE_ID,
} from '@/sunyield/hooks/useSunyieldRecordAccess';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { doNotTranslate } from 'twenty-shared/i18n';

export const useSunyieldManagement = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const store = useStore();
  const client = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const { upsertRecordsInStore } = useUpsertRecordsInStore();
  const { enqueueToast } = useToast();
  const { t } = useLingui();
  const execute = async (
    objectName: string,
    input: Parameters<typeof saveSunyieldManagement>[0]['input'],
  ) => {
    try {
      const save = (expectedUpdatedAt?: string) =>
        saveSunyieldManagement({
          baseUrl: REACT_APP_SERVER_BASE_URL,
          input: expectedUpdatedAt ? { ...input, expectedUpdatedAt } : input,
          request: fetch,
        });
      const result =
        typeof input.expectedUpdatedAt === 'string'
          ? await queueSunyieldRecordWrite(
              [
                currentWorkspace?.id,
                currentWorkspaceMember?.id,
                objectName,
                input.recordId,
              ].join(':'),
              input.expectedUpdatedAt,
              save,
            )
          : await save();
      for (const [name, record] of [
        [objectName, result.record] as const,
        ...(result.relatedRecords ?? []).map(
          (record) => ['task', record] as const,
        ),
      ]) {
        const metadata = objectMetadataItems.find(
          (item) => item.nameSingular === name,
        );
        const confirmed = { ...record, __typename: getObjectTypename(name) };
        upsertRecordsInStore({ partialRecords: [confirmed] });
        if (metadata)
          updateRecordFromCache({
            cache: client.cache,
            objectMetadataItem: metadata,
            objectMetadataItems,
            record: confirmed,
            recordGqlFields: generateDepthRecordGqlFieldsFromRecord({
              objectMetadataItem: metadata,
              objectMetadataItems,
              record: confirmed,
              depth: 0,
            }),
            objectPermissionsByObjectMetadataId,
          });
      }
      invalidateSunyieldRecordAccess();
      if (result.reviewRequired)
        enqueueToast({
          status: 'warning',
          children: t`Access was removed. Some activity links need admin review.`,
        });
      void client.refetchQueries({ include: 'active' });
      return result.record;
    } catch (error) {
      invalidateSunyieldRecordAccess();
      enqueueToast({
        status: 'error',
        children: t`The record could not be saved. Refresh to check for changes or reassignment.`,
      });
      throw error;
    }
  };
  const update = async (
    objectName: string,
    recordId: string,
    changes: Record<string, unknown>,
    nativeCanUpdate: boolean,
  ) => {
    if (currentWorkspace?.id !== SUNYIELD_WORKSPACE_ID) return undefined;
    const action =
      objectName === 'lead' && 'assignedSalespersonId' in changes
        ? 'reassignLead'
        : objectName === 'salesperson' && 'workspaceMemberId' in changes
          ? 'mapSalesperson'
          : !nativeCanUpdate && objectName === 'lead'
            ? 'updateLead'
            : (objectName === 'task' && typeof changes.status === 'string') ||
                (!nativeCanUpdate && ['note', 'task'].includes(objectName))
              ? 'updateActivity'
              : undefined;
    if (!action) return undefined;
    const snapshot = store.get(recordStoreFamilyState.atomFamily(recordId));
    if (typeof snapshot?.updatedAt !== 'string')
      throw new Error(doNotTranslate('Refresh this record before saving'));
    if (
      (action === 'reassignLead' || action === 'mapSalesperson') &&
      Object.keys(changes).length !== 1
    )
      throw new Error(doNotTranslate('Save ownership changes separately'));
    return execute(objectName, {
      action,
      recordId,
      expectedUpdatedAt: snapshot.updatedAt,
      ...(action === 'reassignLead'
        ? { salespersonId: changes.assignedSalespersonId }
        : action === 'mapSalesperson'
          ? { workspaceMemberId: changes.workspaceMemberId }
          : action === 'updateActivity'
            ? { kind: objectName, changes }
            : { changes }),
    });
  };
  return {
    isSunyield: currentWorkspace?.id === SUNYIELD_WORKSPACE_ID,
    execute,
    update,
  };
};
