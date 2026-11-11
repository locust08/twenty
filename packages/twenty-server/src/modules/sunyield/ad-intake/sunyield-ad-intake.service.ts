import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { withDeadline } from 'src/utils/with-deadline';
import {
  parseMetaConfig,
  parseGoogleConfig,
} from './sunyield-ad-intake.config';
import {
  parseProviderBody,
  parseGoogleLead,
  parseGoogleDelivery,
  parseMetaEvent,
  parseMetaChange,
  type GoogleAdDelivery,
  type MetaAdChange,
} from './sunyield-ad-intake.schemas';

export type SunyieldAdIntakeJobData =
  | { provider: 'meta'; lead: MetaAdChange }
  | { provider: 'google-ads'; lead: GoogleAdDelivery };
export const SUNYIELD_AD_INTAKE_JOB_NAME = 'SunyieldAdIntakeJob';
const AD_INTAKE_QUEUE_DEADLINE_MILLISECONDS = 5000;
const META_CHALLENGE = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string().max(256),
  'hub.challenge': z.string().min(1).max(2000),
});
const sameSecret = (supplied: string, expected: string) =>
  timingSafeEqual(
    createHash('sha256').update(supplied).digest(),
    createHash('sha256').update(expected).digest(),
  );

@Injectable()
export class SunyieldAdIntakeService {
  constructor(
    private readonly config: TwentyConfigService,
    @InjectMessageQueue(MessageQueue.webhookQueue)
    private readonly queue: MessageQueueService,
  ) {}

  verifyMeta(query: unknown): string {
    const config = parseMetaConfig(
      this.config.get('SUNYIELD_META_LEAD_CONFIG'),
      true,
    );
    const parsed = META_CHALLENGE.safeParse(query);
    if (
      !parsed.success ||
      !sameSecret(parsed.data['hub.verify_token'], config.verifyToken)
    )
      throw new ForbiddenException('Invalid Meta verification request');
    return parsed.data['hub.challenge'];
  }

  async receiveMeta(
    raw: Buffer | undefined,
    signature: string | undefined,
  ): Promise<void> {
    const config = parseMetaConfig(
      this.config.get('SUNYIELD_META_LEAD_CONFIG'),
    );
    if (
      !raw ||
      !signature ||
      !/^sha256=[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature.slice(7), 'hex'),
        createHmac('sha256', config.appSecret).update(raw).digest(),
      )
    )
      throw new ForbiddenException('Invalid Meta delivery signature');
    const event = parseMetaEvent(parseProviderBody(raw));
    const jobs: SunyieldAdIntakeJobData[] = [];
    for (const entry of event.entry)
      for (const change of entry.changes) {
        if (change.field !== 'leadgen') continue;
        const lead = parseMetaChange(change.value);
        const page = config.pages.find(
          (candidate) => candidate.pageId === lead.page_id,
        );
        if (
          entry.id !== lead.page_id ||
          !page?.forms.some((form) => form.formId === lead.form_id)
        )
          throw new ForbiddenException('Meta Page or form is not configured');
        jobs.push({ provider: 'meta', lead });
      }
    await this.enqueue(jobs);
  }

  async receiveGoogle(raw: Buffer | undefined): Promise<void> {
    const config = parseGoogleConfig(
      this.config.get('SUNYIELD_GOOGLE_ADS_LEAD_CONFIG'),
    );
    const payload = parseGoogleLead(parseProviderBody(raw));
    const form = config.forms.find(
      (candidate) => candidate.formId === payload.form_id,
    );
    if (
      !sameSecret(payload.google_key, config.key) ||
      !form ||
      (form.testOnly && payload.is_test !== true)
    )
      throw new ForbiddenException('Invalid Google delivery key or form');
    await this.enqueue([
      { provider: 'google-ads', lead: parseGoogleDelivery(payload) },
    ]);
  }

  private async enqueue(jobs: SunyieldAdIntakeJobData[]): Promise<void> {
    if (jobs.length === 0) return;
    try {
      // Redis can keep an offline command pending beyond the provider's HTTP deadline.
      await withDeadline({
        promise: this.queue.bulkAdd(
          SUNYIELD_AD_INTAKE_JOB_NAME,
          jobs.map((data) => ({ data })),
          {
            retryLimit: 8,
            backoff: {
              strategy: 'exponential',
              initialDelayMilliseconds: 30000,
            },
          },
        ),
        timeoutMs: AD_INTAKE_QUEUE_DEADLINE_MILLISECONDS,
        createTimeoutError: () => new Error(),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Ad intake queue is unavailable; retry delivery',
      );
    }
  }
}
