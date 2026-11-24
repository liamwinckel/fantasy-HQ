/**
 * Floor / ceiling: each player's week as a range, not one number.
 * Shape: a gamma distribution (never negative, long right tail like real fantasy scores) with
 *   mean = the weekly projection, spread = his own week-to-week variation (shrunk toward his position),
 *   blended 50/50 with the spread the betting-market ladders imply when he has lines.
 * Floor = 10th percentile (1 week in 10 is worse), ceiling = 90th (1 in 10 is better).
 */
import type { LeagueContext } from "../services/league";
import { projectionFor } from "../services/views";
import { marketMeans, type MarketLine } from "../markets";

export interface Dist { mean: number; sd: number; floor: number; ceiling: number; boom: number; bust: number; boomLine: number; bustLine: number; market: boolean }

const BOOM: Record<string, [number, number]> = { QB: [25, 12], RB: [20, 7], WR: [20, 7], TE: [15, 5], K: [12, 5], DEF: [12, 3] };
const POS_CV: Record<string, number> = { QB: 0.38, RB: 0.55, WR: 0.6, TE: 0.65, K: 0.45, DEF: 0.7 };

const erf = (x: number) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
const Z: Record<number, number> = { 0.1: -1.2816, 0.25: -0.6745, 0.5: 0, 0.75: 0.6745, 0.9: 1.2816 };

/** Gamma quantile / CDF via the Wilson–Hilferty cube-root approximation. */
export function gammaQ(mean: number, sd: number, p: number) {
  if (mean <= 0) return 0;
  if (sd <= 0) return mean;
  const k = (mean / sd) ** 2, th = sd * sd / mean, c = 1 / (9 * k);
  const z = Z[p] ?? 0;
  return Math.max(0, k * th * (1 - c + z * Math.sqrt(c)) ** 3);
}
export function gammaSf(mean: number, sd: number, x: number) {
  if (mean <= 0) return x <= 0 ? 1 : 0;
  if (sd <= 0) return x <= mean ? 1 : 0;
  const k = (mean / sd) ** 2, th = sd * sd / mean, c = 1 / (9 * k);
  const z = (Math.cbrt(Math.max(0, x) / (k * th)) - (1 - c)) / Math.sqrt(c);
  return 1 - normCdf(z);
}

/** Spread of fantasy points implied by a player's market ladders (rough: independent stats). */
export function marketSd(lines: MarketLine[], scoring: Record<string, number>): number | null {
  const m = marketMeans(lines);
  const CV: Record<string, [number, number, string]> = { pass_yd: [0.28, 25, "pass_yd"], rush_yd: [0.5, 8, "rush_yd"], rec_yd: [0.6, 8, "rec_yd"], rr_yd: [0.45, 10, "rec_yd"], rec: [0.45, 1, "rec"] };
  let v = 0, any = false;
  for (const [k, mu] of Object.entries(m)) {
    if (mu === undefined) continue;
    if (CV[k]) { const [cv, fl, sk] = CV[k]; v += ((cv * mu + fl) * (scoring[sk] ?? 0)) ** 2; any = true; }
    else if (k === "td" || k === "rush_td" || k === "rec_td") { v += (Math.sqrt(mu) * (scoring.rec_td ?? scoring.rush_td ?? 6)) ** 2; any = true; }
    else if (k === "pass_td") { v += (Math.sqrt(mu) * (scoring.pass_td ?? 4)) ** 2; any = true; }
  }
  return any ? Math.sqrt(v) * 1.15 : null; // yards and TDs move together, so a bit wider than independent
}

export function playerDist(ctx: LeagueContext, pid: string, week: number): Dist {
  const p = ctx.players.get(pid);
  const pos = p?.pos ?? "WR";
  const pj = projectionFor(ctx, pid, week);
  const mean = Math.max(0, pj.median);
  // projectionFor's low/high are the 20th/80th percentiles of his own history → sd
  const hist = pj.high > pj.low ? (pj.high - pj.low) / 1.683 : mean * (POS_CV[pos] ?? 0.55);
  let sd = 0.6 * hist + 0.4 * mean * (POS_CV[pos] ?? 0.55); // shrink toward his position's typical spread
  let market = false;
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const mk = week === w0 ? ctx.signals.markets?.players[pid] : undefined;
  if (mk) {
    const ms = marketSd(mk.lines, ctx.league.scoring_settings as Record<string, number>);
    if (ms) { sd = 0.5 * sd + 0.5 * ms; market = true; }
  }
  sd = Math.max(sd, mean * 0.2, mean > 0 ? 0.8 : 0);
  const [boomLine, bustLine] = BOOM[pos] ?? [20, 7];
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    mean: r1(mean), sd: r1(sd), floor: r1(gammaQ(mean, sd, 0.1)), ceiling: r1(gammaQ(mean, sd, 0.9)),
    boom: Math.round(gammaSf(mean, sd, boomLine) * 100), bust: Math.round((1 - gammaSf(mean, sd, bustLine)) * 100), boomLine, bustLine, market,
  };
}

