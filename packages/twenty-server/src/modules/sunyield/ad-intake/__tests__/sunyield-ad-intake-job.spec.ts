import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { SunyieldAdIntakeJob } from '../sunyield-ad-intake.job';
import { type SunyieldAdIntakeStore } from '../sunyield-ad-intake.store';
import {
  GOOGLE_CONFIG,
  GOOGLE_LEAD,
  META_CONFIG,
  META_LEAD,
} from './sunyield-ad-intake.fixtures';
import {
  parseGoogleDelivery,
  parseProviderBody,
} from '../sunyield-ad-intake.schemas';
const setup = () => {
  const values: Record<string, string | undefined> = {
    SUNYIELD_META_LEAD_CONFIG: JSON.stringify(META_CONFIG),
    SUNYIELD_GOOGLE_ADS_LEAD_CONFIG: JSON.stringify(GOOGLE_CONFIG),
  };
  const create = jest.fn().mockResolvedValue(undefined),
    has = jest.fn().mockResolvedValue(false);
  const get = jest.fn().mockResolvedValue({ data: JSON.stringify(META_LEAD) }),
    getHttpClient = jest.fn().mockReturnValue({ get });
  return {
    values,
    create,
    has,
    get,
    getHttpClient,
    job: new SunyieldAdIntakeJob(
      { get: (key: string) => values[key] } as unknown as TwentyConfigService,
      { create, has } as unknown as SunyieldAdIntakeStore,
      { getHttpClient } as unknown as SecureHttpClientService,
    ),
  };
};
const meta = {
  provider: 'meta',
  lead: { page_id: '100', form_id: '200', leadgen_id: '400' },
} as const;
const google = () => ({
  provider: 'google-ads' as const,
  lead: parseGoogleDelivery(
    parseProviderBody(Buffer.from(JSON.stringify(GOOGLE_LEAD))),
  ),
});
describe('SunYield ad intake worker', () => {
  it('retains exact Meta Graph and webhook ad identifiers in submission provenance', async () => {
    const f = setup();
    f.get.mockResolvedValue({
      data: JSON.stringify({ ...META_LEAD, ad_id: '600' }),
    });
    await f.job.handle({
      ...meta,
      lead: { ...meta.lead, ad_id: '600', adgroup_id: '700' },
    });
    expect(f.create.mock.calls[0][0].provenance).toMatchObject({
      ad_id: '600',
      webhook_ad_id: '600',
      adgroup_id: '700',
    });
  });
  it('retrieves only the fixed Graph lead with a server-side Page credential and bounded client', async () => {
    const f = setup();
    await f.job.handle(meta);
    expect(f.getHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRedirects: 0,
        timeout: 10000,
        retries: 0,
        maxContentLength: 262144,
        responseType: 'text',
      }),
    );
    expect(f.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v25.0/400',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer ' + META_CONFIG.pages[0].accessToken,
        },
        params: expect.objectContaining({
          fields: 'id,created_time,form_id,ad_id,field_data',
        }),
      }),
    );
    expect(f.create.mock.calls[0][0].lead).toMatchObject({
      source: 'FACEBOOK',
      name: 'QA Meta Lead',
    });
  });
  it.each([
    { ...META_LEAD, id: '401' },
    { ...META_LEAD, form_id: '201' },
    { error: { message: 'secret upstream details' } },
  ])(
    'refuses mismatched or invalid retrieved Meta identity',
    async (payload) => {
      const f = setup();
      f.get.mockResolvedValue({ data: JSON.stringify(payload) });
      await expect(f.job.handle(meta)).rejects.toThrow(
        'Meta lead retrieval failed',
      );
      expect(f.create).not.toHaveBeenCalled();
    },
  );
  it('does not refetch or rewrite an existing or soft-deleted Meta submission', async () => {
    const f = setup();
    f.has.mockResolvedValue(true);
    await f.job.handle(meta);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
  it('sanitizes network/provider errors and allows the queue to retry', async () => {
    const f = setup();
    f.get.mockRejectedValue(
      new Error('Page credential secret and provider response body'),
    );
    await expect(f.job.handle(meta)).rejects.toThrow(
      new Error('Meta lead retrieval failed'),
    );
    expect(f.create).not.toHaveBeenCalled();
  });
  it('rechecks Page/form allowlists after delivery acceptance', async () => {
    const f = setup();
    f.values.SUNYIELD_META_LEAD_CONFIG = JSON.stringify({
      ...META_CONFIG,
      pages: [{ ...META_CONFIG.pages[0], forms: [{ formId: '201' }] }],
    });
    await expect(f.job.handle(meta)).rejects.toThrow();
    expect(f.get).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    f.values.SUNYIELD_GOOGLE_ADS_LEAD_CONFIG = JSON.stringify({
      ...GOOGLE_CONFIG,
      forms: [{ formId: '301' }],
    });
    await expect(f.job.handle(google())).rejects.toThrow();
    expect(f.create).not.toHaveBeenCalled();
  });
  it('maps a Google job without making any outbound request', async () => {
    const f = setup();
    await f.job.handle(google());
    expect(f.getHttpClient).not.toHaveBeenCalled();
    expect(f.create.mock.calls[0][0]).toMatchObject({
      provider: 'google-ads',
      lead: { source: 'GOOGLE_ADS' },
    });
    expect(JSON.stringify(f.create.mock.calls[0][0])).not.toContain(
      GOOGLE_CONFIG.key,
    );
  });
  it('fences real Google jobs after a form becomes test-only', async () => {
    const f = setup();
    f.values.SUNYIELD_GOOGLE_ADS_LEAD_CONFIG = JSON.stringify({
      ...GOOGLE_CONFIG,
      forms: [{ formId: '300', testOnly: true }],
    });
    const job = google();
    job.lead.is_test = false;
    await expect(f.job.handle(job)).rejects.toThrow();
    expect(f.create).not.toHaveBeenCalled();
  });
  it('sanitizes database failures instead of disclosing inserted answers in worker errors', async () => {
    const f = setup();
    f.create.mockRejectedValue(new Error('customer SQL parameters'));
    await expect(f.job.handle(google())).rejects.toThrow(
      new Error('Ad intake storage failed'),
    );
  });
});
