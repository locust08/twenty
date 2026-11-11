import { SunyieldWhatsappService } from '../sunyield-whatsapp.service';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
const context = {
  type: 'user',
  workspace: { id: 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6' },
  user: { id: 'user' },
  userWorkspaceId: 'membership',
  workspaceMemberId: 'member',
} as WorkspaceAuthContext;
const setup = (admin = true) => {
  let active = admin;
  const manager = {
    executeInWorkspaceContext: async (work: () => Promise<unknown>) => work(),
    runInWorkspaceTransaction: async (
      work: (transaction: unknown) => Promise<unknown>,
    ) =>
      work({
        executeRawQuery: async () => (active ? [{ id: 'membership' }] : []),
      }),
  } as unknown as WorkspaceOrmManager;
  const values: Record<string, string> = {
    SERVER_URL: 'https://crm-sunyield.up.railway.app',
    SUNYIELD_HERMES_URL: 'http://hermes.railway.internal:8080',
    SUNYIELD_HERMES_ADMIN_TOKEN: 'test-secret',
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as TwentyConfigService;
  const service = new SunyieldWhatsappService(manager, config);
  const request = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response(
        JSON.stringify({ sendingEnabled: false, paired: false, jobs: [] }),
        { status: 200 },
      ),
    );
  return {
    service,
    request,
    revoke: () => {
      active = false;
    },
  };
};
afterEach(() => jest.restoreAllMocks());
it('allows only the live Sunyield admin and forwards only its trusted member identity', async () => {
  const { service, request } = setup();
  await service.control(context, 'https://crm-sunyield.up.railway.app', {
    action: 'pair',
  });
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
    action: 'pair',
    memberId: 'member',
  });
});
it('revoked admin cannot access an open pairing session', async () => {
  const { service, revoke, request } = setup();
  revoke();
  await expect(
    service.control(context, 'https://crm-sunyield.up.railway.app', {
      action: 'pair-status',
      sessionId: 'opaque',
    }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it.each(['enable', 'send', 'shell', 'http://evil'])(
  'rejects unsupported control %s',
  async (action) => {
    const { service, request } = setup();
    await expect(
      service.control(context, 'https://crm-sunyield.up.railway.app', {
        action,
      }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);
it.each([undefined, 'https://evil.example', 'null'])(
  'rejects cross-origin mutation %s',
  async (origin) => {
    const { service, request } = setup();
    await expect(
      service.control(context, origin, { action: 'pair' }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);
it('rejects forged member and arbitrary recipient fields', async () => {
  const { service, request } = setup();
  await expect(
    service.control(context, 'https://crm-sunyield.up.railway.app', {
      action: 'pair',
      memberId: 'victim',
      recipient: '60123456789',
    }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it.each(['apiKey', 'application', 'system'])(
  'rejects non-user principal %s',
  async (type) => {
    const { service, request } = setup();
    await expect(
      service.status({ ...context, type } as WorkspaceAuthContext),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);
it('rejects another workspace', async () => {
  const { service, request } = setup();
  await expect(
    service.status({
      ...context,
      workspace: { id: 'other' },
    } as WorkspaceAuthContext),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it('allows the fixed self-test action with the live admin identity', async () => {
  const { service, request } = setup();
  const body = {
    action: 'send-test',
    requestId: 'ea5abc59-6009-415c-9e2c-5db3eaed90fd',
    expectedSender: '+60123456789',
  };
  await service.control(context, 'https://crm-sunyield.up.railway.app', body);
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
    ...body,
    memberId: 'member',
  });
});
it.each([
  { recipient: '+60999999999' },
  { message: 'arbitrary text' },
  { expectedSender: 'not-a-number' },
  { requestId: 'invalid' },
])('rejects malformed or arbitrary self-test inputs %j', async (extra) => {
  const { service, request } = setup();
  await expect(
    service.control(context, 'https://crm-sunyield.up.railway.app', {
      action: 'send-test',
      requestId: 'ea5abc59-6009-415c-9e2c-5db3eaed90fd',
      expectedSender: '+60123456789',
      ...extra,
    }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it('a revoked admin cannot send a self-test', async () => {
  const { service, revoke, request } = setup();
  revoke();
  await expect(
    service.control(context, 'https://crm-sunyield.up.railway.app', {
      action: 'send-test',
      requestId: 'ea5abc59-6009-415c-9e2c-5db3eaed90fd',
      expectedSender: '+60123456789',
    }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it('arms one future synthetic lead only with the trusted live admin identity', async () => {
  const { service, request } = setup();
  const body = {
    action: 'arm-assignment-test',
    requestId: 'ea5abc59-6009-415c-9e2c-5db3eaed90fd',
    leadId: '27dc7b7a-2c2b-5292-a4ee-84f896fff9dc',
    expectedSender: '+60123456789',
  };
  await service.control(context, 'https://crm-sunyield.up.railway.app', body);
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
    ...body,
    memberId: 'member',
  });
});
it.each([
  { recipient: '+60999999999' },
  { message: 'arbitrary' },
  { leadId: 'invalid' },
  { memberId: 'forged' },
  { expectedSender: 'invalid' },
])('rejects forged assignment test inputs %j', async (extra) => {
  const { service, request } = setup();
  await expect(
    service.control(context, 'https://crm-sunyield.up.railway.app', {
      action: 'arm-assignment-test',
      requestId: 'ea5abc59-6009-415c-9e2c-5db3eaed90fd',
      leadId: '27dc7b7a-2c2b-5292-a4ee-84f896fff9dc',
      expectedSender: '+60123456789',
      ...extra,
    }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it('revoked admins cannot arm or cancel an assignment test', async () => {
  const { service, request, revoke } = setup();
  revoke();
  for (const body of [
    {
      action: 'arm-assignment-test',
      requestId: 'ea5abc59-6009-415c-9e2c-5db3eaed90fd',
      leadId: '27dc7b7a-2c2b-5292-a4ee-84f896fff9dc',
      expectedSender: '+60123456789',
    },
    {
      action: 'cancel-assignment-test',
      requestId: 'ea5abc59-6009-415c-9e2c-5db3eaed90fd',
    },
  ])
    await expect(
      service.control(context, 'https://crm-sunyield.up.railway.app', body),
    ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it('forwards acknowledged Resume only under the live admin identity', async () => {
  const { service, request } = setup();
  await service.control(context, 'https://crm-sunyield.up.railway.app', {
    action: 'resume',
    acknowledge: true,
  });
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
    action: 'resume',
    acknowledge: true,
    memberId: 'member',
  });
});
it.each([
  { acknowledge: false },
  { acknowledge: true, enable: true },
  { acknowledge: true, memberId: 'forged' },
])('rejects unsafe Resume input %j', async (body) => {
  const { service, request } = setup();
  await expect(
    service.control(context, 'https://crm-sunyield.up.railway.app', {
      action: 'resume',
      ...body,
    }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});

it('retains notification kinds for admins to distinguish Commercial alerts from assignment messages', async () => {
  const value = setup();
  value.request.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        sendingEnabled: false,
        paired: true,
        jobs: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            leadId: 'lead',
            kind: 'commercial-awaiting-assignment',
            state: 'pending',
            reason: null,
          },
        ],
      }),
      { status: 200 },
    ),
  );
  expect(await value.service.status(context)).toEqual(
    expect.objectContaining({
      jobs: [
        expect.objectContaining({ kind: 'commercial-awaiting-assignment' }),
      ],
    }),
  );
});

it('forwards only a supported Commercial single-lead test kind under the existing admin boundary', async () => {
  const value = setup();
  const body = {
    action: 'arm-assignment-test',
    requestId: '11111111-1111-4111-8111-111111111111',
    leadId: '22222222-2222-4222-8222-222222222222',
    expectedSender: '+60123456789',
    kind: 'commercial-awaiting-assignment',
  };
  await value.service.control(
    context,
    'https://crm-sunyield.up.railway.app',
    body,
  );
  expect(JSON.parse(String(value.request.mock.calls[0][1]?.body))).toEqual({
    ...body,
    memberId: 'member',
  });
  await expect(
    value.service.control(context, 'https://crm-sunyield.up.railway.app', {
      ...body,
      kind: 'arbitrary-send',
    }),
  ).rejects.toThrow();
});

it('rejects the retired host as an admin control origin after the rename', async () => {
  const value = setup();
  await expect(
    value.service.control(context, 'https://twenty-sunyield.up.railway.app', {
      action: 'pair',
    }),
  ).rejects.toThrow();
  expect(value.request).not.toHaveBeenCalled();
});
