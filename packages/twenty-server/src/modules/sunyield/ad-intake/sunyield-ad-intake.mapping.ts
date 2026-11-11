import {
  type AdIntakeForm,
  type MetaAdIntakePage,
} from './sunyield-ad-intake.config';
import { buildAdIntakeIdentity } from './sunyield-ad-intake.identity';
import {
  type GoogleAdDelivery,
  type MetaAdLead,
  type MetaAdChange,
} from './sunyield-ad-intake.schemas';

export type NormalizedAdLead = {
  identity: ReturnType<typeof buildAdIntakeIdentity>;
  provider: 'meta' | 'google-ads';
  lead: {
    name: string;
    source: 'FACEBOOK' | 'GOOGLE_ADS';
    rawPhone?: string;
    area?: string;
    postcode?: string;
    electricityBillResponse?: string;
    originalLeadDate?: string;
  };
  answers: Record<string, string[]>;
  provenance: Record<string, string | boolean>;
};

const mapAnswers = (
  answers: Record<string, string[]>,
  form: AdIntakeForm,
  provider: 'meta' | 'google-ads',
) => {
  const defaults =
    provider === 'meta'
      ? {
          name: 'full_name',
          rawPhone: 'phone_number',
          postcode: 'zip_code',
          area: 'city',
        }
      : {
          name: 'FULL_NAME',
          rawPhone: 'PHONE_NUMBER',
          postcode: 'POSTAL_CODE',
          area: 'CITY',
        };
  const fields = { ...defaults, ...form.fields };
  const mapped: Record<string, string> = {};
  for (const target of [
    'name',
    'rawPhone',
    'area',
    'postcode',
    'electricityBillResponse',
  ] as const) {
    const key = fields[target];
    const values =
      key && Object.prototype.hasOwnProperty.call(answers, key)
        ? answers[key]
        : undefined;
    const answer = values?.join(', ').trim();
    if (answer) mapped[target] = answer;
  }
  if (!mapped.name) {
    const keys =
      provider === 'meta'
        ? ['first_name', 'last_name']
        : ['FIRST_NAME', 'LAST_NAME'];
    const name = keys
      .flatMap((key) =>
        Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : [],
      )
      .join(' ')
      .trim();
    if (name) mapped.name = name;
  }
  return mapped;
};

export const mapGoogleLead = (
  payload: GoogleAdDelivery,
  form: AdIntakeForm,
): NormalizedAdLead => {
  const answers = Object.fromEntries(
    payload.user_column_data.map((column) => [
      column.column_id,
      [column.string_value],
    ]),
  );
  const fields = mapAnswers(answers, form, 'google-ads');
  const name = fields.name ?? 'Google Ads lead ' + payload.lead_id;
  const provenance: Record<string, string | boolean> = {
    providerLeadId: payload.lead_id,
    formId: payload.form_id,
    isTest: payload.is_test === true,
  };
  for (const key of [
    'campaign_id',
    'adgroup_id',
    'creative_id',
    'asset_group_id',
    'gcl_id',
    'lead_submit_time',
    'lead_source',
  ] as const) {
    const value = payload[key];
    if (value !== undefined) provenance[key] = value;
  }
  return {
    provider: 'google-ads',
    identity: buildAdIntakeIdentity('google-ads', payload.lead_id),
    answers,
    provenance,
    lead: {
      ...fields,
      name: payload.is_test ? 'QA GOOGLE ADS TEST — ' + name : name,
      source: 'GOOGLE_ADS',
      ...(payload.lead_submit_time
        ? { originalLeadDate: new Date(payload.lead_submit_time).toISOString() }
        : {}),
    },
  };
};
export const mapMetaLead = (
  payload: MetaAdLead,
  page: MetaAdIntakePage,
  form: AdIntakeForm,
  notification?: MetaAdChange,
): NormalizedAdLead => {
  const answers = Object.fromEntries(
    payload.field_data.map((field) => [field.name, field.values]),
  );
  const fields = mapAnswers(answers, form, 'meta');
  return {
    provider: 'meta',
    identity: buildAdIntakeIdentity('meta', payload.id, page.pageId),
    answers,
    provenance: {
      providerLeadId: payload.id,
      pageId: page.pageId,
      formId: payload.form_id,
      createdTime: payload.created_time,
      ...(payload.ad_id ? { ad_id: payload.ad_id } : {}),
      ...(notification?.ad_id ? { webhook_ad_id: notification.ad_id } : {}),
      ...(notification?.adgroup_id
        ? { adgroup_id: notification.adgroup_id }
        : {}),
    },
    lead: {
      ...fields,
      name: fields.name ?? 'Meta lead ' + payload.id,
      source: 'FACEBOOK',
      originalLeadDate: new Date(payload.created_time).toISOString(),
    },
  };
};
