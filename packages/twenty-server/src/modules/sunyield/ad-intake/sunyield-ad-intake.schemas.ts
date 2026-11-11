import { BadRequestException } from '@nestjs/common';
import { isUtf8 } from 'node:buffer';
import { z } from 'zod';

const IDENTIFIER = z.union([
  z.string().regex(/^\d{1,20}$/),
  z.number().int().nonnegative().safe().transform(String),
]);
const TEXT = z.string().max(10000);
const GOOGLE_LEAD = z.object({
  lead_id: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[^\x00-\x1f\x7f]+$/),
  form_id: IDENTIFIER,
  google_key: z.string().min(1).max(256),
  user_column_data: z
    .array(
      z.object({ column_id: z.string().min(1).max(256), string_value: TEXT }),
    )
    .max(200)
    .refine(
      (columns) =>
        new Set(columns.map((column) => column.column_id)).size ===
        columns.length,
    ),
  is_test: z.boolean().optional(),
  campaign_id: IDENTIFIER.optional(),
  adgroup_id: IDENTIFIER.optional(),
  creative_id: IDENTIFIER.optional(),
  asset_group_id: IDENTIFIER.optional(),
  gcl_id: z.string().max(2048).optional(),
  lead_submit_time: z.iso.datetime({ offset: true }).optional(),
  lead_source: z.string().max(256).optional(),
});
const META_EVENT = z.object({
  object: z.literal('page'),
  entry: z
    .array(
      z.object({
        id: IDENTIFIER,
        changes: z
          .array(
            z.object({
              field: z.string().max(256),
              value: z.unknown(),
            }),
          )
          .max(100),
      }),
    )
    .max(1000),
});
const META_CHANGE = z.object({
  page_id: IDENTIFIER,
  form_id: IDENTIFIER,
  leadgen_id: IDENTIFIER,
  ad_id: IDENTIFIER.optional(),
  adgroup_id: IDENTIFIER.optional(),
});
const META_LEAD = z.object({
  id: IDENTIFIER,
  form_id: IDENTIFIER,
  ad_id: IDENTIFIER.nullable().optional(),
  created_time: z
    .string()
    .max(64)
    .refine((value) => Number.isFinite(Date.parse(value))),
  field_data: z
    .array(
      z.object({
        name: z.string().min(1).max(256),
        values: z.array(TEXT).max(100),
      }),
    )
    .max(200)
    .refine(
      (fields) =>
        new Set(fields.map((field) => field.name)).size === fields.length,
    ),
});
export type GoogleAdLead = z.infer<typeof GOOGLE_LEAD>;
export type GoogleAdDelivery = Omit<GoogleAdLead, 'google_key'>;
export type MetaAdLead = z.infer<typeof META_LEAD>;
export type MetaAdChange = z.infer<typeof META_CHANGE>;

const parse = <TData>(value: unknown, schema: z.ZodType<TData>): TData => {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('Invalid ad lead payload');
  return result.data;
};
export const parseGoogleLead = (value: unknown): GoogleAdLead =>
  parse(value, GOOGLE_LEAD);
export const parseGoogleDelivery = (value: unknown): GoogleAdDelivery =>
  parse(value, GOOGLE_LEAD.omit({ google_key: true }));
export const parseMetaEvent = (value: unknown) => parse(value, META_EVENT);
export const parseMetaChange = (value: unknown): MetaAdChange =>
  parse(value, META_CHANGE);
export const parseMetaLead = (value: unknown): MetaAdLead =>
  parse(value, META_LEAD);

export const parseProviderBody = (raw: Buffer | undefined): unknown => {
  if (!raw || raw.length === 0 || raw.length > 256 * 1024 || !isUtf8(raw))
    throw new BadRequestException('Invalid ad lead body');
  try {
    const text = raw.toString('utf8');
    const value: unknown = JSON.parse(
      text,
      (key: string, item: unknown, context?: { source: string }) => {
        if (
          typeof item === 'number' &&
          [
            'id',
            'page_id',
            'form_id',
            'leadgen_id',
            'campaign_id',
            'adgroup_id',
            'ad_id',
            'creative_id',
            'asset_group_id',
          ].includes(key)
        ) {
          if (context?.source && /^\d+$/.test(context.source))
            return context.source;
          if (Number.isSafeInteger(item) && item >= 0) return String(item);
          throw new Error();
        }
        return item;
      },
    );
    const objects: (Set<string> | null)[] = [];
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === '{' || character === '[')
        objects.push(character === '{' ? new Set() : null);
      else if (character === '}' || character === ']') objects.pop();
      else if (character === '"') {
        const start = index++;
        while (index < text.length) {
          if (text[index] === '\\') index += 2;
          else if (text[index] === '"') break;
          else index++;
        }
        let next = index + 1;
        while (/\s/.test(text[next] ?? '') && next < text.length) next++;
        if (text[next] === ':') {
          const key: unknown = JSON.parse(text.slice(start, index + 1));
          const keys = objects[objects.length - 1];
          if (typeof key !== 'string' || !keys || keys.has(key))
            throw new Error();
          keys.add(key);
        }
      }
    }
    return value;
  } catch {
    throw new BadRequestException('Invalid or ambiguous ad lead JSON');
  }
};
