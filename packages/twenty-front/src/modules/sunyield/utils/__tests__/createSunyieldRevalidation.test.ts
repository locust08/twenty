import { createSunyieldRevalidation } from '@/sunyield/utils/createSunyieldRevalidation';
const deferred = <TValue>() => {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
describe('Sunyield capability revalidation', () => {
  it('can retry after a synchronous request failure', async () => {
    const load = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('request setup');
      })
      .mockResolvedValueOnce('recovered');
    const cache = createSunyieldRevalidation<string>(load);
    await cache.refresh('lead');
    await cache.invalidate('lead');
    expect(cache.get('lead')).toBe('recovered');
  });
  it('keeps an editor capability stable during routine poll/autosave revalidation', async () => {
    const next = deferred<string | undefined>();
    const load = jest
      .fn()
      .mockResolvedValueOnce('editable')
      .mockReturnValueOnce(next.promise);
    const cache = createSunyieldRevalidation<string>(load);
    await cache.refresh('lead');
    const refresh = cache.invalidate('lead');
    expect(cache.get('lead')).toBe('editable');
    next.resolve('editable');
    await refresh;
    expect(cache.get('lead')).toBe('editable');
  });
  it('discards a pre-invalidation response and immediately replays the pending refresh', async () => {
    const old = deferred<string | undefined>();
    const load = jest
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(undefined);
    const cache = createSunyieldRevalidation<string>(load);
    const pending = cache.refresh('lead');
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    const invalidation = cache.invalidate('lead');
    old.resolve('stale editable');
    await Promise.all([pending, invalidation]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.get('lead')).toBeUndefined();
  });
  it('emits only confirmed changes and fails closed on a denied request', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce('editable')
      .mockResolvedValueOnce(undefined);
    const cache = createSunyieldRevalidation<string>(load);
    const listener = jest.fn();
    cache.subscribe(listener);
    await cache.refresh('lead');
    await cache.invalidate('lead');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(cache.get('lead')).toBeUndefined();
  });
});
