import { saveSunyieldManagement } from '@/sunyield/utils/saveSunyieldManagement';
const input = {
  action: 'updateLead',
  recordId: 'lead',
  expectedUpdatedAt: '2026-11-04T00:00:00Z',
  changes: { name: 'Customer' },
};
const confirmed = {
  id: 'lead',
  name: 'Customer',
  updatedAt: '2026-11-04T01:00:00Z',
  deletedAt: null,
};
describe('Sunyield confirmed management writes', () => {
  it('uses the session and displayed version without optimistic state', async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ record: confirmed }),
    });
    await expect(
      saveSunyieldManagement({ baseUrl: '', input, request }),
    ).resolves.toMatchObject({ record: confirmed });
    expect(request).toHaveBeenCalledWith(
      '/rest/sunyield/management',
      expect.objectContaining({
        credentials: 'include',
        body: JSON.stringify(input),
      }),
    );
  });
  it.each([403, 404, 409, 500])('never retries rejected %s', async (status) => {
    const request = jest.fn().mockResolvedValue({ ok: false, status });
    await expect(
      saveSunyieldManagement({ baseUrl: '', input, request }),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...confirmed, id: 'other' },
    { ...confirmed, updatedAt: input.expectedUpdatedAt },
    { ...confirmed, deletedAt: '2026-11-04T01:00:00Z' },
  ])('rejects an unconfirmed record', async (record) => {
    const request = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ record }) });
    await expect(
      saveSunyieldManagement({ baseUrl: '', input, request }),
    ).rejects.toThrow();
  });
});
