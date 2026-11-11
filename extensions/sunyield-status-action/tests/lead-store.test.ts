import { describe, expect, it } from 'vitest';
import { createLeadStore } from '../src/lead-store';

describe('Twenty conditional status write', () => {
  it('uses only scalar identity, assignee, deletion and version filters and writes status alone', async () => {
    const requests: unknown[] = [];
    const store = createLeadStore(async (method, requestPath, body) => {
      const url = new URL(requestPath, 'https://example.test');
      requests.push({
        method,
        pathname: url.pathname,
        filter: url.searchParams.get('filter'),
        body,
      });
      return { data: { updateLeads: [] } };
    });
    expect(
      await store.compareAndSet(
        { id: 'lead', assignedSalespersonId: 'sales', updatedAt: 'version' },
        'CALLBACK',
      ),
    ).toBeNull();
    expect(requests).toEqual([
      {
        method: 'PATCH',
        pathname: '/rest/leads',
        filter:
          'and(id[eq]:"lead",assignedSalespersonId[eq]:"sales",updatedAt[eq]:"version",deletedAt[is]:NULL)',
        body: { status: 'CALLBACK' },
      },
    ]);
  });

  it('does not treat API errors or malformed results as success', async () => {
    for (const response of [
      { errors: [{ message: 'private detail' }] },
      { data: { updateLeads: null } },
      {},
    ]) {
      const store = createLeadStore(async () => response);
      await expect(
        store.compareAndSet(
          { id: 'lead', assignedSalespersonId: 'sales', updatedAt: 'version' },
          'CALLBACK',
        ),
      ).rejects.toThrow('Unable to confirm');
    }
  });
});
