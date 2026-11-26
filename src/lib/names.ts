const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;

/** Last name for short labels, skipping suffixes: "Luther Burden III" → "Burden", "Brian Robinson Jr." → "Robinson". */
export function surname(name: string): string {
  const w = name.trim().split(/\s+/);
  while (w.length > 1 && SUFFIX.test(w[w.length - 1])) w.pop();
  return w[w.length - 1] ?? name;
}
