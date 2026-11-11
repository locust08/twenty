import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SunyieldWhatsappPanel } from '@/sunyield/components/SunyieldWhatsappPanel';
it('keeps sending disabled and does not begin pairing on page load', async () => {
  const calls: unknown[] = [];
  const request = async (body?: unknown) => {
    calls.push(body);
    return { sendingEnabled: false, paired: false, connected: false, jobs: [] };
  };
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel request={request} />
    </I18nProvider>,
  );
  expect(await screen.findByText('Sending disabled')).toBeInTheDocument();
  expect(calls).toEqual([undefined]);
  await userEvent.click(screen.getByRole('button', { name: 'Begin pairing' }));
  expect(calls[1]).toEqual({ action: 'pair' });
  expect(
    screen.queryByRole('button', { name: /enable sending/i }),
  ).not.toBeInTheDocument();
});
it('denied access cannot leave pairing controls visible', async () => {
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel
        request={async () => {
          throw Error('Forbidden');
        }}
      />
    </I18nProvider>,
  );
  expect(await screen.findByText(/could not load/i)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Begin pairing' }),
  ).not.toBeInTheDocument();
});
it('sends a dummy self-test only after an explicit click and shows submission without enabling automatic sending', async () => {
  const calls: unknown[] = [];
  const request = async (body?: unknown) => {
    calls.push(body);
    return {
      sendingEnabled: false,
      paused: true,
      paired: true,
      connected: true,
      sender: '+60123456789',
      jobs: [],
      lastTest: body
        ? {
            requestId: 'ea5abc59-6009-415c-9e2c-5db3eaed90fd',
            state: 'submitted',
            recipient: '+60123456789',
            createdAt: Date.now(),
          }
        : null,
    };
  };
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel request={request} />
    </I18nProvider>,
  );
  await userEvent.click(await screen.findByText('Operator tests'));
  const button = await screen.findByRole('button', {
    name: 'Send dummy lead to connected number',
  });
  expect(calls).toEqual([undefined]);
  await userEvent.click(button);
  expect(calls[1]).toEqual({
    action: 'send-test',
    requestId: expect.any(String),
    expectedSender: '+60123456789',
  });
  expect(
    await screen.findByText(
      /Test submitted to WhatsApp; delivery is not yet confirmed/,
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Sending disabled')).toBeInTheDocument();
  expect(button).toBeDisabled();
});
it('cannot send a dummy test while disconnected', async () => {
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel
        request={async () => ({
          sendingEnabled: false,
          paused: true,
          paired: false,
          connected: false,
          jobs: [],
        })}
      />
    </I18nProvider>,
  );
  await userEvent.click(await screen.findByText('Operator tests'));
  expect(
    await screen.findByRole('button', {
      name: 'Send dummy lead to connected number',
    }),
  ).toBeDisabled();
});
it('a settled local request gets a fresh UUID even after another admin becomes the latest test', async () => {
  const initial = {
    sendingEnabled: false,
    paused: true,
    paired: true,
    connected: true,
    sender: '+60123456789',
    jobs: [],
    lastTest: null as unknown,
  };
  let current = initial;
  const requests: { requestId: string }[] = [];
  const request = async (body?: unknown) => {
    if (body) {
      const value = body as { requestId: string };
      requests.push(value);
      current = {
        ...initial,
        lastTest: {
          requestId: value.requestId,
          state: 'submitted',
          recipient: '+60123456789',
          createdAt: Date.now() - 61000,
        },
      };
    }
    return current;
  };
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel request={request} />
    </I18nProvider>,
  );
  await userEvent.click(await screen.findByText('Operator tests'));
  const button = await screen.findByRole('button', {
    name: 'Send dummy lead to connected number',
  });
  await userEvent.click(button);
  current = {
    ...initial,
    lastTest: {
      requestId: 'another-admin',
      state: 'submitted',
      recipient: '+60123456789',
      createdAt: Date.now() - 61000,
    },
  };
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await userEvent.click(button);
  expect(requests).toHaveLength(2);
  expect(requests[1].requestId).not.toBe(requests[0].requestId);
});
it('a lost response retains the same self-test UUID when explicitly retried', async () => {
  const requests: { requestId: string }[] = [];
  const request = async (body?: unknown) => {
    if (body) {
      requests.push(body as { requestId: string });
      throw Error('Response lost');
    }
    return {
      sendingEnabled: false,
      paused: true,
      paired: true,
      connected: true,
      sender: '+60123456789',
      jobs: [],
    };
  };
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel request={request} />
    </I18nProvider>,
  );
  await userEvent.click(await screen.findByText('Operator tests'));
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Send dummy lead to connected number',
    }),
  );
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Send dummy lead to connected number',
    }),
  );
  expect(requests).toHaveLength(2);
  expect(requests[1].requestId).toBe(requests[0].requestId);
});
it('arms a single lead only on explicit click and cancels it without enabling production', async () => {
  const calls: unknown[] = [];
  const leadId = '27dc7b7a-2c2b-5292-a4ee-84f896fff9dc';
  const initial = {
    sendingEnabled: false,
    paused: true,
    connected: true,
    paired: true,
    sender: '+60123456789',
    jobs: [],
  };
  const request = async (body?: unknown) => {
    calls.push(body);
    if (!body) return initial;
    const value = body as { action: string; requestId: string };
    return {
      ...initial,
      lastAssignmentTest: {
        requestId: value.requestId,
        leadId,
        recipient: '+60123456789',
        armedAt: Date.now(),
        expiresAt: Date.now() + 600000,
        state: value.action === 'arm-assignment-test' ? 'waiting' : 'cancelled',
        reason: null,
        assignedSalespersonId: null,
        assignedAt: null,
      },
    };
  };
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel request={request} />
    </I18nProvider>,
  );
  await userEvent.click(await screen.findByText('Operator tests'));
  const arm = await screen.findByRole('button', {
    name: 'Arm single-lead assignment test',
  });
  expect(calls).toEqual([undefined]);
  expect(arm).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Synthetic lead UUID'), leadId);
  await userEvent.click(screen.getByText('Required synthetic lead fields'));
  expect(screen.getByText(/Source Facebook.*Residential/)).toBeVisible();
  await userEvent.click(arm);
  expect(calls[1]).toEqual({
    action: 'arm-assignment-test',
    requestId: expect.any(String),
    leadId,
    expectedSender: '+60123456789',
  });
  expect(
    await screen.findByText(
      'Waiting for the new synthetic lead and its automatic assignment.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Sending disabled')).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel assignment test' }),
  );
  expect(calls[2]).toEqual({
    action: 'cancel-assignment-test',
    requestId: (calls[1] as { requestId: string }).requestId,
  });
  expect(
    await screen.findByText('Assignment test cancelled.'),
  ).toBeInTheDocument();
});
it('keeps Resume disabled when the deployment production flag is off', async () => {
  const calls: unknown[] = [];
  const request = async (body?: unknown) => {
    calls.push(body);
    return {
      sendingEnabled: false,
      paused: true,
      paired: true,
      connected: true,
      sender: '+60123456789',
      jobs: [],
      canResume: false,
      resumeBlockedReason: 'production_disabled',
    };
  };
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel request={request} />
    </I18nProvider>,
  );
  const button = await screen.findByRole('button', { name: 'Resume sending' });
  expect(button).toBeDisabled();
  expect(
    screen.getByText(
      'Production sending is disabled in Railway. Resume cannot enable it.',
    ),
  ).toBeInTheDocument();
  await userEvent.click(button);
  expect(calls).toEqual([undefined]);
});
it('requires explicit acknowledgment before sending a guarded Resume request', async () => {
  const calls: unknown[] = [];
  const request = async (body?: unknown) => {
    calls.push(body);
    return {
      sendingEnabled: Boolean(body),
      paused: !body,
      paired: true,
      connected: true,
      sender: '+60123456789',
      jobs: [],
      canResume: !body,
      resumeBlockedReason: body ? 'not_paused' : null,
    };
  };
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel request={request} />
    </I18nProvider>,
  );
  const button = await screen.findByRole('button', { name: 'Resume sending' });
  expect(button).toBeDisabled();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Resume eligible queued notifications using the existing activation cutoff.',
    }),
  );
  await userEvent.click(button);
  expect(calls[1]).toEqual({ action: 'resume', acknowledge: true });
  expect(await screen.findByText('Sending enabled')).toBeInTheDocument();
});

