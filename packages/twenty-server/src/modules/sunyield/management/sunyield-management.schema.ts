import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const SUNYIELD_CUSTOMER_FIELDS = [
  'name',
  'phone',
  'rawPhone',
  'area',
  'postcode',
  'region',
  'electricityBillResponse',
  'electricityBillAmount',
  'status',
] as const;

const TEXT = z.string().max(10000).nullable();
const TIMESTAMP = z.iso.datetime({ offset: true });
const VERSION = { recordId: z.uuid(), expectedUpdatedAt: TIMESTAMP };
const PHONE = z
  .object({
    primaryPhoneNumber: z.string().max(100).nullish(),
    primaryPhoneCountryCode: z.string().max(3).nullish(),
    primaryPhoneCallingCode: z.string().max(10).nullish(),
    additionalPhones: z
      .array(
        z
          .object({
            number: z.string().max(100),
            countryCode: z.string().max(3),
            callingCode: z.string().max(10),
          })
          .strict(),
      )
      .max(20)
      .nullish(),
  })
  .strict()
  .nullable();
const RICH_TEXT = z
  .object({
    tiptap: z.string().max(500000).nullish(),
    markdown: z.string().max(500000).nullish(),
    blocknote: z.string().max(500000).nullish(),
  })
  .strict()
  .nullable();
const LEAD_CHANGES = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    phone: PHONE.optional(),
    rawPhone: TEXT.optional(),
    area: TEXT.optional(),
    postcode: TEXT.optional(),
    region: z
      .enum(['KLANG_VALLEY', 'EAST_COAST', 'OUTSTATION', 'UNKNOWN'])
      .nullable()
      .optional(),
    electricityBillResponse: TEXT.optional(),
    electricityBillAmount: z
      .object({
        amountMicros: z
          .union([
            z.number().int().nonnegative().safe(),
            z.string().regex(/^\d{1,18}$/),
          ])
          .nullable(),
        currencyCode: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    status: z
      .enum([
        'NEW',
        'CALLBACK',
        'FOLLOW_UP',
        'HIGH',
        'LOW',
        'SITE_VISIT',
        'QUOTE',
        'NO_RESPONSE',
        'SECURED',
        'WITHDRAW',
        'INVALID',
      ])
      .optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined));
const NOTE_FIELDS = {
  title: z.string().max(500).nullable().optional(),
  bodyV2: RICH_TEXT.optional(),
};
const NOTE_CHANGES = z
  .object(NOTE_FIELDS)
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined));
const TASK_CHANGES = z
  .object({
    ...NOTE_FIELDS,
    dueAt: TIMESTAMP.nullable().optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined));
const REQUEST = z.union([
  z
    .object({
      action: z.literal('updateLead'),
      ...VERSION,
      changes: LEAD_CHANGES,
    })
    .strict(),
  z
    .object({
      action: z.literal('createActivity'),
      kind: z.enum(['note', 'task']),
      recordId: z.uuid(),
      leadId: z.uuid(),
      title: z.string().max(500).nullable(),
      bodyV2: RICH_TEXT,
      dueAt: TIMESTAMP.nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('updateActivity'),
      kind: z.literal('note'),
      ...VERSION,
      changes: NOTE_CHANGES,
    })
    .strict(),
  z
    .object({
      action: z.literal('updateActivity'),
      kind: z.literal('task'),
      ...VERSION,
      changes: TASK_CHANGES,
    })
    .strict(),
  z
    .object({
      action: z.literal('reassignLead'),
      ...VERSION,
      salespersonId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('mapSalesperson'),
      ...VERSION,
      workspaceMemberId: z.uuid().nullable(),
    })
    .strict(),
]);

export type SunyieldManagementRequest = z.infer<typeof REQUEST>;

export const parseSunyieldManagementRequest = (
  input: unknown,
): SunyieldManagementRequest => {
  const result = REQUEST.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Invalid Sunyield management request');
  return result.data;
};

export const parseSunyieldAccessQuery = (input: unknown) => {
  const result = z
    .object({
      objectName: z.enum(['lead', 'note', 'task', 'salesperson']),
      recordId: z.uuid(),
    })
    .strict()
    .safeParse(input);
  if (!result.success)
    throw new BadRequestException('Invalid Sunyield access request');
  return result.data;
};
