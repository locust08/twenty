import { useEffect, useState } from 'react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { z } from 'zod';
import { v4 } from 'uuid';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { themeCssVariables } from 'twenty-ui/theme';
import { doNotTranslate } from 'twenty-shared/i18n';
const STATUS = z.object({
  sendingEnabled: z.boolean(),
  paired: z.boolean(),
  connected: z.boolean().optional(),
  paused: z.boolean().optional(),
  canResume: z.boolean().optional(),
  resumeBlockedReason: z
    .enum([
      'production_disabled',
      'device_changing',
      'not_paused',
      'not_activated',
      'sender_not_configured',
      'recipients_not_ready',
      'disconnected',
      'sender_mismatch',
      'feed_unavailable',
    ])
    .nullable()
    .optional(),
  sender: z.string().nullable().optional(),
  lastAssignmentTest: z
    .object({
      kind: z
        .enum(['initial-assignment', 'commercial-awaiting-assignment'])
        .optional(),
      requestId: z.string(),
      leadId: z.string(),
      recipient: z.string(),
      armedAt: z.number(),
      expiresAt: z.number(),
      state: z.enum([
        'waiting',
        'sending',
        'submitted',
        'delivered',
        'delivery-unknown',
        'failed',
        'expired',
        'cancelled',
      ]),
      reason: z.string().nullable(),
      assignedSalespersonId: z.string().nullable(),
      assignedAt: z.string().nullable(),
    })
    .nullable()
    .optional(),
  lastTest: z
    .object({
      requestId: z.string(),
      state: z.enum([
        'sending',
        'submitted',
        'delivered',
        'delivery-unknown',
        'failed',
      ]),
      recipient: z.string(),
      createdAt: z.number(),
    })
    .nullable()
    .optional(),
  jobs: z
    .array(
      z.object({
        id: z.string(),
        leadId: z.string(),
        kind: z
          .enum(['initial-assignment', 'commercial-awaiting-assignment'])
          .optional(),
        state: z.string(),
        reason: z.string().nullable(),
      }),
    )
    .optional(),
  sessionId: z.string().optional(),
  expiresAt: z.number().optional(),
  nextOffset: z.number().nullable().optional(),
  qr: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
    .nullable()
    .optional(),
});
type WhatsappStatus = z.infer<typeof STATUS>;
type SunyieldWhatsappPanelProps = {
  request?: (body?: unknown) => Promise<unknown>;
};
const requestStatus = async (body?: unknown) => {
  const response = await fetch(
    REACT_APP_SERVER_BASE_URL +
      '/rest/sunyield/whatsapp/' +
      (body ? 'control' : 'status'),
    {
      method: body ? 'POST' : 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!response.ok) throw Error('WhatsApp request rejected');
  return response.json();
};
const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[6]};
`;
const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;
const StyledButton = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 4px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  padding: 8px 12px;
  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;
const StyledTestInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 4px;
  color: ${themeCssVariables.font.color.primary};
  max-width: 400px;
  padding: 8px;
  width: 100%;
`;
const StyledTestSelect = styled.select`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 4px;
  color: ${themeCssVariables.font.color.primary};
  margin: 8px;
  padding: 8px;
`;
export const SunyieldWhatsappPanel = ({
  request = requestStatus,
}: SunyieldWhatsappPanelProps) => {
  const { t } = useLingui();
  const [status, setStatus] = useState<WhatsappStatus>();
  const [sessionId, setSessionId] = useState<string>();
  const [queueOffset, setQueueOffset] = useState(0);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [resumeConfirmed, setResumeConfirmed] = useState(false);
  const [testRequestId, setTestRequestId] = useState(() => v4());
  const [assignmentLeadId, setAssignmentLeadId] = useState('');
  const [assignmentTestKind, setAssignmentTestKind] = useState<
    'initial-assignment' | 'commercial-awaiting-assignment'
  >('initial-assignment');
  const [assignmentRequestId, setAssignmentRequestId] = useState(() => v4());
  const assignmentLabels = {
    waiting: t`Waiting for the new synthetic lead and its automatic assignment.`,
    sending: t`Submitting the assignment test. Do not arm another test.`,
    submitted: t`Assignment notification submitted; delivery is not yet confirmed.`,
    delivered: t`WhatsApp reported the assignment notification delivered.`,
    'delivery-unknown': t`Assignment test delivery is uncertain. No automatic retry will occur.`,
    failed: t`Assignment test was not submitted.`,
    expired: t`Assignment test expired without sending.`,
    cancelled: t`Assignment test cancelled.`,
  };
  const commercialTestLabels = {
    waiting: t`Waiting for the new unassigned synthetic Commercial lead.`,
    sending: t`Submitting the Commercial admin test. Do not arm another test.`,
    submitted: t`Commercial admin notification submitted; delivery is not yet confirmed.`,
    delivered: t`WhatsApp reported the Commercial admin notification delivered.`,
    'delivery-unknown': t`Commercial test delivery is uncertain. No automatic retry will occur.`,
    failed: t`Commercial test was not submitted.`,
    expired: t`Commercial test expired without sending.`,
    cancelled: t`Commercial test cancelled.`,
  };
  const run = async (body?: unknown) => {
    if (body) setResumeConfirmed(false);
    setBusy(true);
    setError(false);
    try {
      const result = STATUS.parse(await request(body));
      setStatus(result);
      if (result.sessionId) setSessionId(result.sessionId);
      if (result.connected) setSessionId(undefined);
      return result;
    } catch {
      setStatus(undefined);
      setSessionId(undefined);
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = STATUS.parse(
          await request(
            sessionId
              ? { action: 'pair-status', sessionId }
              : queueOffset
                ? { action: 'queue-page', offset: queueOffset }
                : undefined,
          ),
        );
        if (active) {
          setStatus(result);
          setError(false);
          if (result.connected) setSessionId(undefined);
        }
      } catch {
        if (active) {
          setStatus(undefined);
          setSessionId(undefined);
          setError(true);
        }
      }
    };
    void refresh();
    const timer = setInterval(refresh, sessionId ? 3000 : 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [request, sessionId, queueOffset]);
  return (
    <StyledPanel>
      <h2>{t`WhatsApp notifications`}</h2>
      <p>{t`Lead notifications use the marketing WhatsApp account. Pairing does not enable sending. Configure real recipient numbers in Salespeople before launch.`}</p>
      {error && (
        <p role="alert">{t`Could not load WhatsApp controls. Admin access or service connectivity may have changed. Refresh to check again.`}</p>
      )}
      {!status && !error && <p>{t`Loading WhatsApp status…`}</p>}
      {status && (
        <>
          <strong>
            {status.sendingEnabled ? t`Sending enabled` : t`Sending disabled`}
          </strong>
          <p>
            {status.connected
              ? t`Connected`
              : status.paired
                ? t`Linked device disconnected`
                : t`Marketing number not paired`}
            {status.sender ? ` · ${status.sender}` : ''}
          </p>
          <StyledActions>
            {!status.paired && (
              <StyledButton
                disabled={busy || Boolean(sessionId)}
                onClick={() => void run({ action: 'pair' })}
              >{t`Begin pairing`}</StyledButton>
            )}
            <StyledButton
              disabled={busy}
              onClick={() => void run({ action: 'pause' })}
            >{t`Pause sending`}</StyledButton>
            {sessionId && (
              <StyledButton
                disabled={busy}
                onClick={() => {
                  void run({ action: 'cancel-pair', sessionId });
                  setSessionId(undefined);
                }}
              >{t`Cancel pairing`}</StyledButton>
            )}
          </StyledActions>
          {status.qr && sessionId && (
            <div>
              <p>{t`On the marketing phone, open WhatsApp → Linked devices → Link a device. This QR expires shortly. Do not share it.`}</p>
              <img
                width={280}
                height={280}
                src={status.qr}
                alt={t`WhatsApp device pairing QR code`}
              />
            </div>
          )}
          {status.canResume === true && (
            <label>
              <input
                type="checkbox"
                checked={resumeConfirmed}
                onChange={(event) => setResumeConfirmed(event.target.checked)}
              />
              {t`Resume eligible queued notifications using the existing activation cutoff.`}
            </label>
          )}
          <StyledActions>
            <StyledButton
              disabled={busy || status.canResume !== true || !resumeConfirmed}
              onClick={() => void run({ action: 'resume', acknowledge: true })}
            >{t`Resume sending`}</StyledButton>
          </StyledActions>
          {status.resumeBlockedReason && (
            <p>
              {
                {
                  production_disabled: t`Production sending is disabled in Railway. Resume cannot enable it.`,
                  device_changing: t`Wait for the device change to finish before resuming.`,
                  not_paused: t`Notifications are not paused.`,
                  not_activated: t`Production notification activation has not been completed.`,
                  sender_not_configured: t`Configure the expected marketing sender before resuming.`,
                  recipients_not_ready: t`Configure valid active rotation and recipient mappings before resuming.`,
                  disconnected: t`Connect the marketing WhatsApp account before resuming.`,
                  sender_mismatch: t`The connected number does not match the configured marketing sender.`,
                  feed_unavailable: t`Recipient readiness could not be verified. Refresh before resuming.`,
                }[status.resumeBlockedReason]
              }
            </p>
          )}
          <details>
            <summary>{t`Operator tests`}</summary>
            <h3>{t`Dummy lead self-test`}</h3>
            <p>{t`Sends fixed dummy lead details to the connected marketing number shown above. No CRM record is created and automatic sending stays disabled. Allow one minute between tests.`}</p>
            <StyledActions>
              <StyledButton
                disabled={
                  busy ||
                  !status.connected ||
                  !status.sender ||
                  status.sendingEnabled ||
                  status.paused !== true ||
                  Boolean(
                    status.lastTest &&
                    (Date.now() - status.lastTest.createdAt < 60000 ||
                      ['sending', 'delivery-unknown'].includes(
                        status.lastTest.state,
                      )),
                  )
                }
                onClick={async () => {
                  const requestId =
                    status.lastTest?.requestId === testRequestId &&
                    ['submitted', 'delivered', 'failed'].includes(
                      status.lastTest.state,
                    )
                      ? v4()
                      : testRequestId;
                  setTestRequestId(requestId);
                  const result = await run({
                    action: 'send-test',
                    requestId,
                    expectedSender: status.sender,
                  });
                  if (
                    result?.lastTest &&
                    ['submitted', 'delivered', 'failed'].includes(
                      result.lastTest.state,
                    )
                  )
                    setTestRequestId(v4());
                }}
              >{t`Send dummy lead to connected number`}</StyledButton>
            </StyledActions>
            {status.lastTest && (
              <p role="status">
                {status.lastTest.state === 'delivered'
                  ? t`WhatsApp reported the test delivered.`
                  : status.lastTest.state === 'submitted'
                    ? t`Test submitted to WhatsApp; delivery is not yet confirmed.`
                    : status.lastTest.state === 'delivery-unknown'
                      ? t`Test delivery is uncertain. Check your WhatsApp before requesting another test; no automatic retry will occur.`
                      : status.lastTest.state === 'failed'
                        ? t`Test was not submitted. Check the connection before trying again.`
                        : t`Test submission is in progress. Do not send another test.`}
              </p>
            )}
            <h3>{t`Single-lead notification test`}</h3>
            <label>
              {t`Test notification type`}
              <StyledTestSelect
                value={assignmentTestKind}
                disabled={
                  busy ||
                  Boolean(
                    status.lastAssignmentTest &&
                    ['waiting', 'sending'].includes(
                      status.lastAssignmentTest.state,
                    ),
                  )
                }
                onChange={(event) => {
                  setAssignmentTestKind(
                    event.target.value === 'commercial-awaiting-assignment'
                      ? 'commercial-awaiting-assignment'
                      : 'initial-assignment',
                  );
                  setAssignmentRequestId(v4());
                }}
              >
                <option value="initial-assignment">{t`Automatic assignment`}</option>
                <option value="commercial-awaiting-assignment">{t`Commercial admin alert`}</option>
              </StyledTestSelect>
            </label>
            <p>
              {assignmentTestKind === 'commercial-awaiting-assignment'
                ? t`Arm one new unassigned synthetic Commercial lead for up to ten minutes. One admin test notification goes to the connected marketing number. Production sending stays disabled.`
                : t`Arm one new synthetic lead for up to ten minutes. After the existing workflow assigns it, one test notification goes to the connected marketing number. Production sending stays disabled.`}
            </p>
            <label>
              {t`Synthetic lead UUID`}
              <StyledTestInput
                value={assignmentLeadId}
                disabled={
                  busy ||
                  Boolean(
                    status.lastAssignmentTest &&
                    ['waiting', 'sending'].includes(
                      status.lastAssignmentTest.state,
                    ),
                  )
                }
                onChange={(event) => {
                  setAssignmentLeadId(event.target.value.trim());
                  setAssignmentRequestId(v4());
                }}
              />
            </label>
            {z.uuid().safeParse(assignmentLeadId).success && (
              <details>
                <summary>{t`Required synthetic lead fields`}</summary>
                <p>
                  {assignmentTestKind === 'commercial-awaiting-assignment'
                    ? t`Create the lead only after arming, using Source Google Ads and Status New. Lead type is set to Commercial automatically. Leave the salesperson unassigned.`
                    : t`Create the lead only after arming, using Source Facebook (Meta Ads) and Status New. Lead type is set to Residential automatically.`}
                </p>
                <p>
                  {t`Name`}:{' '}
                  <code>
                    {doNotTranslate(
                      assignmentTestKind === 'commercial-awaiting-assignment'
                        ? 'QA COMMERCIAL NOTIFICATION TEST '
                        : 'QA ASSIGNMENT NOTIFICATION TEST ',
                    ) + assignmentLeadId}
                  </code>
                </p>
                <p>
                  {t`Raw phone`}:{' '}
                  <code>{doNotTranslate('TEST ONLY — no real phone')}</code>
                </p>
                <p>
                  {t`Area`}:{' '}
                  <code>
                    {doNotTranslate('QA test only — no real customer')}
                  </code>
                </p>
                <p>
                  {t`Electricity bill response`}:{' '}
                  <code>{doNotTranslate('RM 500 (dummy test)')}</code>
                </p>
              </details>
            )}
            <StyledActions>
              <StyledButton
                disabled={
                  busy ||
                  !status.connected ||
                  !status.sender ||
                  status.sendingEnabled ||
                  status.paused !== true ||
                  !z.uuid().safeParse(assignmentLeadId).success ||
                  Boolean(
                    status.lastAssignmentTest &&
                    ['waiting', 'sending', 'delivery-unknown'].includes(
                      status.lastAssignmentTest.state,
                    ),
                  )
                }
                onClick={() => {
                  const requestId =
                    status.lastAssignmentTest?.requestId === assignmentRequestId
                      ? v4()
                      : assignmentRequestId;
                  setAssignmentRequestId(requestId);
                  void run({
                    action: 'arm-assignment-test',
                    requestId,
                    leadId: assignmentLeadId,
                    ...(assignmentTestKind === 'commercial-awaiting-assignment'
                      ? { kind: assignmentTestKind }
                      : {}),
                    expectedSender: status.sender,
                  });
                }}
              >
                {assignmentTestKind === 'commercial-awaiting-assignment'
                  ? t`Arm Commercial admin test`
                  : t`Arm single-lead assignment test`}
              </StyledButton>
              {status.lastAssignmentTest?.state === 'waiting' && (
                <StyledButton
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: 'cancel-assignment-test',
                      requestId: status.lastAssignmentTest?.requestId,
                    })
                  }
                >{t`Cancel assignment test`}</StyledButton>
              )}
            </StyledActions>
            {status.lastAssignmentTest && (
              <div role="status">
                <p>
                  {
                    (status.lastAssignmentTest.kind ===
                    'commercial-awaiting-assignment'
                      ? commercialTestLabels
                      : assignmentLabels)[status.lastAssignmentTest.state]
                  }
                </p>
                <p>
                  {t`Lead`}: {status.lastAssignmentTest.leadId}
                </p>
              </div>
            )}
          </details>
          <h3>{t`Notification queue`}</h3>
          {!status.jobs?.length ? (
            <p>{t`No notifications queued. Existing leads will not be replayed.`}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t`Lead`}</th>
                  <th>{t`Notification`}</th>
                  <th>{t`State`}</th>
                  <th>{t`Reason`}</th>
                  <th>{t`Action`}</th>
                </tr>
              </thead>
              <tbody>
                {status.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.leadId}</td>
                    <td>
                      {job.kind === 'commercial-awaiting-assignment'
                        ? t`Commercial — manual assignment`
                        : t`Salesperson assignment`}
                    </td>
                    <td>{job.state}</td>
                    <td>{job.reason || '—'}</td>
                    <td>
                      {[
                        'held',
                        'failed',
                        'cancelled',
                        'delivery-unknown',
                      ].includes(job.state) && (
                        <StyledButton
                          disabled={
                            busy ||
                            (job.state === 'delivery-unknown' && !confirmed)
                          }
                          onClick={() =>
                            void run({
                              action: 'retry',
                              jobId: job.id,
                              acknowledge: confirmed,
                            })
                          }
                        >{t`Retry selected notification`}</StyledButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <StyledActions>
            {queueOffset > 0 && (
              <StyledButton
                disabled={busy}
                onClick={() => setQueueOffset(Math.max(0, queueOffset - 100))}
              >{t`Previous page`}</StyledButton>
            )}
            {status.nextOffset !== undefined && status.nextOffset !== null && (
              <StyledButton
                disabled={busy}
                onClick={() => setQueueOffset(status.nextOffset ?? 0)}
              >{t`Next page`}</StyledButton>
            )}
          </StyledActions>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {t`I understand that retrying an uncertain delivery may duplicate a message, and that revoking a linked device requires pairing again.`}
          </label>
          {status.paired && (
            <StyledButton
              disabled={busy || !confirmed}
              onClick={() => void run({ action: 'unpair', acknowledge: true })}
            >{t`Revoke linked device`}</StyledButton>
          )}
        </>
      )}
      <StyledActions>
        <StyledButton
          disabled={busy}
          onClick={() => void run()}
        >{t`Refresh`}</StyledButton>
      </StyledActions>
    </StyledPanel>
  );
};
