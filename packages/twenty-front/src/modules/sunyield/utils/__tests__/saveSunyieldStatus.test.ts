import { saveSunyieldStatus } from '@/sunyield/utils/saveSunyieldStatus';
const lead = {
  id: 'lead-1',
  status: 'FOLLOW_UP',
  updatedAt: '2026-11-03T01:00:00Z',
  assignedSalespersonId: 'sales-1',
  deletedAt: null,
};
const input = {
  baseUrl: 'https://crm.example',
  recordId: lead.id,
  status: lead.status,
  expectedUpdatedAt: '2026-11-03T00:00:00Z',
};
describe('protected Sunyield status save', () => {
  it('sends only status and the displayed version, using the signed-in session', async () => {
    const requests: { url: string; options?: RequestInit }[] = [];
    const request: typeof fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ lead }),
      } as Response;
    };
    await expect(saveSunyieldStatus({ ...input, request })).resolves.toEqual(
      lead,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://crm.example/rest/sunyield/status');
    expect(requests[0].options?.credentials).toBe('include');
    expect(JSON.parse(String(requests[0].options?.body))).toEqual({
      recordId: lead.id,
      status: lead.status,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
  });
  it('keeps confirmed audit attribution for the record cache', async () => {
    const confirmed = {
      ...lead,
      updatedBy: {
        workspaceMemberId: 'member',
        name: 'Sunyield QA',
        source: 'MANUAL',
        context: {},
      },
    };
    const request: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ lead: confirmed }),
      }) as Response;
    await expect(saveSunyieldStatus({ ...input, request })).resolves.toEqual(
      confirmed,
    );
  });
  it.each([403, 409, 500])(
    'rejects HTTP %s without retrying or returning optimistic state',
    async (status) => {
      let calls = 0;
      const request: typeof fetch = async () => {
        calls++;
        return { ok: false, status, json: async () => ({}) } as Response;
      };
      await expect(saveSunyieldStatus({ ...input, request })).rejects.toThrow();
      expect(calls).toBe(1);
    },
  );
  it.each([
    { lead: { ...lead, id: 'different' } },
    { lead: { ...lead, status: 'NEW' } },
    { lead: { ...lead, updatedAt: input.expectedUpdatedAt } },
    {},
  ])('rejects an unconfirmed result %j', async (body) => {
    const request: typeof fetch = async () =>
      ({ ok: true, status: 200, json: async () => body }) as Response;
    await expect(saveSunyieldStatus({ ...input, request })).rejects.toThrow();
  });
});
