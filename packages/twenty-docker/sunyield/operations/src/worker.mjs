import { setTimeout as delay } from 'node:timers/promises';
export const checkWorker = async (queue, wait = delay) => {
  const id = 'sunyield-operations-probe';
  let job = await queue.getJob(id);
  if (job) {
    const status = await job.getState();
    if (status === 'completed' || status === 'failed') {
      await job.remove();
      job = null;
    }
  }
  job ||= await queue.add(
    'SunyieldWorkerProbeJob',
    {},
    {
      jobId: id,
      attempts: 1,
      removeOnComplete: { age: 3600, count: 10 },
      removeOnFail: { age: 3600, count: 10 },
    },
  );
  for (let attempt = 0; attempt < 15; attempt++) {
    const status = await job.getState();
    if (status === 'completed') return;
    if (status === 'failed') throw Error('Worker probe failed');
    await wait(2000);
  }
  throw Error('Worker probe timed out');
};
