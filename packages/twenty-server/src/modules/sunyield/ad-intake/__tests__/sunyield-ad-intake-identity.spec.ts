import {
  buildAdIntakeIdentity,
  getAdIntakeProvenanceForLead,
} from '../sunyield-ad-intake.identity';

describe('native ad provenance identity', () => {
  const identity = buildAdIntakeIdentity('meta', '10001', '100');
  const rawRecord = {
    id: identity.id,
    submissionId: identity.submissionId,
    source: 'FACEBOOK',
    createdBySource: 'SYSTEM',
  };
  it('recognizes the unformatted before-image supplied by the native ownership guard', () => {
    expect(getAdIntakeProvenanceForLead(rawRecord)).toEqual([
      {
        leadId: identity.id,
        noteId: identity.noteId,
        targetId: identity.targetId,
      },
    ]);
  });
  it.each([
    { createdBySource: 'MANUAL' },
    { createdBySource: null },
    { createdBySource: undefined, createdBy: { source: 'SYSTEM' } },
    { source: 'GOOGLE_ADS' },
    { id: 'unrelated' },
    { submissionId: 'ad-intake-meta-forged' },
  ])('rejects an inconsistent native before-image: %j', (override) => {
    expect(getAdIntakeProvenanceForLead({ ...rawRecord, ...override })).toEqual(
      [],
    );
  });
});
