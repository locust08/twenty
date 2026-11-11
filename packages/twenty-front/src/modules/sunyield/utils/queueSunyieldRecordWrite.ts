import { doNotTranslate } from 'twenty-shared/i18n';

type WriteQueue = {
  tail: Promise<void>;
  version: string;
  acceptedVersions: Set<string>;
  pending: number;
  failed: boolean;
  error?: unknown;
};
const QUEUES = new Map<string, WriteQueue>();
export const queueSunyieldRecordWrite = <
  TResult extends { record: { updatedAt: string } },
>(
  key: string,
  expectedUpdatedAt: string,
  write: (version: string) => Promise<TResult>,
): Promise<TResult> => {
  let queue = QUEUES.get(key);
  if (!queue) {
    queue = {
      tail: Promise.resolve(),
      version: expectedUpdatedAt,
      acceptedVersions: new Set([expectedUpdatedAt]),
      pending: 0,
      failed: false,
    };
    QUEUES.set(key, queue);
  }
  const currentQueue = queue;
  currentQueue.pending++;
  const operation = currentQueue.tail.then(async () => {
    if (currentQueue.failed) throw currentQueue.error;
    if (!currentQueue.acceptedVersions.has(expectedUpdatedAt))
      throw new Error(
        doNotTranslate('This record changed. Refresh before saving'),
      );
    const result = await write(currentQueue.version);
    currentQueue.version = result.record.updatedAt;
    currentQueue.acceptedVersions.add(result.record.updatedAt);
    return result;
  });
  currentQueue.tail = operation.then(
    () => undefined,
    (error: unknown) => {
      currentQueue.failed = true;
      currentQueue.error = error;
    },
  );
  return operation.finally(() => {
    if (--currentQueue.pending === 0 && QUEUES.get(key) === currentQueue)
      QUEUES.delete(key);
  });
};
