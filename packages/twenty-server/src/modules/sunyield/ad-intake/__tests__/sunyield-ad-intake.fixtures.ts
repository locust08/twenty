export const META_CONFIG = {
  verifyToken: 'meta-verification-token-for-test-only',
  appSecret: 'meta-app-secret-for-test-only-1234',
  graphApiVersion: 'v25.0',
  pages: [
    {
      pageId: '100',
      accessToken: 'page-access-token-for-test-only',
      forms: [
        {
          formId: '200',
          fields: { area: 'district', electricityBillResponse: 'monthly_bill' },
        },
      ],
    },
  ],
};
export const GOOGLE_CONFIG = {
  key: 'google-webhook-key-for-test-only-1234',
  forms: [
    { formId: '300', fields: { electricityBillResponse: 'CUSTOM_BILL' } },
  ],
};
export const META_EVENT = {
  object: 'page',
  entry: [
    {
      id: '100',
      changes: [
        {
          field: 'leadgen',
          value: { page_id: '100', form_id: '200', leadgen_id: '400' },
        },
      ],
    },
  ],
};
export const META_LEAD = {
  id: '400',
  form_id: '200',
  created_time: '2026-11-10T00:00:00+0000',
  field_data: [
    { name: 'full_name', values: ['QA Meta Lead'] },
    { name: 'phone_number', values: ['+60123456789'] },
    { name: 'district', values: ['Petaling Jaya'] },
    { name: 'monthly_bill', values: ['RM 900–1,200'] },
    { name: 'email', values: ['qa@example.invalid'] },
  ],
};
export const GOOGLE_LEAD = {
  lead_id: 'google-lead-test-400',
  form_id: 300,
  google_key: GOOGLE_CONFIG.key,
  is_test: true,
  campaign_id: 500,
  user_column_data: [
    { column_id: 'FULL_NAME', string_value: 'QA Google Lead' },
    { column_id: 'PHONE_NUMBER', string_value: '+60123456789' },
    { column_id: 'CUSTOM_BILL', string_value: 'RM 900–1,200' },
    { column_id: 'EMAIL', string_value: 'qa@example.invalid' },
  ],
};
