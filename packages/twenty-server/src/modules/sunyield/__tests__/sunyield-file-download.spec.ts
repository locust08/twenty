import { type ExecutionContext } from '@nestjs/common';
import { type DataSource } from 'typeorm';
import { FileFolder } from 'twenty-shared/types';
import { FileByIdGuard } from 'src/engine/core-modules/file/guards/file-by-id.guard';
import { type JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';
import { type CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

describe('Sunyield file download revocation', () => {
  const identity = {
    userId: 'user',
    userWorkspaceId: 'membership',
    workspaceMemberId: 'member',
  };
  const attempt = async (
    proof: typeof identity | undefined,
    admin: boolean,
    workspaceId = SUNYIELD_WORKSPACE_ID,
  ) => {
    const payload = {
      workspaceId,
      fileId: 'hidden-file',
      sunyieldFileIdentity: proof,
    };
    const query = jest
      .fn()
      .mockResolvedValue(admin ? [{ id: 'membership' }] : []);
    const guard = new FileByIdGuard(
      {
        verifyJwtToken: async () => payload,
        decode: () => payload,
      } as unknown as JwtWrapperService,
      {
        get: async () => ({ activationStatus: 'ACTIVE' }),
      } as unknown as CoreEntityCacheService,
      { query } as unknown as DataSource,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { id: 'hidden-file', fileFolder: FileFolder.FilesField },
          query: { token: 'previously-issued-token' },
        }),
      }),
    } as unknown as ExecutionContext;
    return { allowed: await guard.canActivate(context), query };
  };
  it('invalidates legacy token-only private file links', async () => {
    expect((await attempt(undefined, true)).allowed).toBe(false);
  });
  it('rechecks admin revocation for each bound download', async () => {
    expect((await attempt(identity, false)).allowed).toBe(false);
    expect((await attempt(identity, true)).allowed).toBe(true);
  });
  it('retains the original download behavior outside Sunyield', async () => {
    const result = await attempt(undefined, false, 'other');
    expect(result.allowed).toBe(true);
    expect(result.query).not.toHaveBeenCalled();
  });
});
