/** Tiny key-value store: IndexedDB in the browser, memory elsewhere (tests). */
interface Row { key: string; fetchedAt: number; body: string }

const mem = new Map<string, Row>();
const hasIdb = () => typeof indexedDB !== "undefined";
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("shs-fantasy-hq", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("cache", { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const r = fn(db.transaction("cache", mode).objectStore("cache"));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export async function kvGet(key: string): Promise<Row | undefined> {
  if (!hasIdb()) return mem.get(key);
  try { return await tx<Row | undefined>("readonly", (s) => s.get(key) as IDBRequest<Row | undefined>); } catch { return mem.get(key); }
}

export async function kvSet(row: Row): Promise<void> {
  mem.set(row.key, row);
  if (!hasIdb()) return;
  try { await tx("readwrite", (s) => s.put(row)); } catch { /* private mode / quota: memory copy is enough */ }
}

export async function kvClear(): Promise<void> {
  mem.clear();
  if (!hasIdb()) return;
  try { await tx("readwrite", (s) => s.clear()); } catch { /* ignore */ }
}

export async function kvTimes(prefix: string): Promise<number[]> {
  if (!hasIdb()) return [...mem.values()].filter((r) => r.key.startsWith(prefix)).map((r) => r.fetchedAt);
  try {
    const rows = await tx<Row[]>("readonly", (s) => s.getAll() as IDBRequest<Row[]>);
    return rows.filter((r) => r.key.startsWith(prefix)).map((r) => r.fetchedAt);
  } catch { return []; }
}
