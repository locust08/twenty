import { queueSunyieldRecordWrite } from '@/sunyield/utils/queueSunyieldRecordWrite';
const deferred = <TValue>() => {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
describe('Sunyield record autosave ordering', () => {
  it('serializes title/body saves and uses the previous confirmed version only for own queued changes', async () => {
    const first = deferred<{ record: { updatedAt: string } }>();
    const writeTitle = jest.fn().mockReturnValue(first.promise);
    const writeBody = jest
      .fn()
      .mockResolvedValue({ record: { updatedAt: 'v2' } });
    const title = queueSunyieldRecordWrite('same-note', 'v0', writeTitle);
    const body = queueSunyieldRecordWrite('same-note', 'v0', writeBody);
    await Promise.resolve();
    expect(writeBody).not.toHaveBeenCalled();
    first.resolve({ record: { updatedAt: 'v1' } });
    await Promise.all([title, body]);
    expect(writeBody).toHaveBeenCalledWith('v1');
  });
  it('does not retry or continue a queued save after a conflict', async () => {
    const conflict = new Error('409');
    const writeTitle = jest.fn().mockRejectedValue(conflict);
    const writeBody = jest.fn();
    const outcomes = await Promise.allSettled([
      queueSunyieldRecordWrite('conflicting-note', 'v0', writeTitle),
      queueSunyieldRecordWrite('conflicting-note', 'v0', writeBody),
    ]);
    expect(outcomes.every((result) => result.status === 'rejected')).toBe(true);
    expect(writeTitle).toHaveBeenCalledTimes(1);
    expect(writeBody).not.toHaveBeenCalled();
  });
  it('does not borrow an unrelated newer version observed while an own save is pending', async () => {
    const first = deferred<{ record: { updatedAt: string } }>();
    const title = queueSunyieldRecordWrite(
      'remote-note',
      'v0',
      () => first.promise,
    );
    const body = queueSunyieldRecordWrite(
      'remote-note',
      'remote-v2',
      jest.fn(),
    );
    first.resolve({ record: { updatedAt: 'v1' } });
    const result = await Promise.allSettled([title, body]);
    expect(result[1].status).toBe('rejected');
  });
});
