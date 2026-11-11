import { Injectable } from '@nestjs/common';
import { type ObjectRecord } from 'twenty-shared/types';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';
import { buildAdIntakeIdentity } from './sunyield-ad-intake.identity';
import { type NormalizedAdLead } from './sunyield-ad-intake.mapping';

const SYSTEM_ACTOR = {
  source: 'SYSTEM',
  workspaceMemberId: null,
  name: 'SunYield ad connector',
  context: {},
};

@Injectable()
export class SunyieldAdIntakeStore {
  constructor(private readonly manager: WorkspaceOrmManager) {}

  async has(submissionId: string): Promise<boolean> {
    return this.inContext(async () =>
      Boolean(
        await this.manager
          .getRepository<ObjectRecord>('lead', {
            shouldBypassPermissionChecks: true,
          })
          .findOne({ where: { submissionId }, withDeleted: true }),
      ),
    );
  }

  async create(record: NormalizedAdLead): Promise<void> {
    const providerLeadId = record.provenance.providerLeadId;
    const pageId = record.provenance.pageId;
    if (
      typeof providerLeadId !== 'string' ||
      (pageId !== undefined && typeof pageId !== 'string') ||
      record.lead.source !==
        (record.provider === 'meta' ? 'FACEBOOK' : 'GOOGLE_ADS')
    )
      throw new Error('Invalid ad intake identity');
    const expected = buildAdIntakeIdentity(
      record.provider,
      providerLeadId,
      pageId,
    );
    if (
      (Object.keys(expected) as (keyof typeof expected)[]).some(
        (key) => expected[key] !== record.identity[key],
      )
    )
      throw new Error('Invalid ad intake identity');
    await this.inContext(() =>
      this.manager.runInWorkspaceTransaction(async (transaction) => {
        await transaction.executeRawQuery("SET LOCAL lock_timeout = '5s'");
        await transaction.executeRawQuery(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [record.identity.submissionId],
        );
        const repository = (kind: string) =>
          transaction.getRepository<ObjectRecord>(kind, {
            shouldBypassPermissionChecks: true,
          });
        const existing = await repository('lead').findOne({
          where: [
            { id: record.identity.id },
            { submissionId: record.identity.submissionId },
          ],
          withDeleted: true,
        });
        if (existing) return;
        await repository('lead').insert({
          ...record.lead,
          id: record.identity.id,
          submissionId: record.identity.submissionId,
          status: 'NEW',
          assignedSalespersonId: null,
          assignedAt: null,
          assignmentState: 'PENDING',
          createdBy: SYSTEM_ACTOR,
          updatedBy: SYSTEM_ACTOR,
        });
        const title =
          record.provider === 'meta'
            ? 'Meta Ads submission'
            : 'Google Ads submission';
        const json = JSON.stringify(
          {
            provider: record.provider,
            ...record.provenance,
            answers: record.answers,
          },
          null,
          2,
        ).replace(/`/g, '\\u0060');
        await repository('note').insert({
          id: record.identity.noteId,
          title,
          bodyV2: {
            blocknote: null,
            markdown: 'Original ad submission\n\n```json\n' + json + '\n```',
          },
          createdBy: SYSTEM_ACTOR,
          updatedBy: SYSTEM_ACTOR,
        });
        await repository('noteTarget').insert({
          id: record.identity.targetId,
          noteId: record.identity.noteId,
          targetLeadId: record.identity.id,
          createdBy: SYSTEM_ACTOR,
          updatedBy: SYSTEM_ACTOR,
        });
      }),
    );
  }

  private async inContext<TResult>(
    work: () => Promise<TResult>,
  ): Promise<TResult> {
    const auth = buildSystemAuthContext(SUNYIELD_WORKSPACE_ID);
    return withWorkspaceAuthContext(auth, () =>
      this.manager.executeInWorkspaceContext(work, auth),
    );
  }
}
