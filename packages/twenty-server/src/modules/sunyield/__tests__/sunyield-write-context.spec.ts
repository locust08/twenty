import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';
import {
  isSunyieldManagementWrite,
  withSunyieldManagementWrite,
} from 'src/modules/sunyield/management/sunyield-write-context';

const user = {
  type: 'user',
  workspace: { id: SUNYIELD_WORKSPACE_ID },
  user: { id: 'user' },
  userWorkspaceId: 'membership',
  workspaceMemberId: 'member',
} as WorkspaceAuthContext;
describe('server-only Sunyield management write scope', () => {
  it('is absent outside the authorized callback and bound to the exact principal', async () => {
    expect(isSunyieldManagementWrite(user)).toBe(false);
    await withSunyieldManagementWrite(user, async () => {
      expect(isSunyieldManagementWrite(user)).toBe(true);
      expect(
        isSunyieldManagementWrite({
          ...user,
          workspaceMemberId: 'other',
        } as WorkspaceAuthContext),
      ).toBe(false);
      expect(
        isSunyieldManagementWrite({
          ...user,
          user: { id: 'other' },
        } as WorkspaceAuthContext),
      ).toBe(false);
    });
    expect(isSunyieldManagementWrite(user)).toBe(false);
  });
  it('does not widen a concurrent request', async () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inside = withSunyieldManagementWrite(user, async () => {
      await pending;
      expect(isSunyieldManagementWrite(user)).toBe(true);
    });
    expect(isSunyieldManagementWrite(user)).toBe(false);
    release();
    await inside;
  });
  it('revokes inherited async work when the operation has finished', async () => {
    let release = () => {};
    let inherited: Promise<boolean> = Promise.resolve(true);
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await withSunyieldManagementWrite(user, async () => {
      inherited = pending.then(() => isSunyieldManagementWrite(user));
    });
    release();
    expect(await inherited).toBe(false);
  });
  it('cleans up a failed operation', async () => {
    await expect(
      withSunyieldManagementWrite(user, async () => {
        throw Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(isSunyieldManagementWrite(user)).toBe(false);
  });
});
