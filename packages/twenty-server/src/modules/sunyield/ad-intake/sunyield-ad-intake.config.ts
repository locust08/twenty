import { ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { parseProviderBody } from './sunyield-ad-intake.schemas';

const IDENTIFIER = z.string().regex(/^\d{1,20}$/);
const FIELDS = z
  .object({
    name: z.string().min(1).max(256).optional(),
    rawPhone: z.string().min(1).max(256).optional(),
    area: z.string().min(1).max(256).optional(),
    postcode: z.string().min(1).max(256).optional(),
    electricityBillResponse: z.string().min(1).max(256).optional(),
  })
  .strict();
const FORM = z
  .object({
    formId: IDENTIFIER,
    fields: FIELDS.optional(),
    testOnly: z.boolean().optional(),
  })
  .strict();
const FORMS = z
  .array(FORM)
  .min(1)
  .max(100)
  .refine(
    (forms) => new Set(forms.map((form) => form.formId)).size === forms.length,
  );
const META_VERIFICATION = z.object({
  verifyToken: z.string().min(32).max(256),
});
const META_CONFIG = META_VERIFICATION.extend({
  appSecret: z.string().min(16).max(256),
  graphApiVersion: z.string().regex(/^v\d{1,3}\.\d{1,2}$/),
  pages: z
    .array(
      z
        .object({
          pageId: IDENTIFIER,
          accessToken: z.string().min(20).max(4096),
          forms: FORMS.refine((forms) =>
            forms.every((form) => form.testOnly === undefined),
          ),
        })
        .strict(),
    )
    .min(1)
    .max(20)
    .refine(
      (pages) =>
        new Set(pages.map((page) => page.pageId)).size === pages.length,
    ),
}).strict();
const GOOGLE_CONFIG = z
  .object({ key: z.string().min(32).max(256), forms: FORMS })
  .strict();

export type AdIntakeForm = z.infer<typeof FORM>;
export type MetaAdIntakeConfig = z.infer<typeof META_CONFIG>;
export type MetaAdIntakePage = MetaAdIntakeConfig['pages'][number];
export type GoogleAdIntakeConfig = z.infer<typeof GOOGLE_CONFIG>;

const parseConfig = <TData>(
  raw: string | undefined,
  schema: z.ZodType<TData>,
): TData => {
  try {
    if (!raw || raw.length > 65536) throw new Error();
    const value = parseProviderBody(Buffer.from(raw));
    return schema.parse(value);
  } catch {
    throw new ServiceUnavailableException(
      'Ad intake configuration is incomplete',
    );
  }
};

export function parseMetaConfig(
  raw: string | undefined,
  verification: true,
): z.infer<typeof META_VERIFICATION>;
export function parseMetaConfig(
  raw: string | undefined,
  verification?: false,
): MetaAdIntakeConfig;
export function parseMetaConfig(raw: string | undefined, verification = false) {
  return verification
    ? parseConfig(raw, META_VERIFICATION)
    : parseConfig(raw, META_CONFIG);
}
export const parseGoogleConfig = (
  raw: string | undefined,
): GoogleAdIntakeConfig => parseConfig(raw, GOOGLE_CONFIG);
