export const publishBackup = async ({
  kind,
  slot,
  create,
  verify,
  restore,
  publish,
}) => {
  const snapshot = await create();
  await verify(snapshot);
  if (kind === 'database') await restore(snapshot);
  const manifest = {
    ...snapshot,
    kind,
    slot,
    verified: true,
    createdAt: new Date().toISOString(),
  };
  await publish(manifest);
  return manifest;
};
