/**
 * SHS AI accuracy tracking, kept on this device.
 *
 * Before each week's games, the weekly rankings are saved (expert rank, SHS AI rank, Sleeper projection and every
 * SHS factor). After the week, they are compared with what players actually scored in this league:
 *   head-to-head accuracy = of every pair of players at a position, how often each ranking put the higher scorer first.
 * Auto-tune: each factor's weight is nudged by how well it predicted beating (or missing) the expert rank.
 */
import { kvList, kvSet } from "../kv";
import type { LeagueContext } from "./league";
import type { RankRow } from "./rankings";
import type { ShsAi } from "./shsai";

type SnapRow = [id: string, pos: string, ecrPos: number, aiRank: number, proj: number, factors: Record<string, number>];
interface Snapshot { at: number; week: number; rows: SnapRow[] }
const CUT: Record<string, number> = { QB: 24, RB: 40, WR: 50, TE: 20 };
const key = (ctx: LeagueContext, week: number) => `keep:acc:${ctx.league.league_id}:${ctx.league.season}:${String(week).padStart(2, "0")}`;

/** Eastern-time kickoff string → epoch ms (DST approximated by month). */
function kick(s: string | null) {
  if (!s) return null;
  const m = Number(s.slice(5, 7));
  const t = Date.parse(`${s.length === 16 ? `${s}:00` : s}${m >= 4 && m <= 10 ? "-04:00" : "-05:00"}`);
  return Number.isFinite(t) ? t : null;
}

/** Save this week's weekly rankings until the week's first kickoff. */
export async function snapshotWeek(ctx: LeagueContext, rows: RankRow[], ai: Map<string, ShsAi>) {
  const week = Math.min(ctx.currentWeek, ctx.lastWeek);
  if (ctx.seasonOver || typeof window === "undefined") return;
  const first = Math.min(...ctx.games.filter((g) => g.week === week).map((g) => kick(g.kickoff) ?? Infinity));
  if (Number.isFinite(first) && Date.now() > first) return; // games started: keep the pre-game snapshot
  const snap: Snapshot = {
    at: Date.now(), week,
    rows: rows.filter((r) => r.ecrPos !== null && CUT[r.pos] && r.ecrPos <= CUT[r.pos] * 1.5).map((r) => {
      const a = ai.get(r.id);
      return [r.id, r.pos, r.ecrPos!, a?.rank ?? r.ecrPos!, Math.round(r.pts * 10) / 10, Object.fromEntries((a?.factors ?? []).map((f) => [f.key, f.value]))];
    }),
  };
  await kvSet({ key: key(ctx, week), fetchedAt: snap.at, body: JSON.stringify(snap) });
}

export interface AccuracyReport {
  weeks: number[];
  pairs: number;
  experts: number; shs: number; sleeper: number;
  byWeek: { week: number; experts: number; shs: number; sleeper: number }[];
  /** Factor → { corr with beating the expert rank, samples, multiplier }. */
  factors: Record<string, { corr: number; n: number; mult: number }>;
}

function pairAcc(list: { actual: number; score: number }[]) {
  let good = 0, all = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.actual === b.actual || a.score === b.score) continue;
    all++;
    if ((a.actual > b.actual) === (a.score > b.score)) good++;
  }
  return { good, all };
}
const corr = (xs: number[], ys: number[]) => {
  const n = xs.length; if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : 0;
};

/** Grade every saved week that has finished. */
export async function accuracy(ctx: LeagueContext): Promise<AccuracyReport | null> {
  const rows = await kvList(`keep:acc:${ctx.league.league_id}:${ctx.league.season}:`);
  const snaps = rows.map((r) => JSON.parse(r.body) as Snapshot).filter((s) => s.week < ctx.currentWeek || ctx.seasonOver).sort((a, b) => a.week - b.week);
  if (!snaps.length) return null;
  const tot = { e: { good: 0, all: 0 }, s: { good: 0, all: 0 }, p: { good: 0, all: 0 } };
  const byWeek: AccuracyReport["byWeek"] = [];
  const fx = new Map<string, { x: number[]; y: number[] }>();
  for (const snap of snaps) {
    const wk = { e: { good: 0, all: 0 }, s: { good: 0, all: 0 }, p: { good: 0, all: 0 } };
    for (const pos of Object.keys(CUT)) {
      const list = snap.rows.filter((r) => r[1] === pos).map((r) => ({ r, actual: ctx.logs.get(r[0])?.find((g) => g.week === snap.week)?.pts ?? null }))
        .filter((x): x is { r: SnapRow; actual: number } => x.actual !== null);
      if (list.length < 4) continue;
      const add = (acc: { good: number; all: number }, v: { good: number; all: number }) => { acc.good += v.good; acc.all += v.all; };
      const e = pairAcc(list.map((x) => ({ actual: x.actual, score: -x.r[2] })));
      const s = pairAcc(list.map((x) => ({ actual: x.actual, score: -x.r[3] })));
      const p = pairAcc(list.map((x) => ({ actual: x.actual, score: x.r[4] })));
      add(wk.e, e); add(wk.s, s); add(wk.p, p); add(tot.e, e); add(tot.s, s); add(tot.p, p);
      // residual: actual percentile minus expert-rank percentile (+ = beat his rank)
      const n = list.length;
      const byActual = [...list].sort((a, b) => a.actual - b.actual);
      const byEcr = [...list].sort((a, b) => b.r[2] - a.r[2]);
      for (const x of list) {
        const res = byActual.indexOf(x) / (n - 1) - byEcr.indexOf(x) / (n - 1);
        for (const [k, v] of Object.entries(x.r[5])) { const o = fx.get(k) ?? fx.set(k, { x: [], y: [] }).get(k)!; o.x.push(v); o.y.push(res); }
      }
    }
    const pc = (a: { good: number; all: number }) => (a.all ? Math.round((a.good / a.all) * 1000) / 10 : 0);
    if (wk.e.all) byWeek.push({ week: snap.week, experts: pc(wk.e), shs: pc(wk.s), sleeper: pc(wk.p) });
  }
  if (!tot.e.all) return null;
  const pc = (a: { good: number; all: number }) => Math.round((a.good / a.all) * 1000) / 10;
  const factors: AccuracyReport["factors"] = {};
  for (const [k, o] of fx) {
    const c = corr(o.x, o.y);
    // Need a few weeks and enough samples before trusting it; then 0.5×–1.5×.
    const mult = byWeek.length >= 3 && o.x.length >= 120 ? Math.max(0.5, Math.min(1.5, 1 + c * 3)) : 1;
    factors[k] = { corr: Math.round(c * 1000) / 1000, n: o.x.length, mult: Math.round(mult * 100) / 100 };
  }
  const report: AccuracyReport = { weeks: byWeek.map((w) => w.week), pairs: tot.e.all, experts: pc(tot.e), shs: pc(tot.s), sleeper: pc(tot.p), byWeek, factors };
  return report;
}

// Tuned multipliers (written by the backtest) are read synchronously by SHS AI.
const TKEY = (id: string) => `fhq-tune-${id}`;
export function getTuning(leagueId: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TKEY(leagueId)) ?? "{}") as Record<string, number>; } catch { return {}; }
}
