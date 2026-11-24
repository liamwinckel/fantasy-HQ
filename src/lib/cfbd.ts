/**
 * Optional college production via collegefootballdata.com (free API key, entered in Settings).
 * For young players: share of their college team's production in their final college season
 * ("dominator rating"). Results are kept on this device, so each school-season is fetched once.
 */
import { kvGet, kvSet } from "./kv";

export interface CollegeProfile {
  season: number; team: string;
  yds: number; tds: number; rec: number;
  teamYds: number; teamTds: number;
  /** Share of team yards + TDs (0–1). */
  dominator: number;
}

const BASE = "https://api.collegefootballdata.com";
type StatRow = { player: string; category: string; statType: string; stat: string | number };
type TeamRow = { statName: string; statValue: number | string };

async function get<T>(key: string, path: string): Promise<T> {
  const cacheKey = `keep:cfbd:${path}`;
  const hit = await kvGet(cacheKey);
  if (hit) return JSON.parse(hit.body) as T;
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${key}`, accept: "application/json" } });
  if (res.status === 401 || res.status === 403) throw new Error("CFBD rejected the API key");
  if (!res.ok) throw new Error(`CFBD ${res.status}`);
  const body = await res.text();
  await kvSet({ key: cacheKey, fetchedAt: Date.now(), body });
  return JSON.parse(body) as T;
}

/** Quick check that a key works (one small request). */
export async function testCfbdKey(key: string): Promise<string> {
  const res = await fetch(`${BASE}/conferences`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(res.status === 401 ? "Key not accepted" : `CFBD returned ${res.status}`);
  return "Key works";
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");

export async function collegeProfile(key: string, name: string, college: string, season: number, pos: string): Promise<CollegeProfile | null> {
  if (!["RB", "WR", "TE"].includes(pos)) return null;
  const team = encodeURIComponent(college);
  const [rec, rush, totals] = await Promise.all([
    get<StatRow[]>(key, `/stats/player/season?year=${season}&team=${team}&category=receiving`),
    get<StatRow[]>(key, `/stats/player/season?year=${season}&team=${team}&category=rushing`),
    get<TeamRow[]>(key, `/stats/season?year=${season}&team=${team}`),
  ]);
  const me = norm(name);
  const pick = (rows: StatRow[], type: string) => Number(rows.find((r) => norm(r.player) === me && r.statType === type)?.stat ?? 0);
  const tv = (n: string) => Number(totals.find((t) => t.statName === n)?.statValue ?? 0);
  const recYds = pick(rec, "YDS"), recTd = pick(rec, "TD"), recs = pick(rec, "REC");
  const rushYds = pick(rush, "YDS"), rushTd = pick(rush, "TD");
  if (!recYds && !rushYds) return null;
  const passYds = tv("netPassingYards"), passTd = tv("passingTDs"), teamRush = tv("rushingYards"), teamRushTd = tv("rushingTDs");
  const rb = pos === "RB";
  const yds = rb ? recYds + rushYds : recYds, tds = rb ? recTd + rushTd : recTd;
  const teamYds = rb ? passYds + teamRush : passYds, teamTds = rb ? passTd + teamRushTd : passTd;
  if (!teamYds) return null;
  const dominator = ((yds / teamYds) + (teamTds ? tds / teamTds : yds / teamYds)) / 2;
  return { season, team: college, yds, tds, rec: recs, teamYds, teamTds, dominator: Math.round(dominator * 1000) / 1000 };
}

/** Profiles for many young players; failures are skipped. */
export async function collegeProfiles(key: string, list: { id: string; name: string; college: string | null; lastSeason: number; pos: string }[]): Promise<Map<string, CollegeProfile>> {
  const out = new Map<string, CollegeProfile>();
  let err: Error | null = null;
  for (const p of list) {
    if (!p.college) continue;
    try { const c = await collegeProfile(key, p.name, p.college, p.lastSeason, p.pos); if (c) out.set(p.id, c); }
    catch (e) { err = e as Error; if (/key/i.test(err.message)) throw err; }
  }
  if (!out.size && err) throw err;
  return out;
}

/** Typical final-season dominator by position (≈ average NFL draftee); used to score −1…+1. */
export const DOMINATOR_AVG: Record<string, number> = { WR: 0.24, RB: 0.2, TE: 0.15 };
