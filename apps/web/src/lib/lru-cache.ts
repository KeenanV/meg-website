/** Least recently used entries are released rather than growing with browsing history. */
export class LruCache<T> {
  private readonly entries = new Map<string, T>();
  private readonly limit: number;
  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Cache limit must be a positive integer');
    this.limit = limit;
  }
  get size() { return this.entries.size; }
  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }
  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
}
