import { SunyieldWhatsappFeedService } from '../sunyield-whatsapp-feed.service';
import { type DataSource } from 'typeorm';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
const setup = () => {
  const query = jest.fn().mockResolvedValue([]);
  const database = { query } as unknown as DataSource;
  const config = {
    get: () => 'read-only-feed-secret',
  } as unknown as TwentyConfigService;
  return { query, service: new SunyieldWhatsappFeedService(database, config) };
};
it('rejects missing and wrong feed credentials before querying data', async () => {
  for (const token of [undefined, 'Bearer wrong']) {
    const f = setup();
    await expect(
      f.service.read(token, { cutoff: '2026-11-04T00:00:00Z' }),
    ).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  }
});
it('binds a validated cutoff and stable cursor rather than accepting SQL or workspace selectors', async () => {
  const f = setup();
  await f.service.read('read-only-feed-secret', {
    cutoff: '2026-11-04T00:00:00Z',
  });
  expect(f.query.mock.calls[0][0]).toContain('ORDER BY l."createdAt",l.id');
  expect(f.query.mock.calls[0][1][0]).toBe('2026-11-04T00:00:00Z');
  await expect(
    f.service.read('read-only-feed-secret', {
      cutoff: '2026-11-04T00:00:00Z',
      workspace: 'other',
    }),
  ).rejects.toThrow();
});
it('rejects malformed cursors', async () => {
  const f = setup();
  await expect(
    f.service.read('read-only-feed-secret', {
      cutoff: '2026-11-04T00:00:00Z',
      cursorId: 'not-a-uuid',
    }),
  ).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
it('retains PostgreSQL microseconds in the next page cursor', async () => {
  const f = setup();
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: '11111111-1111-4111-8111-' + String(index).padStart(12, '0'),
    createdAt: new Date('2026-11-04T00:00:00Z'),
    cursorAt: '2026-11-04T00:00:00.' + String(index + 1).padStart(6, '0') + 'Z',
    deletedAt: null,
    leadType: null,
    assignedSalespersonId: null,
    assignedAt: null,
    assignmentState: 'PENDING',
    name: 'Synthetic',
    area: null,
    source: null,
    bill: null,
    phone: '',
    salespersonName: null,
    recipient: null,
    workspaceMemberId: null,
    mappingCount: 0,
    salespersonActive: null,
    salespersonRotationOrder: null,
  }));
  f.query.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
  const page = await f.service.read('read-only-feed-secret', {
    cutoff: '2026-11-04T00:00:00Z',
  });
  expect(page.next?.cursorAt).toBe('2026-11-04T00:00:00.000100Z');
});
it.each([1, 5])(
  'accepts a fully configured dynamic pool of %i active salespeople',
  async (count) => {
    const value = setup();
    value.query.mockResolvedValueOnce([]).mockResolvedValueOnce(
      Array.from({ length: count }, (_, index) => ({
        id: '11111111-1111-4111-8111-' + String(index).padStart(12, '0'),
        active: true,
        rotationOrder: index + 1,
        recipient: '+6012345678' + index,
        member: 'member-' + index,
        valid: true,
        mappings: 1,
      })),
    );
    expect(
      (
        await value.service.read('read-only-feed-secret', {
          cutoff: '2026-11-04T00:00:00Z',
        })
      ).recipientsConfigured,
    ).toBe(true);
  },
);
it.each([null, 0, 1.5, 2])(
  'blocks readiness when an active order is invalid or duplicated: %j',
  async (order) => {
    const value = setup();
    value.query.mockResolvedValueOnce([]).mockResolvedValueOnce(
      Array.from({ length: 4 }, (_, index) => ({
        id: '11111111-1111-4111-8111-' + String(index).padStart(12, '0'),
        active: true,
        rotationOrder: index === 0 ? order : index + 1,
        recipient: '+6012345678' + index,
        member: 'member-' + index,
        valid: true,
        mappings: 1,
      })),
    );
    expect(
      (
        await value.service.read('read-only-feed-secret', {
          cutoff: '2026-11-04T00:00:00Z',
        })
      ).recipientsConfigured,
    ).toBe(false);
  },
);

it.each(['COMMERCIAL', 'RESIDENTIAL', null])(
  'projects the lead type %s without exposing additional CRM data',
  async (leadType) => {
    const value = setup();
    value.query
      .mockResolvedValueOnce([
        {
          id: '11111111-1111-4111-8111-111111111111',
          createdAt: new Date('2026-11-04T00:00:00Z'),
          cursorAt: '2026-11-04T00:00:00.000001Z',
          deletedAt: null,
          leadType,
          assignedSalespersonId: null,
          assignedAt: null,
          assignmentState: 'PENDING',
          name: 'Synthetic',
          area: null,
          source: null,
          bill: null,
          phone: '',
          salespersonName: null,
          recipient: null,
          workspaceMemberId: null,
          mappingCount: 0,
          salespersonActive: null,
          salespersonRotationOrder: null,
          unrelatedSensitiveField: 'excluded',
        },
      ])
      .mockResolvedValueOnce([]);
    const page = await value.service.read('read-only-feed-secret', {
      cutoff: '2026-11-04T00:00:00Z',
    });
    expect(page.leads[0]).toEqual(expect.objectContaining({ leadType }));
    expect(page.leads[0]).not.toHaveProperty('unrelatedSensitiveField');
    expect(value.query.mock.calls[0][0]).toContain('l."leadType"');
  },
);
