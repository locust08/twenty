import { createHmac } from 'node:crypto';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  parseGoogleConfig,
  parseMetaConfig,
} from './sunyield-ad-intake.config';
import { buildAdIntakeIdentity } from './sunyield-ad-intake.identity';
import {
  mapGoogleLead,
  mapMetaLead,
  type NormalizedAdLead,
} from './sunyield-ad-intake.mapping';
import {
  parseGoogleDelivery,
  parseMetaChange,
  parseMetaLead,
  parseProviderBody,
} from './sunyield-ad-intake.schemas';
import {
  SUNYIELD_AD_INTAKE_JOB_NAME,
  type SunyieldAdIntakeJobData,
} from './sunyield-ad-intake.service';
import { SunyieldAdIntakeStore } from './sunyield-ad-intake.store';

@Processor(MessageQueue.webhookQueue)
export class SunyieldAdIntakeJob {
  constructor(
    private readonly config: TwentyConfigService,
    private readonly store: SunyieldAdIntakeStore,
    private readonly http: SecureHttpClientService,
  ) {}

  @Process(SUNYIELD_AD_INTAKE_JOB_NAME)
  async handle(data: SunyieldAdIntakeJobData): Promise<void> {
    let normalized: NormalizedAdLead;
    if (data.provider === 'google-ads') {
      const payload = parseGoogleDelivery(data.lead);
      const config = parseGoogleConfig(
        this.config.get('SUNYIELD_GOOGLE_ADS_LEAD_CONFIG'),
      );
      const form = config.forms.find(
        (candidate) => candidate.formId === payload.form_id,
      );
      if (!form || (form.testOnly && payload.is_test !== true))
        throw new Error(
          'Google form is no longer configured for this delivery',
        );
      normalized = mapGoogleLead(payload, form);
    } else if (data.provider === 'meta') {
      const lead = parseMetaChange(data.lead);
      const config = parseMetaConfig(
        this.config.get('SUNYIELD_META_LEAD_CONFIG'),
      );
      const page = config.pages.find(
        (candidate) => candidate.pageId === lead.page_id,
      );
      const form = page?.forms.find(
        (candidate) => candidate.formId === lead.form_id,
      );
      if (!page || !form)
        throw new Error('Meta Page or form is no longer configured');
      try {
        if (
          await this.store.has(
            buildAdIntakeIdentity('meta', lead.leadgen_id, lead.page_id)
              .submissionId,
          )
        )
          return;
      } catch {
        throw new Error('Ad intake storage failed');
      }
      try {
        const client = this.http.getHttpClient({
          timeout: 10000,
          maxRedirects: 0,
          retries: 0,
          maxContentLength: 256 * 1024,
          responseType: 'text',
        });
        const response = await client.get<unknown>(
          'https://graph.facebook.com/' +
            config.graphApiVersion +
            '/' +
            lead.leadgen_id,
          {
            headers: { Authorization: 'Bearer ' + page.accessToken },
            params: {
              fields: 'id,created_time,form_id,ad_id,field_data',
              appsecret_proof: createHmac('sha256', config.appSecret)
                .update(page.accessToken)
                .digest('hex'),
            },
          },
        );
        if (typeof response.data !== 'string') throw new Error();
        const payload = parseMetaLead(
          parseProviderBody(Buffer.from(response.data)),
        );
        if (payload.id !== lead.leadgen_id || payload.form_id !== lead.form_id)
          throw new Error();
        normalized = mapMetaLead(payload, page, form, lead);
      } catch {
        throw new Error('Meta lead retrieval failed');
      }
    } else throw new Error('Unsupported ad intake provider');
    try {
      await this.store.create(normalized);
    } catch {
      throw new Error('Ad intake storage failed');
    }
  }
}
