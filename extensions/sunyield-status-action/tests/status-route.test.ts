import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleStatusRoute } from '../src/logic-functions/update-status-route';
import { type LogicFunctionExecutionContext, type RoutePayload } from 'twenty-sdk/logic-function';

const body = { recordId: 'f453c74a-3f6e-55e7-8db8-dfb048901b26', status: 'FOLLOW_UP', expectedUpdatedAt: '2026-11-03T01:00:00.000Z' };

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Status route delegation', () => {
  it('uses the signed-in user and transactional endpoint, never the app writer', async () => {
    vi.stubEnv('TWENTY_API_URL', 'https://crm.example');
    vi.stubEnv('TWENTY_APP_ACCESS_TOKEN', 'test-user-token');
    vi.stubEnv('TWENTY_APP_APPLICATION_ACCESS_TOKEN', 'test-application-token');
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      expect(url).toBe('https://crm.example/rest/sunyield/status');
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-user-token');
      expect(JSON.parse(String(options.body))).toEqual(body);
      return new globalThis.Response(JSON.stringify({ lead: { ...body, id: body.recordId } }), { status: 200 });
    });
    const response = await handleStatusRoute({ body } as RoutePayload, {} as LogicFunctionExecutionContext);
    expect(response.status).toBe(200);
  });
});
