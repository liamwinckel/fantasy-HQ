/**
 * Every network read goes through here, so tests can swap in fixtures.
 * In the browser this is plain fetch.
 */
export type Transport = (url: string, kind: "text") => Promise<string>;

const g = globalThis as unknown as { __fhqTransport?: Transport };

export function setTransport(t: Transport | undefined) {
  g.__fhqTransport = t;
}

export async function fetchText(url: string, timeoutMs = 30_000): Promise<string> {
  if (g.__fhqTransport) return g.__fhqTransport(url, "text");
  // Manual timeout (AbortSignal.timeout isn't in older Safari).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const res = await fetch(url, { cache: "no-store", signal: ctrl.signal }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

/** Where the app is served from: "/fantasy-hq" on GitHub Pages, "" locally. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** URL of a data file built by scripts/build-data.ts. */
export const dataUrl = (file: string) => {
  const origin = typeof window === "undefined" ? "http://local" : window.location.origin;
  return `${origin}${BASE_PATH}/data/${file}`;
};
