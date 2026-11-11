import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useSelectedRecordIds } from 'twenty-sdk/front-component';
import { z } from 'zod';
import { FRONT_IDENTIFIER, STATUS_OPTIONS } from '../deployment-config';
import { createLeadStore } from '../lead-store';
import { StatusForm, type StatusRequest } from '../status-form';
import { type LeadSnapshot } from '../update-status';

export const UpdateStatus = () => {
  const recordIds = useSelectedRecordIds();
  const client = new RestApiClient();
  const store = createLeadStore((method, requestPath, body) =>
    client.request(method, requestPath, { body }),
  );
  const load = async (recordId: string) => {
    const lead = await store.read(recordId);
    if (!lead) throw new Error('Lead unavailable');
    return lead;
  };
  const save = async (request: StatusRequest) => {
    try {
      const result = await client.post<{ lead: LeadSnapshot }>(
        '/s/sunyield/status',
        request,
      );
      return result.lead;
    } catch (error) {
      if (error instanceof RestApiClientError) {
        const body = z.object({ message: z.string() }).safeParse(error.body);
        if (body.success) throw new Error(body.data.message);
      }
      throw new Error(
        'Unable to confirm the update. Refresh the lead before trying again.',
      );
    }
  };
  return (
    <StatusForm
      recordIds={recordIds}
      statuses={STATUS_OPTIONS}
      load={load}
      save={save}
    />
  );
};

export const statusFront = defineFrontComponent({
  universalIdentifier: FRONT_IDENTIFIER,
  name: 'Update lead status',
  component: UpdateStatus,
});
