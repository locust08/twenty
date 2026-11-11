import { createHash } from 'node:crypto';
import { incidentTransition } from './policy.mjs';

export const sendEmail = async (subject, text, idempotencyKey) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [process.env.ALERT_TO],
      reply_to: process.env.ALERT_TO,
      subject,
      text,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw Error(`Alert delivery failed (${response.status})`);
};
export const reportCheck = async (
  store,
  send,
  name,
  healthy,
  details = '',
  emailEnabled = true,
) => {
  const key = `state/monitor/${name}.json`;
  const previous = await store.readJson(key);
  const transition = incidentTransition(previous, healthy);
  const changedAt = previous?.changedAt || 'initial';
  if (transition && emailEnabled) {
    const id = createHash('sha256')
      .update(`${name}:${changedAt}:${healthy}`)
      .digest('hex');
    await send(
      `[Sunyield] ${transition === 'incident' ? 'Incident' : 'Recovery'}: ${name}`,
      `${name}: ${healthy ? 'healthy' : 'requires attention'}.\n${details}\nTransition follows state: ${changedAt}\nRailway-hosted monitoring cannot alert during a full Railway outage.`,
      id,
    );
  }
  await store.writeJson(key, {
    healthy,
    changedAt:
      transition || !previous ? new Date().toISOString() : previous.changedAt,
    checkedAt: new Date().toISOString(),
  });
};
