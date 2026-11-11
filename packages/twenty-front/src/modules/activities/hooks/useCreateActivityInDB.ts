import { useCreateSunyieldActivity } from '@/sunyield/hooks/useCreateSunyieldActivity';
import { useCallback } from 'react';
import { useStore } from 'jotai';
import { isNonEmptyArray } from '@sniptt/guards';

import { type ActivityForEditor } from '@/activities/types/ActivityForEditor';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type CoreObjectNameSingular } from 'twenty-shared/types';
import { getRecordConnectionFromRecords } from '@/object-record/cache/utils/getRecordConnectionFromRecords';
import { modifyRecordFromCache } from '@/object-record/cache/utils/modifyRecordFromCache';
import { useCreateManyRecords } from '@/object-record/hooks/useCreateManyRecords';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';

import { createOneActivityOperationSignatureFactory } from '@/activities/graphql/operation-signatures/factories/createOneActivityOperationSignatureFactory';
import { useObjectMorphJunctionConfigOrThrow } from '@/object-record/record-field/ui/hooks/useObjectMorphJunctionConfigOrThrow';
import { getJunctionRecordsFromRecord } from '@/object-record/record-field/ui/utils/junction/getJunctionRecordsFromRecord';
import { type ActivityTarget } from '@/activities/types/ActivityTarget';
import { capitalize } from 'twenty-shared/utils';

export const useCreateActivityInDB = ({
  activityObjectNameSingular,
}: {
  activityObjectNameSingular:
    | CoreObjectNameSingular.Task
    | CoreObjectNameSingular.Note;
}) => {
  const sunyield = useCreateSunyieldActivity(activityObjectNameSingular);
  const createOneActivityOperationSignature =
    createOneActivityOperationSignatureFactory({
      objectNameSingular: activityObjectNameSingular,
    });

  const { createOneRecord: createOneActivity } = useCreateOneRecord({
    objectNameSingular: activityObjectNameSingular,
    recordGqlFields: createOneActivityOperationSignature.fields,
    shouldMatchRootQueryFilter: true,
  });

  const { objectMetadataItems } = useObjectMetadataItems();

  const { objectMetadataItem: objectMetadataItemActivity } =
    useObjectMetadataItem({
      objectNameSingular: activityObjectNameSingular,
    });

  const morphJunctionConfig = useObjectMorphJunctionConfigOrThrow({
    objectNameSingular: activityObjectNameSingular,
  });

  const { createManyRecords: createManyActivityTargets } =
    useCreateManyRecords<ActivityTarget>({
      objectNameSingular:
        morphJunctionConfig.junctionObjectMetadata.nameSingular,
      shouldMatchRootQueryFilter: true,
    });

  const cache = useApolloCoreClient().cache;
  const store = useStore();

  const createActivityInDB = useCallback(
    async (activityToCreate: ActivityForEditor) => {
      if (sunyield.protectedCreate) {
        const targets = getJunctionRecordsFromRecord({
          record: activityToCreate,
          junctionFieldName: morphJunctionConfig.junctionField.name,
        });
        if (
          targets.some((target) =>
            Object.entries(target).some(
              ([key, value]) =>
                key.startsWith('target') &&
                key.endsWith('Id') &&
                key !== 'targetLeadId' &&
                value != null,
            ),
          )
        )
          throw new Error('Choose one assigned lead');
        await sunyield.create(
          targets.map((target) => ({
            id: String(target.targetLeadId ?? ''),
            targetObjectNameSingular: 'lead',
          })),
          activityToCreate,
        );
        return;
      }
      const createdActivity = await createOneActivity?.({
        ...activityToCreate,
        updatedAt: new Date().toISOString(),
      });

      const { junctionObjectMetadata, junctionField } = morphJunctionConfig;

      const activityTargetsToCreate = getJunctionRecordsFromRecord({
        record: activityToCreate,
        junctionFieldName: junctionField.name,
      });

      if (isNonEmptyArray(activityTargetsToCreate)) {
        await createManyActivityTargets({
          recordsToCreate: activityTargetsToCreate,
        });
      }

      const activityTargetsConnection = getRecordConnectionFromRecords({
        objectMetadataItems,
        objectMetadataItem: junctionObjectMetadata,
        records: activityTargetsToCreate.map((activityTarget) => ({
          ...activityTarget,
          __typename: capitalize(junctionObjectMetadata.nameSingular),
        })),
        withPageInfo: false,
        computeReferences: true,
        isRootLevel: false,
      });

      modifyRecordFromCache({
        recordId: createdActivity.id,
        cache,
        fieldModifiers: {
          [junctionField.name]: () => activityTargetsConnection,
        },
        objectMetadataItem: objectMetadataItemActivity,
      });

      store.set(recordStoreFamilyState.atomFamily(createdActivity.id), {
        ...createdActivity,
        [junctionField.name]: activityTargetsToCreate,
      });
    },
    [
      sunyield,
      store,
      cache,
      createManyActivityTargets,
      createOneActivity,
      morphJunctionConfig,
      objectMetadataItemActivity,
      objectMetadataItems,
    ],
  );

  return {
    createActivityInDB,
  };
};
