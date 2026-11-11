import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { SunyieldAdIntakeService } from '../sunyield-ad-intake.service';
import {
  GOOGLE_CONFIG,
  GOOGLE_LEAD,
  META_CONFIG,
  META_EVENT,
} from './sunyield-ad-intake.fixtures';

const setup = () => {
  const values: Record<string, string | undefined> = {
    SUNYIELD_META_LEAD_CONFIG: JSON.stringify(META_CONFIG),
    SUNYIELD_GOOGLE_ADS_LEAD_CONFIG: JSON.stringify(GOOGLE_CONFIG),
  };
  const bulkAdd = jest.fn().mockResolvedValue(['queued']);
  const service = new SunyieldAdIntakeService(
    { get: (key: string) => values[key] } as unknown as TwentyConfigService,
    { bulkAdd } as unknown as MessageQueueService,
  );
  const meta = (event: unknown = META_EVENT) => {
    const raw = Buffer.from(JSON.stringify(event));
    return {
      raw,
      signature:
        'sha256=' +
        createHmac('sha256', META_CONFIG.appSecret).update(raw).digest('hex'),
    };
  };
  return { service, values, bulkAdd, meta };
};
describe('SunYield authenticated webhook delivery', () => {
  it('returns the exact plain challenge only for the configured token and subscribe mode', () => {
    const { service } = setup();
    expect(
      service.verifyMeta({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_CONFIG.verifyToken,
        'hub.challenge': '123456',
      }),
    ).toBe('123456');
    for (const query of [
      {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': '123',
      },
      {
        'hub.mode': 'other',
        'hub.verify_token': META_CONFIG.verifyToken,
        'hub.challenge': '123',
      },
      {
        'hub.mode': 'subscribe',
        'hub.verify_token': [META_CONFIG.verifyToken],
        'hub.challenge': '123',
      },
    ])
      expect(() => service.verifyMeta(query)).toThrow(ForbiddenException);
  });
  it('queues a valid signed Meta batch with no Page token or App Secret in job data', async () => {
    const f = setup();
    const { raw, signature } = f.meta();
    await f.service.receiveMeta(raw, signature);
    expect(f.bulkAdd).toHaveBeenCalledTimes(1);
    const args = f.bulkAdd.mock.calls[0];
    expect(args[0]).toBe('SunyieldAdIntakeJob');
    expect(args[1]).toEqual([
      {
        data: {
          provider: 'meta',
          lead: { page_id: '100', form_id: '200', leadgen_id: '400' },
        },
      },
    ]);
    expect(args[2]).toMatchObject({
      retryLimit: 8,
      backoff: { strategy: 'exponential', initialDelayMilliseconds: 30000 },
    });
    expect(JSON.stringify(args)).not.toContain(
      META_CONFIG.pages[0].accessToken,
    );
    expect(JSON.stringify(args)).not.toContain(META_CONFIG.appSecret);
  });
  it.each([undefined, 'sha256=bad', 'sha1=123', 'sha256=' + '0'.repeat(64)])(
    'rejects invalid Meta signature %s before queueing',
    async (signature) => {
      const f = setup();
      await expect(
        f.service.receiveMeta(f.meta().raw, signature),
      ).rejects.toThrow(ForbiddenException);
      expect(f.bulkAdd).not.toHaveBeenCalled();
    },
  );
  it('rejects changed raw bytes and repeated authentication properties', async () => {
    const f = setup();
    const { raw, signature } = f.meta();
    await expect(
      f.service.receiveMeta(Buffer.concat([raw, Buffer.from(' ')]), signature),
    ).rejects.toThrow(ForbiddenException);
    const duplicate = Buffer.from(
      '{"object":"page","object":"page","entry":[]}',
    );
    await expect(
      f.service.receiveMeta(
        duplicate,
        'sha256=' +
          createHmac('sha256', META_CONFIG.appSecret)
            .update(duplicate)
            .digest('hex'),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(f.bulkAdd).not.toHaveBeenCalled();
  });
  it.each([
    { page_id: '101', form_id: '200', leadgen_id: '400' },
    { page_id: '100', form_id: '201', leadgen_id: '400' },
  ])(
    'validates the full Meta batch before queueing any entry',
    async (value) => {
      const f = setup();
      const event = {
        ...META_EVENT,
        entry: [
          ...META_EVENT.entry,
          { id: '100', changes: [{ field: 'leadgen', value }] },
        ],
      };
      const { raw, signature } = f.meta(event);
      await expect(f.service.receiveMeta(raw, signature)).rejects.toThrow(
        ForbiddenException,
      );
      expect(f.bulkAdd).not.toHaveBeenCalled();
    },
  );
  it('ignores unrelated signed Page changes and accepts an empty signed batch', async () => {
    const f = setup();
    const { raw, signature } = f.meta({
      ...META_EVENT,
      entry: [
        {
          id: '100',
          changes: [{ field: 'feed', value: { text: 'not a lead' } }],
        },
      ],
    });
    await f.service.receiveMeta(raw, signature);
    expect(f.bulkAdd).not.toHaveBeenCalled();
  });
  it('checks Google key, form allowlist and test-only restrictions before queueing', async () => {
    const f = setup();
    for (const change of [{ google_key: 'wrong' }, { form_id: 301 }])
      await expect(
        f.service.receiveGoogle(
          Buffer.from(JSON.stringify({ ...GOOGLE_LEAD, ...change })),
        ),
      ).rejects.toThrow(ForbiddenException);
    f.values.SUNYIELD_GOOGLE_ADS_LEAD_CONFIG = JSON.stringify({
      ...GOOGLE_CONFIG,
      forms: [{ formId: '300', testOnly: true }],
    });
    await expect(
      f.service.receiveGoogle(
        Buffer.from(JSON.stringify({ ...GOOGLE_LEAD, is_test: false })),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.bulkAdd).not.toHaveBeenCalled();
    await f.service.receiveGoogle(Buffer.from(JSON.stringify(GOOGLE_LEAD)));
    const job = f.bulkAdd.mock.calls[0][1][0].data;
    expect(job.provider).toBe('google-ads');
    expect(job.lead.form_id).toBe('300');
    expect(job.lead).not.toHaveProperty('google_key');
    expect(JSON.stringify(job)).not.toContain(GOOGLE_CONFIG.key);
  });
  it('keeps unconfigured providers unavailable instead of accepting lost deliveries', async () => {
    const f = setup();
    f.values.SUNYIELD_META_LEAD_CONFIG = JSON.stringify({
      verifyToken: META_CONFIG.verifyToken,
    });
    f.values.SUNYIELD_GOOGLE_ADS_LEAD_CONFIG = JSON.stringify({
      key: GOOGLE_CONFIG.key,
      forms: [],
    });
    await expect(
      f.service.receiveMeta(f.meta().raw, f.meta().signature),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      f.service.receiveGoogle(Buffer.from(JSON.stringify(GOOGLE_LEAD))),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(f.bulkAdd).not.toHaveBeenCalled();
  });
  it('returns a retryable sanitized error if queue acceptance is uncertain, then permits replay', async () => {
    const f = setup();
    f.bulkAdd.mockRejectedValueOnce(
      new Error('redis password and customer body must never escape'),
    );
    await expect(
      f.service.receiveGoogle(Buffer.from(JSON.stringify(GOOGLE_LEAD))),
    ).rejects.toThrow(
      new ServiceUnavailableException(
        'Ad intake queue is unavailable; retry delivery',
      ),
    );
    await f.service.receiveGoogle(Buffer.from(JSON.stringify(GOOGLE_LEAD)));
    expect(f.bulkAdd).toHaveBeenCalledTimes(2);
  });
});
