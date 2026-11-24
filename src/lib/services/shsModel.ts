/**
 * The SHS formula, learned from replayed seasons (scripts/research):
 *
 *   SHS value = expert-rank value × (1 + γ·gap + Σ βₖ·fₖ)
 *
 *   gap = how far the second opinion (Sleeper's projection) sits from the expert-rank value, −1…+1
 *   fₖ  = each SHS factor, −1…+1
 *   γ, β are fitted separately for each ranking type (week / rest of season / dynasty) and position, and only where
 *   they beat the experts out of sample. Everything else gets 0: tracked and shown, but it doesn't move the number.
 * This week, for players with betting lines, the result is blended with the points the lines imply.
 */
import WEEK from "./shsResearch.json";
import LONG from "./shsResearchLong.json";
import type { RankScope } from "./rankings";
import type { ShsWeights } from "../settings";

export interface PosCoef { gamma: number; beta: Record<string, number> }
type WeekJson = { model?: Record<string, { gamma: number; beta: Record<string, number> }> };
type LongJson = Record<"ros" | "dynasty", { model: Record<string, { beta: Record<string, number> }> }>;

const W = WEEK as unknown as WeekJson;
const L = LONG as unknown as LongJson;

export function coefFor(scope: RankScope, pos: string): PosCoef {
  if (scope === "week") { const m = W.model?.[pos]; return { gamma: m?.gamma ?? 0, beta: m?.beta ?? {} }; }
  const m = L[scope]?.model?.[pos];
  return { gamma: 0, beta: m?.beta ?? {} };
}
/** Factors with a proven edge somewhere, by scope (for labels like "weighted" vs "tracked"). */
export const provenKeys = (scope: RankScope, pos: string) => {
  const c = coefFor(scope, pos);
  return new Set([...Object.keys(c.beta).filter((k) => c.beta[k] !== 0), ...(c.gamma ? ["gap"] : [])]);
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** Largest move the formula makes on its own (before betting lines). */
export const MAX_TILT = 0.35;

export interface ShsCalc {
  rating: number;
  /** Each part's effect on the value, as a share of the expert-rank value (+0.05 = +5%). */
  parts: { key: string; effect: number }[];
  /** Share of the final value taken from betting lines (0 when none). */
  lineShare: number;
}

/**
 * The research formula. `factors` are the computed SHS factors; `mult` multiplies each β (your Settings weights ×
 * auto-tuning). `second` = Sleeper's projection (week/ROS) — its pull is γ; `market` = points the lines imply.
 */
export function shsFormula(scope: RankScope, pos: string, ecrRating: number, second: number | null, factors: { key: string; value: number }[], market: number | null, cfg: Pick<ShsWeights, "lines">, mult: (k: string) => number = () => 1): ShsCalc {
  const c = coefFor(scope, pos);
  const parts: ShsCalc["parts"] = [];
  if (c.gamma && second !== null && ecrRating > 0.5) parts.push({ key: "gap", effect: c.gamma * clamp(second / ecrRating - 1, -1, 1) * mult("gap") });
  for (const f of factors) { const b = c.beta[f.key]; if (b) parts.push({ key: f.key, effect: b * f.value * mult(f.key) }); }
  const tilt = clamp(parts.reduce((a, p) => a + p.effect, 0), -MAX_TILT, MAX_TILT);
  let rating = ecrRating * (1 + tilt);
  const lineShare = scope === "week" && market !== null ? clamp(cfg.lines, 0, 60) / 100 : 0;
  if (lineShare) {
    parts.push({ key: "lines", effect: lineShare * (market! / Math.max(0.5, ecrRating) - 1 - tilt) });
    rating = (1 - lineShare) * rating + lineShare * market!;
  }
  return { rating, parts, lineShare };
}