it('distinguishes Commercial admin alerts and legacy salesperson messages in the admin queue', async () => {
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel
        request={async () => ({
          sendingEnabled: false,
          paired: true,
          jobs: [
            {
              id: 'commercial-job',
              leadId: 'lead',
              kind: 'commercial-awaiting-assignment',
              state: 'pending',
              reason: null,
            },
            {
              id: 'legacy-job',
              leadId: 'lead',
              state: 'held',
              reason: 'assignment_or_recipient_missing',
            },
          ],
        })}
      />
    </I18nProvider>,
  );
  expect(
    await screen.findByText('Commercial — manual assignment'),
  ).toBeInTheDocument();
  expect(screen.getByText('Salesperson assignment')).toBeInTheDocument();
  expect(screen.getByText('Sending disabled')).toBeInTheDocument();
});

it('arms one Commercial test from the admin mode picker without enabling ordinary sends', async () => {
  const calls: unknown[] = [];
  const leadId = '22222222-2222-4222-8222-222222222222';
  const request = async (body?: unknown) => {
    calls.push(body);
    const control = body as { action?: string; requestId?: string } | undefined;
    return {
      sendingEnabled: false,
      paused: true,
      paired: true,
      connected: true,
      sender: '+60123456789',
      jobs: [],
      lastAssignmentTest:
        control?.action === 'arm-assignment-test'
          ? {
              requestId: control.requestId,
              leadId,
              recipient: '+60123456789',
              kind: 'commercial-awaiting-assignment',
              armedAt: 1000,
              expiresAt: 601000,
              state: 'waiting',
              reason: null,
              assignedSalespersonId: null,
              assignedAt: null,
            }
          : null,
    };
  };
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel request={request} />
    </I18nProvider>,
  );
  await userEvent.click(await screen.findByText('Operator tests'));
  await screen.findByText('Sending disabled');
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Test notification type' }),
    'commercial-awaiting-assignment',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Synthetic lead UUID' }),
    leadId,
  );
  await userEvent.click(screen.getByText('Required synthetic lead fields'));
  expect(screen.getByText(/Source Google Ads.*Commercial/)).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Arm Commercial admin test' }),
  );
  expect(calls).toEqual([
    undefined,
    expect.objectContaining({
      action: 'arm-assignment-test',
      leadId,
      kind: 'commercial-awaiting-assignment',
      expectedSender: '+60123456789',
    }),
  ]);
  expect(
    await screen.findByText(
      'Waiting for the new unassigned synthetic Commercial lead.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Sending disabled')).toBeInTheDocument();
});

it('keeps operator sending tests collapsed and never sends when expanded', async () => {
  const calls: unknown[] = [];
  render(
    <I18nProvider i18n={i18n}>
      <SunyieldWhatsappPanel
        request={async (body) => {
          calls.push(body);
          return {
            sendingEnabled: false,
            paused: true,
            paired: true,
            connected: true,
            sender: '+60123456789',
            jobs: [],
          };
        }}
      />
    </I18nProvider>,
  );
  await screen.findByText('Sending disabled');
  expect(
    screen.getByRole('button', { name: 'Send dummy lead to connected number' }),
  ).not.toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Pause sending' }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByText('Operator tests'));
  expect(
    screen.getByRole('button', { name: 'Send dummy lead to connected number' }),
  ).toBeVisible();
  expect(calls).toEqual([undefined]);
});
