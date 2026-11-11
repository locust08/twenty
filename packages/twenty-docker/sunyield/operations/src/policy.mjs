const DAY = 86_400_000;
export const schedule = (now) => ({
  database: new Date(
    Math.floor(now.getTime() / (6 * 3_600_000)) * 6 * 3_600_000,
  ).toISOString(),
  files: new Date(Math.floor((now.getTime() - 18 * 3_600_000) / DAY) * DAY)
    .toISOString()
    .slice(0, 10),
});
export const retention = (snapshots, now) => {
  const ordered = snapshots
    .filter((snapshot) => snapshot.verified)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const keep = new Set(
    ordered
      .filter((snapshot) => now - new Date(snapshot.createdAt) <= 30 * DAY)
      .map((snapshot) => snapshot.id),
  );
  const monthly = new Map();
  for (const snapshot of ordered) {
    const month = snapshot.createdAt.slice(0, 7);
    if (month < now.toISOString().slice(0, 7) && !monthly.has(month))
      monthly.set(month, snapshot.id);
  }
  for (const id of [...monthly.values()].slice(-3)) keep.add(id);
  if (ordered.length) keep.add(ordered.at(-1).id);
  return ordered
    .filter((snapshot) => !keep.has(snapshot.id))
    .map((snapshot) => snapshot.id);
};
export const incidentTransition = (previous, healthy) => {
  if (!previous) return healthy ? null : 'incident';
  if (previous.healthy === healthy) return null;
  return healthy ? 'recovery' : 'incident';
};
