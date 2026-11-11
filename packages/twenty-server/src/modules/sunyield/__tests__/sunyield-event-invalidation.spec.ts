import { buildSunyieldInvalidation } from 'src/modules/sunyield/permissions/sunyield-event-invalidation';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

describe('Sunyield event privacy', () => {
  it('emits only an opaque invalidation, with no record or actor snapshot', () => {
    const payload = buildSunyieldInvalidation(SUNYIELD_WORKSPACE_ID);
    expect(payload).toEqual({
      metadataEvents: [],
      objectRecordEventsWithQueryIds: [
        {
          queryIds: [],
          objectRecordEvent: {
            action: 'updated',
            objectNameSingular: '__sunyieldRefresh',
            recordId: '00000000-0000-4000-8000-000000000000',
            properties: { after: {} },
          },
        },
      ],
    });
  });
  it('does not affect another workspace', () => {
    expect(buildSunyieldInvalidation('locus')).toBeNull();
  });
});
