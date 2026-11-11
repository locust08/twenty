import { timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { SUNYIELD_WORKSPACE_ID } from './authorize-sunyield-status';
import { orderSunyieldRotationCandidates } from './utils/sunyield-rotation';
const QUERY = z
  .object({
    cutoff: z.iso.datetime({ offset: true }),
    cursorAt: z.iso.datetime({ offset: true }).optional(),
    cursorId: z.uuid().optional(),
    id: z.uuid().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.cursorAt) === Boolean(value.cursorId));
@Injectable()
export class SunyieldWhatsappFeedService {
  constructor(
    @InjectDataSource() private readonly database: DataSource,
    private readonly config: TwentyConfigService,
  ) {}
  async read(authorization: string | undefined, input: unknown) {
    const secret = this.config.get('SUNYIELD_HERMES_FEED_TOKEN');
    const expected = Buffer.from(secret || '');
    const supplied = Buffer.from(authorization || '');
    if (
      !secret ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new ForbiddenException('Invalid notification feed credential');
    const parsed = QUERY.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid notification feed query');
    const query = parsed.data;
    const schema = escapeIdentifier(
      getWorkspaceSchemaName(SUNYIELD_WORKSPACE_ID),
    );
    const rows: unknown = await this.database.query(
      `SELECT l.id,l."leadType",l."createdAt",to_char(l."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt",l."deletedAt",l."assignedSalespersonId",l."assignedAt",l."assignmentState",l.name,l.area,l.source,l."electricityBillResponse" AS bill,COALESCE(NULLIF(l."rawPhone",''),to_jsonb(l)->>'phonePrimaryPhoneNumber','') AS phone,s.name AS "salespersonName",s.active AS "salespersonActive",s."rotationOrder" AS "salespersonRotationOrder",s."whatsappNumber" AS recipient,CASE WHEN EXISTS(SELECT 1 FROM core."userWorkspace" mu WHERE mu."userId"=m."userId" AND mu."workspaceId"='e7e7d4f2-0f82-4a72-a12e-1f61494c61c6' AND mu."deletedAt" IS NULL) THEN m.id ELSE NULL END AS "workspaceMemberId",(SELECT count(*)::int FROM ${schema}."_salesperson" duplicates WHERE duplicates."workspaceMemberId"=s."workspaceMemberId" AND duplicates."deletedAt" IS NULL) AS "mappingCount" FROM ${schema}."_lead" l LEFT JOIN ${schema}."_salesperson" s ON s.id=l."assignedSalespersonId" AND s."deletedAt" IS NULL LEFT JOIN ${schema}."workspaceMember" m ON m.id=s."workspaceMemberId" AND m."deletedAt" IS NULL WHERE l."createdAt">=$1 AND l."deletedAt" IS NULL AND ($2::timestamptz IS NULL OR (l."createdAt",l.id)>($2::timestamptz,$3::uuid)) AND ($4::uuid IS NULL OR l.id=$4::uuid) ORDER BY l."createdAt",l.id LIMIT 101`,
      [
        query.cutoff,
        query.cursorAt || null,
        query.cursorId || null,
        query.id || null,
      ],
    );
    const leads = z
      .array(
        z.object({
          id: z.string(),
          cursorAt: z.iso.datetime({ offset: true }),
          createdAt: z.coerce.date().transform((date) => date.toISOString()),
          deletedAt: z.null(),
          leadType: z.string().nullable(),
          assignedSalespersonId: z.string().nullable(),
          assignedAt: z.coerce
            .date()
            .nullable()
            .transform((date) => date?.toISOString() ?? null),
          assignmentState: z.string().nullable(),
          name: z.string(),
          area: z.string().nullable(),
          source: z.string().nullable(),
          bill: z.string().nullable(),
          phone: z.string(),
          salespersonName: z.string().nullable(),
          recipient: z.string().nullable(),
          workspaceMemberId: z.string().nullable(),
          mappingCount: z.number(),
          salespersonActive: z.boolean().nullable(),
          salespersonRotationOrder: z.number().nullable(),
        }),
      )
      .parse(rows);
    const page = leads.slice(0, 100);
    const last = page[page.length - 1];
    const pool: unknown = await this.database.query(
      `SELECT s.id,s.active,s."rotationOrder",s."whatsappNumber" AS recipient,s."workspaceMemberId" AS member,EXISTS(SELECT 1 FROM ${schema}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" AND u."workspaceId"=$1 AND u."deletedAt" IS NULL WHERE m.id=s."workspaceMemberId" AND m."deletedAt" IS NULL) AS valid,(SELECT count(*)::int FROM ${schema}."_salesperson" d WHERE d."workspaceMemberId"=s."workspaceMemberId" AND d."deletedAt" IS NULL) AS mappings FROM ${schema}."_salesperson" s WHERE s.active=true AND s."deletedAt" IS NULL`,
      [SUNYIELD_WORKSPACE_ID],
    );
    const recipients = z
      .array(
        z.object({
          id: z.uuid(),
          active: z.boolean(),
          rotationOrder: z.unknown(),
          recipient: z.string().nullable(),
          member: z.string().nullable(),
          valid: z.boolean(),
          mappings: z.number(),
        }),
      )
      .parse(pool);
    const numbers = recipients.map(
      (recipient) => recipient.recipient?.replace(/[ ()-]/g, '') || '',
    );
    let validRotation = false;
    try {
      orderSunyieldRotationCandidates(recipients);
      validRotation = true;
    } catch {
      validRotation = false;
    }
    const recipientsConfigured =
      validRotation &&
      recipients.every(
        (recipient) => recipient.valid && recipient.mappings === 1,
      ) &&
      numbers.every((number) => /^\+[1-9]\d{7,14}$/.test(number)) &&
      new Set(numbers).size === recipients.length;
    return {
      workspaceId: SUNYIELD_WORKSPACE_ID,
      recipientsConfigured,
      leads: page,
      next:
        leads.length > 100 && last
          ? { cursorAt: last.cursorAt, cursorId: last.id }
          : null,
    };
  }
}
