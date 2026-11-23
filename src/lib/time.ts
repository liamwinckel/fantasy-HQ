/** NFLverse kickoff times are US Eastern. Convert "YYYY-MM-DDTHH:MM" (ET) to epoch ms. */
export function easternToEpoch(local: string): number {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = (t ?? "13:00").split(":").map(Number);
  // DST: second Sunday of March → first Sunday of November
  const secondSunMar = nthSunday(y, 2, 2);
  const firstSunNov = nthSunday(y, 10, 1);
  const date = Date.UTC(y, m - 1, day);
  const dst = date >= secondSunMar && date < firstSunNov;
  const offsetH = dst ? 4 : 5;
  return Date.UTC(y, m - 1, day, hh + offsetH, mm);
}

function nthSunday(year: number, monthIdx: number, n: number) {
  const first = new Date(Date.UTC(year, monthIdx, 1));
  const firstSun = 1 + ((7 - first.getUTCDay()) % 7);
  return Date.UTC(year, monthIdx, firstSun + 7 * (n - 1));
}

export function ago(ts: number | null, now = Date.now()): string {
  if (!ts) return "never";
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
