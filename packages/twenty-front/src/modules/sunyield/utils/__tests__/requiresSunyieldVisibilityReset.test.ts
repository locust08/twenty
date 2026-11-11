import { requiresSunyieldVisibilityReset } from '@/sunyield/utils/requiresSunyieldVisibilityReset';
const previous = { isAdmin: false, leadIds: ['own-a', 'own-b'] };
describe('Sunyield access-change refresh', () => {
  it('keeps an active draft when a newly assigned lead is added', () => {
    expect(
      requiresSunyieldVisibilityReset(previous, {
        ...previous,
        leadIds: ['own-a', 'own-b', 'new-lead'],
      }),
    ).toBe(false);
  });
  it('clears cached views when any previously visible lead is revoked', () => {
    expect(
      requiresSunyieldVisibilityReset(previous, {
        ...previous,
        leadIds: ['own-b'],
      }),
    ).toBe(true);
  });
  it('resets on live Admin-role changes even when the lead set is unchanged', () => {
    expect(
      requiresSunyieldVisibilityReset({ ...previous, isAdmin: true }, previous),
    ).toBe(true);
    expect(
      requiresSunyieldVisibilityReset(previous, { ...previous, isAdmin: true }),
    ).toBe(true);
  });
  it('does not reset for a reordered response with the same access', () => {
    expect(
      requiresSunyieldVisibilityReset(previous, {
        ...previous,
        leadIds: ['own-b', 'own-a'],
      }),
    ).toBe(false);
  });
});
