import { kvClear, kvGet, kvSet, kvTimes } from "./kv";

export type Source = "sleeper" | "nflverse";

export interface CachedResult<T> {
  data: T;
  fetchedAt: number;
  source: Source;
  stale: boolean; // true when the network failed and we served an old copy
}

const inflight = new Map<string, Promise<unknown>>();
/** Parsed copies kept in memory so large payloads aren't re-parsed on every screen. */
const parsedMemo = new Map<string, { fetchedAt: number; data: unknown }>();

/**
 * Read-through cache stored on this device (IndexedDB).
 * - Fresh copy within ttl → served locally, no request.
 * - Expired or forced → fetch; on failure fall back to the old copy (marked stale).
 */
export async function cached<T>(
  key: string,
  source: Source,
  ttlMs: number,
  fetcher: () => Promise<string>,
  parse: (body: string) => T,
  opts: { force?: boolean } = {},
): Promise<CachedResult<T>> {
  const now = Date.now();
  const memo = parsedMemo.get(key);
  if (memo && !opts.force && now - memo.fetchedAt < ttlMs) return { data: memo.data as T, fetchedAt: memo.fetchedAt, source, stale: false };
  const existing = inflight.get(key) as Promise<CachedResult<T>> | undefined;
  if (existing) return existing;
  const p = (async () => {
    const row = await kvGet(key);
    try {
      if (row && !opts.force && now - row.fetchedAt < ttlMs) {
        const data = parse(row.body);
        parsedMemo.set(key, { fetchedAt: row.fetchedAt, data });
        return { data, fetchedAt: row.fetchedAt, source, stale: false };
      }
      const body = await fetcher();
      const data = parse(body); // validate before storing
      await kvSet({ key, fetchedAt: now, body });
      parsedMemo.set(key, { fetchedAt: now, data });
      return { data, fetchedAt: now, source, stale: false };
    } catch (err) {
      if (row) {
        const data = parse(row.body);
        return { data, fetchedAt: row.fetchedAt, source, stale: true };
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function lastSync(prefix = "sleeper:"): Promise<number | null> {
  const ts = await kvTimes(prefix);
  return ts.length ? Math.max(...ts) : null;
}

export async function clearCache() {
  parsedMemo.clear();
  await kvClear();
}

/** Drop in-memory copies so the next read re-checks freshness (used by the Refresh button). */
export function forgetMemo() {
  parsedMemo.clear();
}
