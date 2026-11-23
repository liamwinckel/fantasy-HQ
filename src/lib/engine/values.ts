/**
 * Two genuinely separate valuation models, both on a 0–100 scale within a league
 * (100 = the most valuable asset in that league under that model).
 *
 * REDRAFT: rest-of-season points above replacement.
 *   Σ over remaining weeks (incl. fantasy playoffs) of max(0, weekly projection − replacement level),
 *   with playoff weeks weighted ×1.4. Age is ignored.
 *
 * DYNASTY: five-season surplus value.
 *   Healthy points-per-game surplus over replacement, projected over the next five seasons along a position-specific
 *   age curve, discounted 15% per year. Young players with thin samples are blended with a draft-capital prior.
 *   Split into "now" (this season) and "future" (years 2–5) so team strategy can weight them differently.
 */

import type { PlayerLite, Projection } from "./projections";

export type ValueMode = "redraft" | "dynasty";

export interface PlayerValue {
  id: string;
  redraft: number;
  dynasty: number;
  dynastyNow: number; // share of dynasty value from this season
  dynastyFuture: number; // share from seasons 2–5
  rosVorp: number; // redraft: rest-of-season points above replacement
  posRankRedraft: number;
  posRankDynasty: number;
}

// Multiplier vs peak production at a given age.
const AGE_CURVES: Record<string, [number, number][]> = {
  // [age, multiplier]; ages between points are interpolated
  QB: [[21, 0.8], [24, 0.95], [27, 1], [33, 1], [34, 0.9], [35, 0.8], [36, 0.7], [37, 0.55], [39, 0.35]],
  RB: [[21, 0.9], [22, 1], [25, 1], [26, 0.93], [27, 0.85], [28, 0.72], [29, 0.6], [30, 0.45], [32, 0.25]],
  WR: [[21, 0.8], [22, 0.86], [23, 0.93], [24, 1], [28, 1], [29, 0.93], [30, 0.85], [31, 0.74], [32, 0.6], [34, 0.4]],
  TE: [[21, 0.65], [22, 0.72], [23, 0.82], [24, 0.92], [25, 1], [29, 1], [30, 0.92], [31, 0.82], [32, 0.7], [34, 0.5]],
  K: [[21, 0.9], [40, 0.9]],
  DEF: [[0, 0.9], [99, 0.9]],
  DL: [[21, 0.85], [24, 1], [29, 1], [31, 0.85], [33, 0.65]],
  LB: [[21, 0.85], [24, 1], [29, 1], [31, 0.85], [33, 0.65]],
  DB: [[21, 0.85], [24, 1], [29, 1], [31, 0.85], [33, 0.65]],
};

export function ageMultiplier(pos: string, age: number | null): number {
  const curve = AGE_CURVES[pos] ?? AGE_CURVES.WR;
  if (age === null || pos === "DEF") return curve[0][1];
  if (age <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [a1, m1] = curve[i];
    const [a0, m0] = curve[i - 1];
    if (age <= a1) return m0 + ((m1 - m0) * (age - a0)) / (a1 - a0);
  }
  return curve[curve.length - 1][1];
}

export interface ValueInputs {
  players: PlayerLite[];
  projections: Map<string, Projection>;
  replacement: Record<string, number>; // points per game at replacement level, by position
  currentWeek: number;
  playoffStart: number;
  lastWeek: number;
  seasonComplete?: boolean;
  /** Dynasty-only multipliers per player (durability × contract security). */
  dynastyAdjust?: Map<string, number>;
}

const YEARS = 5;
const DISCOUNT = 0.85;
const GAMES_PER_SEASON = 17;

export function computeValues(inp: ValueInputs): Map<string, PlayerValue> {
  const { players, projections, replacement, currentWeek, playoffStart, lastWeek } = inp;
  const raw = new Map<string, { ros: number; dynNow: number; dynFut: number }>();

  for (const p of players) {
    const proj = projections.get(p.id);
    if (!proj) continue;
    const repl = replacement[p.pos] ?? 0;
    // Redraft: rest of season
    let ros = 0;
    for (let w = currentWeek; w <= lastWeek; w++) {
      const pts = proj.byWeek[w] ?? 0;
      ros += Math.max(0, pts - repl) * (w >= playoffStart ? 1.4 : 1);
    }
    // Dynasty: multi-season surplus from healthy base
    const ltInjury = proj.availability === 0 && ["IR", "PUP", "NFI"].includes(p.injury ?? "") ? 0.85 : 1;
    const surplus0 = Math.max(0, proj.base - repl * 0.9) * ltInjury * (inp.dynastyAdjust?.get(p.id) ?? 1);
    const age = p.age;
    const m0 = ageMultiplier(p.pos, age);
    let now = 0;
    let fut = 0;
    for (let y = 0; y < YEARS; y++) {
      const my = ageMultiplier(p.pos, age === null ? null : age + y);
      const s = surplus0 * (m0 > 0 ? my / m0 : 1) * DISCOUNT ** y * GAMES_PER_SEASON;
      if (y === 0) now += s;
      else fut += s;
    }
    raw.set(p.id, { ros, dynNow: now, dynFut: fut });
  }

  const maxRos = Math.max(1e-9, ...[...raw.values()].map((r) => r.ros));
  const maxDyn = Math.max(1e-9, ...[...raw.values()].map((r) => r.dynNow + r.dynFut));
  const out = new Map<string, PlayerValue>();
  for (const [id, r] of raw) {
    const dyn = r.dynNow + r.dynFut;
    out.set(id, {
      id,
      redraft: round1((100 * r.ros) / maxRos),
      dynasty: round1((100 * dyn) / maxDyn),
      dynastyNow: round1((100 * r.dynNow) / maxDyn),
      dynastyFuture: round1((100 * r.dynFut) / maxDyn),
      rosVorp: round1(r.ros),
      posRankRedraft: 0,
      posRankDynasty: 0,
    });
  }
  // Positional ranks
  const byPos = new Map<string, PlayerValue[]>();
  for (const p of players) {
    const v = out.get(p.id);
    if (!v) continue;
    const arr = byPos.get(p.pos) ?? [];
    arr.push(v);
    byPos.set(p.pos, arr);
  }
  for (const arr of byPos.values()) {
    [...arr].sort((a, b) => b.redraft - a.redraft).forEach((v, i) => (v.posRankRedraft = i + 1));
    [...arr].sort((a, b) => b.dynasty - a.dynasty).forEach((v, i) => (v.posRankDynasty = i + 1));
  }
  return out;
}

/**
 * Replacement level per position: the projected points per game of the first player outside the
 * league's starting demand (teams × starters at that position, with flex slots split by share).
 */
export function replacementLevels(
  basesByPos: Map<string, number[]>,
  demand: Record<string, number>,
  teams: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [pos, bases] of basesByPos) {
    const sorted = [...bases].sort((a, b) => b - a);
    const n = Math.round((demand[pos] ?? 0) * teams);
    if (n === 0) {
      out[pos] = sorted[0] ?? 0; // position not started in this league: no surplus
      continue;
    }
    out[pos] = sorted[Math.min(n, sorted.length - 1)] ?? 0;
  }
  return out;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
