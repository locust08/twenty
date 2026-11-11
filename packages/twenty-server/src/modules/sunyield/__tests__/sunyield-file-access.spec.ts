import { authorizeSunyieldFile } from 'src/modules/sunyield/permissions/sunyield-file-access';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';
const identity = {
  userId: 'user',
  userWorkspaceId: 'membership',
  workspaceMemberId: 'member',
};
describe('Sunyield private file authorization', () => {
  it('rejects old unbound file tokens before reading data', async () => {
    const query = jest.fn();
    await expect(
      authorizeSunyieldFile(SUNYIELD_WORKSPACE_ID, undefined, query),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects sales and a revoked admin at signing/download', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      authorizeSunyieldFile(SUNYIELD_WORKSPACE_ID, identity, query),
    ).rejects.toThrow();
  });
  it('requires live canonical admin and membership for a bound token', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'membership' }]);
    await expect(
      authorizeSunyieldFile(SUNYIELD_WORKSPACE_ID, identity, query),
    ).resolves.toEqual(identity);
    expect(query.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['user', 'membership', 'member']),
    );
  });
  it('preserves other workspaces without an additional query', async () => {
    const query = jest.fn();
    await expect(
      authorizeSunyieldFile('other', undefined, query),
    ).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
