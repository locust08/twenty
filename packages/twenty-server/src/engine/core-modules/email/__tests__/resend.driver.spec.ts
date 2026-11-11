import { ResendDriver } from 'src/engine/core-modules/email/drivers/resend.driver';

describe('Resend system email', () => {
  const request = jest.fn();
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'message' }),
    });
  });
  it('sends system message content and reply address over HTTPS', async () => {
    await new ResendDriver('secret', request).send({
      from: 'Sunyield <crm@example.com>',
      to: ['ava@example.com'],
      subject: 'Invitation',
      html: '<a href="https://crm.example.com/invite">Join</a>',
      replyTo: 'support@example.com',
    });
    expect(request.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      from: 'Sunyield <crm@example.com>',
      to: ['ava@example.com'],
      subject: 'Invitation',
      html: '<a href="https://crm.example.com/invite">Join</a>',
      reply_to: ['support@example.com'],
    });
  });
  it('supports address objects and buffer attachments', async () => {
    await new ResendDriver('secret', request).send({
      from: { name: 'CRM', address: 'crm@example.com' },
      to: { name: 'Ava', address: 'ava@example.com' },
      subject: 'Export',
      text: 'Attached',
      attachments: [{ filename: 'test.csv', content: Buffer.from('a,b') }],
    });
    expect(JSON.parse(request.mock.calls[0][1].body).attachments).toEqual([
      { filename: 'test.csv', content: 'YSxi' },
    ]);
  });
  it('flattens nested recipient lists', async () => {
    await new ResendDriver('secret', request).send({
      from: 'crm@example.com',
      to: [
        ['ava@example.com', { name: 'Sales', address: 'sales@example.com' }],
      ],
      text: 'Test',
    });
    expect(JSON.parse(request.mock.calls[0][1].body).to).toEqual([
      'ava@example.com',
      '\"Sales\" <sales@example.com>',
    ]);
  });
  it('rejects an address object without an email address', async () => {
    await expect(
      new ResendDriver('secret', request).send({
        from: 'crm@example.com',
        to: { name: 'Missing' },
        text: 'Test',
      }),
    ).rejects.toThrow('Email address is required');
    expect(request).not.toHaveBeenCalled();
  });
  it('propagates provider failures without logging body or credentials', async () => {
    request.mockResolvedValue({ ok: false, status: 429 });
    await expect(
      new ResendDriver('secret', request).send({
        from: 'crm@example.com',
        to: 'ava@example.com',
        text: 'private',
      }),
    ).rejects.toThrow('Resend email request failed (429)');
  });
  it('rejects unsupported attachments rather than silently dropping them', async () => {
    await expect(
      new ResendDriver('secret', request).send({
        from: 'crm@example.com',
        to: 'ava@example.com',
        attachments: [{ path: '/private/file' }],
      }),
    ).rejects.toThrow('attachment');
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects empty credentials', () => {
    expect(() => new ResendDriver('')).toThrow('EMAIL_RESEND_API_KEY');
  });
});
