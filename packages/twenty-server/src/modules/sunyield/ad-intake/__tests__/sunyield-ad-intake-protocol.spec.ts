import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  parseMetaConfig,
  parseGoogleConfig,
} from '../sunyield-ad-intake.config';
import {
  parseProviderBody,
  parseGoogleLead,
  parseMetaEvent,
} from '../sunyield-ad-intake.schemas';
import { mapGoogleLead, mapMetaLead } from '../sunyield-ad-intake.mapping';
import { buildAdIntakeIdentity } from '../sunyield-ad-intake.identity';
import {
  GOOGLE_CONFIG,
  GOOGLE_LEAD,
  META_CONFIG,
  META_EVENT,
  META_LEAD,
} from './sunyield-ad-intake.fixtures';

describe('SunYield ad intake protocol', () => {
  it('accepts explicit provider configuration and custom question identifiers', () => {
    expect(parseMetaConfig(JSON.stringify(META_CONFIG))).toEqual(META_CONFIG);
    expect(parseGoogleConfig(JSON.stringify(GOOGLE_CONFIG))).toEqual(
      GOOGLE_CONFIG,
    );
  });
  it.each([
    undefined,
    '',
    '{}',
    '{invalid',
    JSON.stringify({ ...GOOGLE_CONFIG, forms: [] }),
  ])(
    'keeps Google delivery closed with incomplete configuration %s',
    (value) => {
      expect(() => parseGoogleConfig(value)).toThrow(
        ServiceUnavailableException,
      );
    },
  );
  it('permits Meta verification preparation before actual App credentials exist', () => {
    expect(
      parseMetaConfig(
        JSON.stringify({ verifyToken: META_CONFIG.verifyToken }),
        true,
      ),
    ).toEqual({ verifyToken: META_CONFIG.verifyToken });
    expect(() =>
      parseMetaConfig(JSON.stringify({ verifyToken: META_CONFIG.verifyToken })),
    ).toThrow(ServiceUnavailableException);
  });
  it.each([
    { ...META_CONFIG, pages: [{ ...META_CONFIG.pages[0], forms: [] }] },
    { ...META_CONFIG, graphApiVersion: 'https://other.invalid' },
    { ...META_CONFIG, pages: [META_CONFIG.pages[0], META_CONFIG.pages[0]] },
    {
      ...GOOGLE_CONFIG,
      forms: [GOOGLE_CONFIG.forms[0], GOOGLE_CONFIG.forms[0]],
    },
  ])('rejects malformed or ambiguous provider configuration', (value) => {
    const parse = 'pages' in value ? parseMetaConfig : parseGoogleConfig;
    expect(() => parse(JSON.stringify(value))).toThrow(
      ServiceUnavailableException,
    );
  });
  it('preserves Google numeric form and campaign IDs beyond safe JavaScript integers', () => {
    const raw = JSON.stringify(GOOGLE_LEAD)
      .replace('"form_id":300', '"form_id":9223372036854775807')
      .replace('"campaign_id":500', '"campaign_id":9223372036854775806');
    const parsed = parseGoogleLead(parseProviderBody(Buffer.from(raw)));
    expect(parsed.form_id).toBe('9223372036854775807');
    expect(parsed.campaign_id).toBe('9223372036854775806');
  });
  it.each([
    '{"google_key":"one","google_key":"two"}',
    '{"google_key":"one","google\\u005fkey":"two"}',
    '{"nested":{"id":"1","id":"2"}}',
    'not JSON',
  ])('rejects duplicate JSON keys or malformed input: %s', (raw) => {
    expect(() => parseProviderBody(Buffer.from(raw))).toThrow(
      BadRequestException,
    );
  });
  it('does not confuse quoted JSON, nested fields or escaped content with duplicate keys', () => {
    const value = {
      text: '{"google_key":"one","google_key":"two"}',
      a: { id: '1' },
      b: { id: '2' },
    };
    expect(parseProviderBody(Buffer.from(JSON.stringify(value)))).toEqual(
      value,
    );
  });
  it('rejects oversized raw bodies before parsing', () => {
    expect(() => parseProviderBody(Buffer.alloc(256 * 1024 + 1))).toThrow(
      BadRequestException,
    );
  });
  it('accepts forward-compatible Google properties without treating them as CRM write options', () => {
    const parsed = parseGoogleLead(
      parseProviderBody(
        Buffer.from(
          JSON.stringify({
            ...GOOGLE_LEAD,
            new_provider_field: true,
            assignedSalespersonId: 'claimed',
            source: 'FACEBOOK',
          }),
        ),
      ),
    );
    const mapped = mapGoogleLead(parsed, GOOGLE_CONFIG.forms[0]);
    expect(mapped.lead.source).toBe('GOOGLE_ADS');
    expect(mapped.lead).not.toHaveProperty('assignedSalespersonId');
    expect(mapped.lead).not.toHaveProperty('leadType');
    expect(mapped.lead.name).toContain('QA GOOGLE ADS TEST');
    expect(mapped.lead.electricityBillResponse).toBe('RM 900–1,200');
    expect(mapped.answers.EMAIL).toEqual(['qa@example.invalid']);
  });
  it('maps Meta exact field identifiers and preserves original answers for provenance', () => {
    const mapped = mapMetaLead(
      META_LEAD,
      META_CONFIG.pages[0],
      META_CONFIG.pages[0].forms[0],
    );
    expect(mapped.lead).toMatchObject({
      source: 'FACEBOOK',
      name: 'QA Meta Lead',
      rawPhone: '+60123456789',
      area: 'Petaling Jaya',
      electricityBillResponse: 'RM 900–1,200',
      originalLeadDate: '2026-11-10T00:00:00.000Z',
    });
    expect(mapped.answers.email).toEqual(['qa@example.invalid']);
  });
  it('does not invent absent bill answers or phone numbers', () => {
    const mapped = mapGoogleLead(
      parseGoogleLead({
        ...GOOGLE_LEAD,
        form_id: '300',
        user_column_data: [],
        is_test: false,
      }),
      GOOGLE_CONFIG.forms[0],
    );
    expect(mapped.lead.rawPhone).toBeUndefined();
    expect(mapped.lead.electricityBillResponse).toBeUndefined();
    expect(mapped.lead.name).toBe('Google Ads lead google-lead-test-400');
  });
  it('bounds provider payloads and refuses ambiguous answer keys', () => {
    expect(() =>
      parseGoogleLead({
        ...GOOGLE_LEAD,
        form_id: '300',
        user_column_data: [
          ...GOOGLE_LEAD.user_column_data,
          GOOGLE_LEAD.user_column_data[0],
        ],
      }),
    ).toThrow(BadRequestException);
    expect(() => parseMetaEvent({ ...META_EVENT, object: 'other' })).toThrow(
      BadRequestException,
    );
  });
  it('uses stable namespaced identities without mixing providers, Pages or leads', () => {
    const first = buildAdIntakeIdentity('meta', '400', '100');
    expect(first).toEqual(buildAdIntakeIdentity('meta', '400', '100'));
    expect(first).not.toEqual(buildAdIntakeIdentity('meta', '400', '101'));
    expect(first).not.toEqual(buildAdIntakeIdentity('google-ads', '400'));
    expect(first.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(first.submissionId.length).toBeLessThan(128);
    expect(new Set([first.id, first.noteId, first.targetId]).size).toBe(3);
  });
});
