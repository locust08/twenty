export const createSunyieldRevalidation = <TValue>(
  load: (key: string) => Promise<TValue | undefined>,
) => {
  const values = new Map<string, TValue>();
  const generations = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  const refresh = (key: string): Promise<void> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const work = (async () => {
      await Promise.resolve();
      try {
        while (true) {
          const generation = generations.get(key) ?? 0;
          let value: TValue | undefined;
          try {
            value = await load(key);
          } catch {
            value = undefined;
          }
          if (generation !== (generations.get(key) ?? 0)) continue;
          const previous = values.get(key);
          if (value === undefined) values.delete(key);
          else values.set(key, value);
          if (previous !== value) for (const listener of listeners) listener();
          return;
        }
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, work);
    return work;
  };
  return {
    get: (key: string) => values.get(key),
    refresh,
    invalidate: (key: string) => {
      generations.set(key, (generations.get(key) ?? 0) + 1);
      return refresh(key);
    },
    forget: (key: string) => {
      values.delete(key);
      generations.set(key, (generations.get(key) ?? 0) + 1);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