// ---------------- Monte Carlo matchup simulator ----------------
export interface SimPlayer { id: string; team: string | null; mean: number; sd: number; fixed?: number | null }
export interface SimSide { mean: number; p10: number; p25: number; p50: number; p75: number; p90: number }
export interface MatchupSim { winProb: number; mine: SimSide; opp: SimSide; hist: { lo: number; step: number; mine: number[]; opp: number[] }; margin: SimSide; n: number; myScores: Float64Array; oppScores: Float64Array }

function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normal(r: () => number) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
/** Marsaglia–Tsang gamma(k, 1). */
function gamma(k: number, r: () => number): number {
  if (k < 1) return gamma(k + 1, r) * Math.pow(r() || 1e-9, 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(r); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Plays the matchup out `n` times. Players on the same NFL team share a "game went well / badly" factor, so a QB
 * and his receivers rise and fall together. Locked players (game finished) count their actual points.
 */
export function simulateMatchup(mine: SimPlayer[], opp: SimPlayer[], n = 10000, seed = 7): MatchupSim {
  const r = rng(seed);
  const teams = [...new Set([...mine, ...opp].map((p) => p.team).filter(Boolean))] as string[];
  const tIdx = new Map(teams.map((t, i) => [t, i]));
  const shape = (p: SimPlayer) => (p.mean > 0 && p.sd > 0 ? { k: (p.mean / p.sd) ** 2, th: (p.sd * p.sd) / p.mean } : null);
  const ms = mine.map(shape), os = opp.map(shape);
  const my = new Float64Array(n), op = new Float64Array(n);
  const tf = new Float64Array(teams.length);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < tf.length; t++) tf[t] = Math.exp(0.22 * normal(r) - 0.0242);
    const draw = (p: SimPlayer, s: { k: number; th: number } | null) => {
      if (p.fixed !== undefined && p.fixed !== null) return p.fixed;
      if (!s) return 0;
      return gamma(s.k, r) * s.th * (p.team ? tf[tIdx.get(p.team)!] : 1);
    };
    let a = 0, b = 0;
    for (let j = 0; j < mine.length; j++) a += draw(mine[j], ms[j]);
    for (let j = 0; j < opp.length; j++) b += draw(opp[j], os[j]);
    my[i] = a; op[i] = b;
    if (a > b) wins++; else if (a === b) wins += 0.5;
  }
  const side = (x: Float64Array): SimSide => {
    const s = Float64Array.from(x).sort();
    const q = (p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10;
    return { mean: Math.round((x.reduce((a, b) => a + b, 0) / x.length) * 10) / 10, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) };
  };
  const margin = new Float64Array(n);
  for (let i = 0; i < n; i++) margin[i] = my[i] - op[i];
  const all = [...my, ...op];
  const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5;
  const step = Math.max(2.5, Math.ceil((hi - lo) / 30 / 2.5) * 2.5);
  const bins = Math.ceil((hi - lo) / step) + 1;
  const hm = new Array(bins).fill(0), ho = new Array(bins).fill(0);
  for (let i = 0; i < n; i++) { hm[Math.floor((my[i] - lo) / step)]++; ho[Math.floor((op[i] - lo) / step)]++; }
  return { winProb: Math.round((wins / n) * 1000) / 10, mine: side(my), opp: side(op), margin: side(margin), hist: { lo, step, mine: hm.map((c) => c / n), opp: ho.map((c) => c / n) }, n, myScores: my, oppScores: op };
}

/**
 * Lineup that maximises your chance of winning (not just projected points): tries every legal swap with the bench,
 * keeps the best, repeats. Same random numbers for every candidate, so differences are real, not noise.
 */
export function bestWinLineup(
  lineup: (string | null)[], bench: string[], eligible: (id: string, slot: number) => boolean, locked: (id: string) => boolean,
  toSim: (id: string) => SimPlayer, opp: SimPlayer[], n = 3000,
): { lineup: (string | null)[]; winProb: number; base: number; moves: { slot: number; out: string | null; in: string; gain: number }[] } {
  const win = (l: (string | null)[]) => simulateMatchup(l.filter(Boolean).map((id) => toSim(id!)), opp, n, 11).winProb;
  let cur = [...lineup];
  const base = win(cur);
  let best = base;
  const moves: { slot: number; out: string | null; in: string; gain: number }[] = [];
  for (let step = 0; step < 4; step++) {
    let pick: { l: (string | null)[]; wp: number; slot: number; out: string | null; in: string } | null = null;
    const pool = bench.filter((b) => !cur.includes(b) && !locked(b));
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] && locked(cur[i]!)) continue;
      for (const b of pool) {
        if (!eligible(b, i)) continue;
        const l = [...cur]; l[i] = b;
        const wp = win(l);
        if (wp > (pick?.wp ?? best) + 0.3) pick = { l, wp, slot: i, out: cur[i], in: b };
      }
    }
    if (!pick) break;
    moves.push({ slot: pick.slot, out: pick.out, in: pick.in, gain: Math.round((pick.wp - best) * 10) / 10 });
    cur = pick.l; best = pick.wp;
  }
  return { lineup: cur, winProb: best, base, moves };
}
