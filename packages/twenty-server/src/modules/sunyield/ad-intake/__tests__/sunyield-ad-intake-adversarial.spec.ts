import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  parseGoogleConfig,
  parseMetaConfig,
} from '../sunyield-ad-intake.config';
import {
  parseProviderBody,
  parseGoogleLead,
  parseMetaLead,
} from '../sunyield-ad-intake.schemas';
import { mapGoogleLead } from '../sunyield-ad-intake.mapping';
import { SunyieldAdIntakeService } from '../sunyield-ad-intake.service';
import {
  GOOGLE_CONFIG,
  GOOGLE_LEAD,
  META_CONFIG,
  META_EVENT,
} from './sunyield-ad-intake.fixtures';

const setup = () => {
  const bulkAdd = jest.fn().mockResolvedValue(['queued']);
  const config = {
    get: (name: string) =>
      JSON.stringify(
        name === 'SUNYIELD_META_LEAD_CONFIG' ? META_CONFIG : GOOGLE_CONFIG,
      ),
  } as unknown as TwentyConfigService;
  return {
    bulkAdd,
    service: new SunyieldAdIntakeService(config, {
      bulkAdd,
    } as unknown as MessageQueueService),
  };
};

describe('ad intake adversarial and boundary cases', () => {
  it.each(
    [
      [0xff],
      [0xc0, 0xaf],
      [0xe0, 0x80, 0xaf],
      [0xed, 0xa0, 0x80],
      [0xf4, 0x90, 0x80, 0x80],
    ].map((bytes) => ({ bytes })),
  )(
    'rejects invalid UTF-8 rather than silently changing submitted answers: %j',
    ({ bytes }) => {
      const raw = Buffer.concat([
        Buffer.from('{"answer":"'),
        Buffer.from(bytes),
        Buffer.from('"}'),
      ]);
      expect(() => parseProviderBody(raw)).toThrow(BadRequestException);
    },
  );
  it('preserves 2,000 deterministic valid JSON values containing Unicode, escapes, braces and quoted pseudo-properties', () => {
    let state = 0x167930;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    const characters = [
      'a',
      '"',
      '\\',
      '\n',
      '\r',
      '\t',
      '{',
      '}',
      ':',
      '[',
      ']',
      '你',
      '🙂',
      'é',
      '\u2028',
      '\u0000',
      '`',
    ];
    for (let index = 0; index < 2000; index++) {
      const sample = () =>
        Array.from(
          { length: random() % 40 },
          () => characters[random() % characters.length],
        ).join('');
      const key = sample();
      const value = {
        text: sample(),
        nested: [{ [key]: sample() }, sample(), null, true, false, random()],
        more: { text: sample(), deep: { value: sample() } },
      };
      expect(parseProviderBody(Buffer.from(JSON.stringify(value)))).toEqual(
        value,
      );
    }
  });
  it.each([
    '{"a":[{"k":1,"\\u006b":2}]}',
    '{"google_key":"x","\\u0067oogle_key":"y"}',
    '{"f\\"oo":1,"f\\"oo":2}',
  ])('rejects nested/escaped duplicate properties: %s', (raw) => {
    expect(() => parseProviderBody(Buffer.from(raw))).toThrow(
      BadRequestException,
    );
  });
  it('enforces the byte boundary without rejecting a valid body exactly at 256 KiB', () => {
    const prefix = Buffer.from('{"padding":"'),
      suffix = Buffer.from('"}');
    const exact = Buffer.concat([
      prefix,
      Buffer.alloc(256 * 1024 - prefix.length - suffix.length, 97),
      suffix,
    ]);
    expect(parseProviderBody(exact)).toMatchObject({
      padding: expect.any(String),
    });
    expect(() =>
      parseProviderBody(Buffer.concat([exact, Buffer.from(' ')])),
    ).toThrow(BadRequestException);
  });
  it.each(['-1', '1.5', '1e30', '9007199254740993.0'])(
    'refuses malformed or ambiguous numeric Google form identifiers: %s',
    (identifier) => {
      const raw = JSON.stringify(GOOGLE_LEAD).replace(
        '"form_id":300',
        '"form_id":' + identifier,
      );
      expect(() =>
        parseGoogleLead(parseProviderBody(Buffer.from(raw))),
      ).toThrow(BadRequestException);
    },
  );
  it('preserves large numeric Meta ad identifiers and accepts organic responses with no ad ID', () => {
    const data = parseMetaLead(
      parseProviderBody(
        Buffer.from(
          '{"id":9223372036854775807,"form_id":9223372036854775806,"ad_id":9223372036854775805,"created_time":"2026-11-10T00:00:00Z","field_data":[]}',
        ),
      ),
    );
    expect(data).toMatchObject({
      id: '9223372036854775807',
      form_id: '9223372036854775806',
      ad_id: '9223372036854775805',
    });
    expect(parseMetaLead({ ...data, ad_id: undefined }).ad_id).toBeUndefined();
    expect(parseMetaLead({ ...data, ad_id: null }).ad_id).toBeNull();
  });
  it('keeps __proto__ and constructor answers as inert data without polluting mappings', () => {
    const parsed = parseGoogleLead({
      ...GOOGLE_LEAD,
      form_id: '300',
      user_column_data: [
        { column_id: '__proto__', string_value: 'pollute' },
        { column_id: 'constructor', string_value: 'inert' },
      ],
    });
    const mapped = mapGoogleLead(parsed, GOOGLE_CONFIG.forms[0]);
    expect(mapped.lead.rawPhone).toBeUndefined();
    expect(mapped.answers.constructor).toEqual(['inert']);
    expect(Object.getPrototypeOf(mapped.lead)).toBe(Object.prototype);
  });
  it('rejects duplicate authentication properties in provider configuration as unavailable', () => {
    const raw = JSON.stringify(GOOGLE_CONFIG).replace(
      '"key":',
      '"key":"other","key":',
    );
    expect(() => parseGoogleConfig(raw)).toThrow(ServiceUnavailableException);
  });
  it('fails closed on the Google-only testOnly setting in Meta configuration', () => {
    const config = {
      ...META_CONFIG,
      pages: [
        { ...META_CONFIG.pages[0], forms: [{ formId: '200', testOnly: true }] },
      ],
    };
    expect(() => parseMetaConfig(JSON.stringify(config))).toThrow(
      ServiceUnavailableException,
    );
  });
  it('does not acknowledge a Meta batch if queue acceptance fails after a partial transport result', async () => {
    const f = setup();
    const raw = Buffer.from(
      JSON.stringify({
        ...META_EVENT,
        entry: [
          ...META_EVENT.entry,
          {
            id: '100',
            changes: [
              {
                field: 'leadgen',
                value: { page_id: '100', form_id: '200', leadgen_id: '401' },
              },
            ],
          },
        ],
      }),
    );
    const signature =
      'sha256=' +
      createHmac('sha256', META_CONFIG.appSecret).update(raw).digest('hex');
    f.bulkAdd.mockRejectedValueOnce(
      new Error('transport lost after accepting one lead'),
    );
    await expect(f.service.receiveMeta(raw, signature)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await f.service.receiveMeta(raw, signature);
    expect(f.bulkAdd).toHaveBeenCalledTimes(2);
    expect(f.bulkAdd.mock.calls[1][1]).toHaveLength(2);
  });
  it('returns a retryable response at five seconds when queue acceptance never settles', async () => {
    jest.useFakeTimers();
    try {
      const f = setup();
      f.bulkAdd.mockImplementation(() => new Promise(() => {}));
      let outcome: unknown = 'pending';
      void f.service
        .receiveGoogle(Buffer.from(JSON.stringify(GOOGLE_LEAD)))
        .then(
          () => {
            outcome = 'accepted';
          },
          (error) => {
            outcome = error;
          },
        );
      await jest.advanceTimersByTimeAsync(4999);
      expect(outcome).toBe('pending');
      await jest.advanceTimersByTimeAsync(1);
      expect(outcome).toBeInstanceOf(ServiceUnavailableException);
    } finally {
      jest.useRealTimers();
    }
  });
  it.each(['resolve', 'reject'] as const)(
    'retains the retryable result when an uncertain queue command later %ss',
    async (settlement) => {
      jest.useFakeTimers();
      try {
        const f = setup();
        let resolveLate: (value: string[]) => void = () => {};
        let rejectLate: (error: Error) => void = () => {};
        f.bulkAdd.mockImplementation(
          () =>
            new Promise<string[]>((resolve, reject) => {
              resolveLate = resolve;
              rejectLate = reject;
            }),
        );
        let outcome: unknown = 'pending';
        void f.service
          .receiveGoogle(Buffer.from(JSON.stringify(GOOGLE_LEAD)))
          .then(
            () => {
              outcome = 'accepted';
            },
            (error) => {
              outcome = error;
            },
          );
        await jest.advanceTimersByTimeAsync(10000);
        expect(outcome).toBeInstanceOf(ServiceUnavailableException);
        if (settlement === 'resolve') resolveLate(['late-queue-job']);
        else rejectLate(new Error('late private failure'));
        await jest.advanceTimersByTimeAsync(1);
        expect(outcome).toBeInstanceOf(ServiceUnavailableException);
      } finally {
        jest.useRealTimers();
      }
    },
  );
});
