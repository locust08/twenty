export class MirroredState {
  constructor(...stores) {
    this.stores = stores;
  }
  async readJson(key) {
    const results = await Promise.allSettled(
      this.stores.map((store) => store.readJson(key)),
    );
    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );
    if (!successful.length) throw Error('All incident stores unavailable');
    return (
      successful
        .map((result) => result.value)
        .filter(Boolean)
        .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt))
        .at(-1) || null
    );
  }
  async writeJson(key, value) {
    const results = await Promise.allSettled(
      this.stores.map((store) => store.writeJson(key, value)),
    );
    if (!results.some((result) => result.status === 'fulfilled'))
      throw Error('Incident state could not be saved');
  }
}
