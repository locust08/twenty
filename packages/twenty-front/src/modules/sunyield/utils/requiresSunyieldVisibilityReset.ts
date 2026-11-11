export type SunyieldVisibilitySnapshot = {
  fingerprint: string;
  isAdmin: boolean;
  leadIds: string[];
};
export const requiresSunyieldVisibilityReset = (
  previous: Pick<SunyieldVisibilitySnapshot, 'isAdmin' | 'leadIds'>,
  next: Pick<SunyieldVisibilitySnapshot, 'isAdmin' | 'leadIds'>,
): boolean => {
  if (previous.isAdmin !== next.isAdmin) return true;
  const accessible = new Set(next.leadIds);
  return previous.leadIds.some((recordId) => !accessible.has(recordId));
};
