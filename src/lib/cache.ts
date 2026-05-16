
type CacheEntry<T> = { data: T; ts: number };
const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string, ttlMs = 30_000): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) { store.delete(key); return null; }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export function cacheInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
