import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { createHmac } from 'node:crypto';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { SunyieldAdIntakeController } from '../sunyield-ad-intake.controller';
import { SunyieldAdIntakeService } from '../sunyield-ad-intake.service';
import {
  GOOGLE_CONFIG,
  GOOGLE_LEAD,
  META_CONFIG,
  META_EVENT,
} from './sunyield-ad-intake.fixtures';

describe('SunYield public provider HTTP contract', () => {
  let app: INestApplication;
  const bulkAdd = jest.fn().mockResolvedValue(['queued']);
  const values: Record<string, string> = {
    SUNYIELD_META_LEAD_CONFIG: JSON.stringify(META_CONFIG),
    SUNYIELD_GOOGLE_ADS_LEAD_CONFIG: JSON.stringify(GOOGLE_CONFIG),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SunyieldAdIntakeController],
      providers: [
        {
          provide: SunyieldAdIntakeService,
          useValue: new SunyieldAdIntakeService(
            {
              get: (key: string) => values[key],
            } as unknown as TwentyConfigService,
            { bulkAdd } as unknown as MessageQueueService,
          ),
        },
      ],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    bulkAdd.mockClear();
  });
  it('verifies the real challenge URL without CRM authentication and returns plain text', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/webhooks/sunyield/meta')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': META_CONFIG.verifyToken,
        'hub.challenge': '987654',
      })
      .expect(200);
    expect(response.text).toBe('987654');
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['cache-control']).toBe('no-store');
    await supertest(app.getHttpServer())
      .get('/webhooks/sunyield/meta')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': '987654',
      })
      .expect(403);
  });
  it('authenticates the actual raw JSON body for Meta delivery', async () => {
    const raw = JSON.stringify(META_EVENT);
    const signature =
      'sha256=' +
      createHmac('sha256', META_CONFIG.appSecret).update(raw).digest('hex');
    await supertest(app.getHttpServer())
      .post('/webhooks/sunyield/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(raw)
      .expect(200, {});
    await supertest(app.getHttpServer())
      .post('/webhooks/sunyield/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(raw + ' ')
      .expect(403);
    expect(bulkAdd).toHaveBeenCalledTimes(1);
  });
  it('accepts valid Google delivery with 200 after queueing and rejects wrong secrets', async () => {
    await supertest(app.getHttpServer())
      .post('/webhooks/sunyield/google-ads')
      .send(GOOGLE_LEAD)
      .expect(200, {});
    const failure = await supertest(app.getHttpServer())
      .post('/webhooks/sunyield/google-ads')
      .send({ ...GOOGLE_LEAD, google_key: 'bad-secret' })
      .expect(403);
    expect(failure.text).not.toContain('bad-secret');
    expect(bulkAdd).toHaveBeenCalledTimes(1);
  });
  it('returns 503 rather than 200 when queue persistence fails', async () => {
    bulkAdd.mockRejectedValueOnce(new Error('private database details'));
    const failure = await supertest(app.getHttpServer())
      .post('/webhooks/sunyield/google-ads')
      .send(GOOGLE_LEAD)
      .expect(503);
    expect(failure.text).not.toContain('private database details');
  });
});
