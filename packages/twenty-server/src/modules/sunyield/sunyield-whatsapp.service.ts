import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { z } from 'zod';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  type WorkspaceAuthContext,
  type UserWorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { SUNYIELD_WORKSPACE_ID } from './authorize-sunyield-status';

const CONTROL = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('queue-page'),
      offset: z.number().int().min(0).max(1000000),
    })
    .strict(),
  z.object({ action: z.literal('pair') }).strict(),
  z
    .object({
      action: z.literal('pair-status'),
      sessionId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('cancel-pair'),
      sessionId: z.string().min(1).max(100),
    })
    .strict(),
  z.object({ action: z.literal('pause') }).strict(),
  z
    .object({ action: z.literal('resume'), acknowledge: z.literal(true) })
    .strict(),
  z
    .object({
      action: z.literal('arm-assignment-test'),
      kind: z
        .enum(['initial-assignment', 'commercial-awaiting-assignment'])
        .optional(),
      requestId: z.uuid(),
      leadId: z.uuid(),
      expectedSender: z.string().regex(/^\+[1-9]\d{7,14}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('cancel-assignment-test'),
      requestId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('send-test'),
      requestId: z.uuid(),
      expectedSender: z.string().regex(/^\+[1-9]\d{7,14}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('retry'),
      jobId: z.uuid(),
      acknowledge: z.boolean().optional(),
    })
    .strict(),
  z
    .object({ action: z.literal('unpair'), acknowledge: z.literal(true) })
    .strict(),
]);
const RESULT = z.object({
  sendingEnabled: z.boolean(),
  canResume: z.boolean().optional(),
  resumeBlockedReason: z
    .enum([
      'production_disabled',
      'device_changing',
      'not_paused',
      'not_activated',
      'sender_not_configured',
      'recipients_not_ready',
      'disconnected',
      'sender_mismatch',
      'feed_unavailable',
    ])
    .nullable()
    .optional(),
  lastAssignmentTest: z
    .object({
      kind: z
        .enum(['initial-assignment', 'commercial-awaiting-assignment'])
        .optional(),
      requestId: z.uuid(),
      leadId: z.uuid(),
      recipient: z.string().regex(/^\+[1-9]\d{7,14}$/),
      armedAt: z.number(),
      expiresAt: z.number(),
      state: z.enum([
        'waiting',
        'sending',
        'submitted',
        'delivered',
        'delivery-unknown',
        'failed',
        'expired',
        'cancelled',
      ]),
      reason: z.string().max(100).nullable(),
      assignedSalespersonId: z.uuid().nullable(),
      assignedAt: z.string().max(40).nullable(),
    })
    .nullable()
    .optional(),
  lastTest: z
    .object({
      requestId: z.uuid(),
      state: z.enum([
        'sending',
        'submitted',
        'delivered',
        'delivery-unknown',
        'failed',
      ]),
      recipient: z.string().regex(/^\+[1-9]\d{7,14}$/),
      createdAt: z.number(),
    })
    .nullable()
    .optional(),
  paired: z.boolean(),
  connected: z.boolean().optional(),
  sender: z.string().max(30).nullable().optional(),
  paused: z.boolean().optional(),
  jobs: z
    .array(
      z.object({
        id: z.string(),
        state: z.string().max(40),
        reason: z.string().max(100).nullable(),
        leadId: z.string(),
        kind: z
          .enum(['initial-assignment', 'commercial-awaiting-assignment'])
          .optional(),
      }),
    )
    .max(100)
    .optional(),
  sessionId: z.string().max(100).optional(),
  expiresAt: z.number().optional(),
  nextOffset: z.number().nullable().optional(),
  qr: z
    .string()
    .max(40000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
    .nullable()
    .optional(),
});
@Injectable()
export class SunyieldWhatsappService {
  private readonly limits = new Map<string, { since: number; count: number }>();
  constructor(
    private readonly manager: WorkspaceOrmManager,
    private readonly config: TwentyConfigService,
  ) {}
  private async admin(
    context: WorkspaceAuthContext,
  ): Promise<UserWorkspaceAuthContext> {
    if (
      context.type !== 'user' ||
      context.workspace.id !== SUNYIELD_WORKSPACE_ID ||
      context.agentId ||
      context.application ||
      context.viaApplication
    )
      throw new ForbiddenException('Sunyield admin session required');
    const schema = escapeIdentifier(
      getWorkspaceSchemaName(SUNYIELD_WORKSPACE_ID),
    );
    const rows: unknown = await withWorkspaceAuthContext(context, () =>
      this.manager.executeInWorkspaceContext(
        () =>
          this.manager.runInWorkspaceTransaction((transaction) =>
            transaction.executeRawQuery(
              `SELECT u.id FROM core."userWorkspace" u JOIN core."roleTarget" t ON t."userWorkspaceId"=u.id AND t."workspaceId"=u."workspaceId" JOIN ${schema}."workspaceMember" m ON m."userId"=u."userId" AND m.id=$5 AND m."deletedAt" IS NULL JOIN core.role r ON r.id=t."roleId" AND r."workspaceId"=u."workspaceId" WHERE u.id=$1 AND u."workspaceId"=$2 AND u."userId"=$3 AND u."deletedAt" IS NULL AND r."universalIdentifier"=$4 AND r."isEditable"=false`,
              [
                context.userWorkspaceId,
                SUNYIELD_WORKSPACE_ID,
                context.user.id,
                STANDARD_ROLE.admin.universalIdentifier,
                context.workspaceMemberId,
              ],
            ),
          ),
        context,
      ),
    );
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new ForbiddenException('Active Sunyield admin required');
    return context;
  }
  private rate(memberId: string, mutation: boolean) {
    const now = Date.now();
    for (const [key, value] of this.limits)
      if (now - value.since > 60000) this.limits.delete(key);
    const key = memberId + ':' + mutation;
    const current = this.limits.get(key) || { since: now, count: 0 };
    if (++current.count > (mutation ? 30 : 60))
      throw new HttpException('Too many requests', 429);
    this.limits.set(key, current);
  }
  private async call(path: string, body?: unknown) {
    const endpoint = this.config.get('SUNYIELD_HERMES_URL');
    const token = this.config.get('SUNYIELD_HERMES_ADMIN_TOKEN');
    if (!endpoint || !token)
      throw new ServiceUnavailableException(
        'WhatsApp service is not configured',
      );
    const url = new URL(endpoint);
    if (
      url.protocol !== 'http:' ||
      !url.hostname.endsWith('.railway.internal') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new ServiceUnavailableException(
        'Invalid private WhatsApp endpoint',
      );
    try {
      const response = await fetch(url.origin + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      const text = await response.text();
      if (!response.ok || text.length > 65536) throw new Error('Rejected');
      return RESULT.parse(JSON.parse(text));
    } catch {
      throw new ServiceUnavailableException(
        'WhatsApp control could not be confirmed. Refresh before retrying.',
      );
    }
  }
  async access(context: WorkspaceAuthContext) {
    await this.admin(context);
    return { authorized: true };
  }
  async status(context: WorkspaceAuthContext) {
    const member = await this.admin(context);
    this.rate(member.workspaceMemberId, false);
    return this.call('/admin/status');
  }
  async control(
    context: WorkspaceAuthContext,
    origin: string | undefined,
    body: unknown,
  ) {
    const member = await this.admin(context);
    if (!origin || origin !== new URL(this.config.get('SERVER_URL')).origin)
      throw new ForbiddenException('Same-origin request required');
    const parsed = CONTROL.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Invalid WhatsApp control');
    this.rate(member.workspaceMemberId, true);
    return this.call('/admin/control', {
      ...parsed.data,
      memberId: member.workspaceMemberId,
    });
  }
}
