/**
 * SHS AI weekly model, v2: a learned stack instead of nudges on the expert rank.
 *
 * Base models (each predicts this week's fantasy points):
 *   experts       the points a player at his expert rank usually scores (the ECR curve)
 *   projection    Sleeper's weekly projection in your scoring
 *   opportunity   what his usage is worth: expected fantasy points from his targets / carries / attempts
 *                 (recent and season), his recent scoring, shrunk toward the experts when he has few games
 *   context       team implied points from the betting total and spread, and an opponent-adjusted defensive
 *                 matchup (points the defence allows to the position, judged against the offences it has faced)
 * A meta model learns, per position, how much to trust each base model, including when (few games played,
 * early weeks). A range term then nudges boom/bust players up or down if that history says it helps.
 *
 * Everything is fitted in scripts/research/stack.ts on replayed seasons, walk-forward: each season is predicted
 * by a model trained only on earlier seasons, so the reported results are out of sample. Coefficients live in
 * shsStack.json. All inputs come from data available before kickoff.
 */
import type { LeagueContext } from "./league";
import STACK from "./shsStack.json";

export const STACK_POS = ["QB", "RB", "WR", "TE"] as const;

/** Raw inputs for one player-week. */
export interface StackX {
  E: number; // expert-rank points
  P: number; // projection (E when missing)
  pMiss: number; // 1 = no projection
  xR: number; // expected fantasy pts / game, last 4 (E when missing)
  xS: number; // expected fantasy pts / game, season
  fS: number; // actual fantasy pts / game in the expected-points data, season
  xg: number; // games with expected-points data
  p3: number; // average points, last 3 games (E when none)
  g: number; // games played this season before this week
  impl: number; // team implied points vs this week's average, as a ratio − 1
  mAdj: number; // opponent-adjusted points allowed to the position, ratio − 1
  q: number; // 1 = questionable
  vol: number; // week-to-week spread of his scoring (coefficient of variation)
  early: number; // 1 = weeks 1–4
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Opponent-adjusted defence: points allowed to each position relative to what those offences usually score. */
export function adjustedDefense(ctx: Pick<LeagueContext, "stats">, week: number): Map<string, number> {
  const off = new Map<string, number>(); // team:pos:week -> pts
  const meet = new Map<string, string>(); // team:week -> opponent
  for (const s of ctx.stats) {
    if (s.week >= week || !STACK_POS.includes(s.position as (typeof STACK_POS)[number])) continue;
    const k = `${s.team}:${s.position}:${s.week}`;
    off.set(k, (off.get(k) ?? 0) + s.pprPoints);
    if (s.opp) meet.set(`${s.team}:${s.week}`, s.opp);
  }
  const avgOff = new Map<string, { sum: number; n: number }>(); // team:pos
  const league = new Map<string, { sum: number; n: number }>(); // pos
  for (const [k, v] of off) {
    const [team, pos] = k.split(":");
    const a = avgOff.get(`${team}:${pos}`) ?? { sum: 0, n: 0 }; a.sum += v; a.n++; avgOff.set(`${team}:${pos}`, a);
    const l = league.get(pos) ?? { sum: 0, n: 0 }; l.sum += v; l.n++; league.set(pos, l);
  }
  const acc = new Map<string, { got: number; exp: number; n: number }>(); // def:pos
  for (const [k, v] of off) {
    const [team, pos, wk] = k.split(":");
    const d = meet.get(`${team}:${wk}`);
    const a = avgOff.get(`${team}:${pos}`);
    if (!d || !a || a.n < 2) continue;
    const expOther = (a.sum - v) / (a.n - 1); // that offence's average in its other games
    const x = acc.get(`${d}:${pos}`) ?? { got: 0, exp: 0, n: 0 };
    x.got += v; x.exp += expOther; x.n++; acc.set(`${d}:${pos}`, x);
  }
  const out = new Map<string, number>();
  const K = 4; // shrink: worth 4 average games
  for (const [k, x] of acc) {
    const pos = k.split(":")[1];
    const l = league.get(pos);
    const L = l && l.n ? l.sum / l.n : 0;
    if (L <= 0) continue;
    out.set(k, (x.got + K * L) / (x.exp + K * L) - 1);
  }
  return out;
}

/** Team implied points (from the game total and spread) relative to the week's average, ratio − 1. */
export function impliedRatio(ctx: Pick<LeagueContext, "games">, week: number): Map<string, number> {
  const imp = new Map<string, number>();
  for (const g of ctx.games) {
    if (g.week !== week || !g.total || g.spread === null || g.spread === undefined) continue;
    imp.set(g.home, (g.total + g.spread) / 2);
    imp.set(g.away, (g.total - g.spread) / 2);
  }
  const avg = mean([...imp.values()]) || 22;
  return new Map([...imp].map(([t, v]) => [t, v / avg - 1]));
}

/** Inputs for each ranked player this week. `rows` need the expert-rank points (E) and projection. */
export function stackInputs(ctx: LeagueContext, rows: { id: string; pos: string; E: number; proj: number }[], week: number): Map<string, StackX> {
  const def = adjustedDefense(ctx, week);
  const imp = impliedRatio(ctx, week);
  const out = new Map<string, StackX>();
  for (const r of rows) {
    const p = ctx.players.get(r.id);
    if (!p || !STACK_POS.includes(r.pos as (typeof STACK_POS)[number])) continue;
    const log = (ctx.logs.get(r.id) ?? []).filter((x) => x.week < week).sort((a, b) => a.week - b.week);
    const pts = log.map((x) => x.pts);
    const last = pts.slice(-8);
    const m8 = mean(last);
    const sd = last.length >= 3 ? Math.sqrt(mean(last.map((v) => (v - m8) ** 2))) : 0;
    const xf = p.gsis ? ctx.signals.xfp.get(p.gsis) : undefined;
    const opp = p.team ? ctx.nflOpponents.get(p.team)?.get(week) : undefined;
    out.set(r.id, {
      E: r.E, P: r.proj > 0.3 ? r.proj : r.E, pMiss: r.proj > 0.3 ? 0 : 1,
      xR: xf && xf.games ? xf.recentXfp : r.E, xS: xf && xf.games ? xf.xfp : r.E, fS: xf && xf.games ? xf.fp : r.E, xg: xf?.games ?? 0,
      p3: pts.length ? mean(pts.slice(-3)) : r.E, g: log.length,
      impl: p.team ? imp.get(p.team) ?? 0 : 0,
      mAdj: opp ? def.get(`${opp}:${r.pos}`) ?? 0 : 0,
      q: p.injury === "Questionable" ? 1 : 0,
      vol: last.length >= 3 ? clamp(sd / Math.max(3, m8), 0, 2) : 0,
      early: week <= 4 ? 1 : 0,
    });
  }
  return out;
}

// ---------------- base models ----------------
/** Shrink a usage-based number toward the experts when there are few games behind it. */
const shr = (v: number, E: number, n: number, full: number) => { const a = clamp(n / full, 0, 1); return a * v + (1 - a) * E; };

export const BASE = {
  experts: (x: StackX) => [x.E],
  projection: (x: StackX) => [x.P, x.pMiss * x.E],
  opportunity: (x: StackX) => [shr(x.xR, x.E, x.xg, 4), shr(x.xS, x.E, x.xg, 6), shr(x.fS, x.E, x.xg, 6), shr(x.p3, x.E, x.g, 3), x.E],
  context: (x: StackX) => [x.E, x.E * x.impl, x.E * x.mAdj, x.E * x.q],
} as const;
export type BaseKey = keyof typeof BASE;
export const BASE_KEYS = Object.keys(BASE) as BaseKey[];

/** Meta features: each base model's prediction, plus trust terms (how much to lean on the projection early
 *  in the season and on usage when the sample is small). */
export function metaFeatures(b: Record<BaseKey, number>, x: StackX): number[] {
  const small = x.g < 3 ? 1 : 0;
  return [1, b.experts, b.projection, b.opportunity, b.context, x.early * (b.projection - b.experts), small * (b.opportunity - b.experts)];
}

export interface LinModel { w: number[] }
/**
 * base/meta predict points; `head` is the ranking head (score = expert points + head · deltas), fitted with
 * pairwise logistic regression on close calls; `use` = it beat the experts out of sample, so the app may rank with it.
 */
export interface PosStack { base: Record<BaseKey, LinModel>; meta: LinModel; range: number; head?: number[]; use?: boolean }
export interface StackJson { version: number; trainedOn: string; projSource: string; model: Partial<Record<string, PosStack>>; report?: unknown }

export const dot = (w: number[], f: number[]) => f.reduce((a, v, i) => a + v * (w[i] ?? 0), 0);
/** Base features always get an intercept. */
export const withBias = (f: number[]) => [1, ...f];

export function basePreds(m: PosStack, x: StackX): Record<BaseKey, number> {
  const o = {} as Record<BaseKey, number>;
  for (const k of BASE_KEYS) o[k] = dot(m.base[k].w, withBias(BASE[k](x)));
  return o;
}

/** What the ranking head sees: how far each base model (and the range) sits from the expert-rank points. */
export const deltas = (b: Record<BaseKey, number>, x: StackX) => [
  b.projection - x.E, b.opportunity - x.E, b.context - x.E, x.early * (b.projection - x.E), (x.g < 3 ? 1 : 0) * (b.opportunity - x.E), x.E * x.vol,
];

/** Points predicted for this week, and the ranking score (ranking head when fitted, else the prediction nudged by range). */
export function stackPredict(m: PosStack, x: StackX) {
  const b = basePreds(m, x);
  const pts = Math.max(0, dot(m.meta.w, metaFeatures(b, x)));
  const score = m.head ? x.E + dot(m.head, deltas(b, x)) : pts * (1 + m.range * x.vol);
  return { pts, score, base: b };
}

const J = STACK as unknown as StackJson;
export const stackModel = (pos: string): PosStack | null => J.model?.[pos] ?? null;
export const stackInfo = () => ({ trainedOn: J.trainedOn, projSource: J.projSource, report: J.report ?? null });
