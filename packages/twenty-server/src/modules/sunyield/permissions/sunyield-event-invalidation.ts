import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { type EventStreamPayload } from 'src/engine/subscriptions/types/event-stream-payload.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

export const buildSunyieldInvalidation = (
  workspaceId: string,
): EventStreamPayload | null =>
  workspaceId === SUNYIELD_WORKSPACE_ID
    ? {
        metadataEvents: [],
        objectRecordEventsWithQueryIds: [
          {
            queryIds: [],
            objectRecordEvent: {
              action: DatabaseEventAction.UPDATED,
              objectNameSingular: '__sunyieldRefresh',
              recordId: '00000000-0000-4000-8000-000000000000',
              properties: { after: {} },
            },
          },
        ],
      }
    : null;
