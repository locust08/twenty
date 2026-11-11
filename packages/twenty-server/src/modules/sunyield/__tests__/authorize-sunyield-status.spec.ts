import {
  assertSunyieldUser,
  authorizeSunyieldStatus,
  parseSunyieldStatusRequest,
} from 'src/modules/sunyield/authorize-sunyield-status';

const request = {
  recordId: 'f453c74a-3f6e-55e7-8db8-dfb048901b26',
  status: 'FOLLOW_UP' as const,
  expectedUpdatedAt: '2026-11-03T01:00:00.000Z',
};
const lead = {
  id: request.recordId,
  assignedSalespersonId: 'salesperson-a',
  updatedAt: request.expectedUpdatedAt,
  deletedAt: null,
};

describe('Sunyield Status authorization', () => {
  it('accepts a uniquely mapped owner', () => {
    expect(() =>
      authorizeSunyieldStatus(request, lead, ['salesperson-a']),
    ).not.toThrow();
  });
  it.each([[], ['salesperson-a', 'salesperson-b'], ['salesperson-b']])(
    'denies missing, ambiguous or different ownership: %j',
    (...salespersonIds) => {
      expect(() =>
        authorizeSunyieldStatus(request, lead, salespersonIds),
      ).toThrow();
    },
  );
  it('accepts the ORM Date representation of the displayed version', () => {
    expect(() =>
      authorizeSunyieldStatus(
        request,
        { ...lead, updatedAt: new Date(request.expectedUpdatedAt) },
        ['salesperson-a'],
      ),
    ).not.toThrow();
  });
  it('denies a deleted lead', () => {
    expect(() =>
      authorizeSunyieldStatus(
        request,
        { ...lead, deletedAt: '2026-11-03T02:00:00Z' },
        ['salesperson-a'],
      ),
    ).toThrow();
  });
  it('denies stale records', () => {
    expect(() =>
      authorizeSunyieldStatus(
        request,
        { ...lead, updatedAt: '2026-11-03T02:00:00Z' },
        ['salesperson-a'],
      ),
    ).toThrow();
  });
  it('denies a missing record', () => {
    expect(() =>
      authorizeSunyieldStatus(request, null, ['salesperson-a']),
    ).toThrow();
  });
  it('accepts all existing statuses', () => {
    for (const status of [
      'NEW',
      'CALLBACK',
      'FOLLOW_UP',
      'HIGH',
      'LOW',
      'SITE_VISIT',
      'QUOTE',
      'NO_RESPONSE',
      'SECURED',
      'WITHDRAW',
      'INVALID',
    ]) {
      expect(parseSunyieldStatusRequest({ ...request, status }).status).toBe(
        status,
      );
    }
  });
  it.each([
    { ...request, assignedSalespersonId: 'salesperson-a' },
    { ...request, status: 'UNRECOGNIZED' },
    { ...request, recordId: 'bad-id' },
    { ...request, expectedUpdatedAt: '' },
    null,
  ])('rejects malformed or extra-field payloads %j', (body) => {
    expect(() => parseSunyieldStatusRequest(body)).toThrow();
  });
});

describe('Sunyield principal boundary', () => {
  it('accepts an authenticated Sunyield user', () => {
    expect(() =>
      assertSunyieldUser({
        type: 'user',
        workspace: { id: 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6' },
      }),
    ).not.toThrow();
  });
  it.each(['application', 'apiKey', 'system', 'pendingActivationUser'])(
    'rejects %s principals',
    (type) => {
      expect(() =>
        assertSunyieldUser({
          type,
          workspace: { id: 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6' },
        }),
      ).toThrow();
    },
  );
  it('rejects a different workspace', () => {
    expect(() =>
      assertSunyieldUser({ type: 'user', workspace: { id: 'locus' } }),
    ).toThrow();
  });
});
