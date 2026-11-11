import { normalizePhone } from './policy.mjs';
export const activateIfReady = async ({
  ledger,
  reader,
  bridge,
  enabled,
  confirmed,
  expectedSender,
  now = () => new Date(),
}) => {
  if (
    !enabled ||
    !confirmed ||
    ledger.setting('activation') ||
    !normalizePhone(expectedSender)
  )
    return false;
  const cutoff = now().toISOString();
  await reader.page({ cutoff });
  const health = await bridge.health();
  if (
    reader.recipientsConfigured !== true ||
    !health.connected ||
    normalizePhone(health.sender) !== normalizePhone(expectedSender)
  )
    return false;
  ledger.activate(cutoff);
  ledger.pause(false);
  return true;
};
