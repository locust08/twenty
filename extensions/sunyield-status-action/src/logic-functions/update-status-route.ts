import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { defineLogicFunction } from 'twenty-sdk/define';
import { z } from 'zod';
import {
  Response,
  type LogicFunctionExecutionContext,
  type RoutePayload,
} from 'twenty-sdk/logic-function';
import { ROUTE_IDENTIFIER } from '../deployment-config';

export const handleStatusRoute = async (
  event: RoutePayload,
  _context: LogicFunctionExecutionContext,
): Promise<Response> => {
  try {
    const client = new RestApiClient({ runAs: 'user' });
    const result = await client.post('/rest/sunyield/status', event.body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const details = error instanceof RestApiClientError
      ? z.object({ message: z.string() }).safeParse(error.body).data
      : undefined;
    return new Response(JSON.stringify({
      message: details?.message ?? 'Unable to confirm the update. Refresh the lead before trying again.',
    }), {
      status: error instanceof RestApiClientError ? error.status ?? 502 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const statusRoute = defineLogicFunction({
  universalIdentifier: ROUTE_IDENTIFIER,
  name: 'sunyield-update-status',
  description:
    'Authenticated, conditional status-only update for assigned Sunyield leads.',
  timeoutSeconds: 15,
  handler: handleStatusRoute,
  httpRouteTriggerSettings: {
    path: '/sunyield/status',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
