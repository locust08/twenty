import { type SendMailOptions } from 'nodemailer';
import { isDefined } from 'twenty-shared/utils';

import { type EmailDriverInterface } from 'src/engine/core-modules/email/drivers/interfaces/email-driver.interface';

const addresses = (value: SendMailOptions['to']): string[] | undefined => {
  if (!isDefined(value)) return undefined;
  if (Array.isArray(value)) {
    return value.flatMap((address) => addresses(address) ?? []);
  }
  if (typeof value === 'string') return [value];
  if (!isDefined(value.address) || !value.address) {
    throw new Error('Email address is required');
  }
  return [
    value.name
      ? `${JSON.stringify(value.name)} <${value.address}>`
      : value.address,
  ];
};

export class ResendDriver implements EmailDriverInterface {
  constructor(
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error('EMAIL_RESEND_API_KEY is required');
  }

  async send(options: SendMailOptions): Promise<void> {
    if (options.raw || options.envelope || options.alternatives) {
      throw new Error('Unsupported Resend system email format');
    }
    const content = (value: SendMailOptions['html']) => {
      if (!isDefined(value)) return undefined;
      if (typeof value === 'string') return value;
      if (Buffer.isBuffer(value)) return value.toString('utf8');
      throw new Error('Resend system email content must be text');
    };
    const attachments = options.attachments?.map((attachment) => {
      if (
        attachment.path ||
        attachment.href ||
        !isDefined(attachment.content) ||
        !(
          typeof attachment.content === 'string' ||
          Buffer.isBuffer(attachment.content)
        )
      ) {
        throw new Error('Resend attachment must contain inline content');
      }
      return {
        filename: attachment.filename || 'attachment',
        content: Buffer.isBuffer(attachment.content)
          ? attachment.content.toString('base64')
          : Buffer.from(
              attachment.content,
              (attachment.encoding || 'utf8') as BufferEncoding,
            ).toString('base64'),
        content_type: attachment.contentType,
        content_id: attachment.cid,
      };
    });
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        from: addresses(options.from)?.[0],
        to: addresses(options.to),
        cc: addresses(options.cc),
        bcc: addresses(options.bcc),
        reply_to: addresses(options.replyTo),
        subject: options.subject,
        text: content(options.text),
        html: content(options.html),
        attachments,
      }),
    });
    if (!response.ok)
      throw new Error(`Resend email request failed (${response.status})`);
  }
}
