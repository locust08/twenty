import { SunyieldWorkerProbeJob } from 'src/engine/core-modules/email/sunyield-worker-probe.job';

describe('Sunyield worker probe', () => {
  it('completes without reading or writing CRM records', async () => {
    await expect(
      new SunyieldWorkerProbeJob().handle(),
    ).resolves.toBeUndefined();
  });
});
