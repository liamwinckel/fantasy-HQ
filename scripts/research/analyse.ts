/**
 * Learns the weekly SHS AI formula from the replayed dataset (see shs-history.ts), separately for each position.
 *
 *   SHS points = expert-rank points × (1 + γ·gap + Σ βₖ·fₖ)
 *     gap = how far the projection (Sleeper) sits from the expert-rank points (−1…+1)
 *     fₖ  = each SHS factor's value (−1…+1)
 *
 * γ and β are fitted with pairwise logistic regression (which of two players at the same position, the same week,
 * scores more), trained on near-rank pairs (the start/sit decisions that matter). A factor is kept only when adding
 * it raises "picks right" out of sample (leave one season out) and helps in all but at most two seasons; the kept
 * coefficients are then shrunk 25% toward zero. Factors that don't earn a place get β = 0 and are shown as
 * "tracked, no proven edge".
 */
import fs from "node:fs";
import path from "node:path";
import type { Row } from "./shs-history";

const SHRINK = 0.75;
const NEAR = 12; // train on each player vs the 12 ranked just below him
const LAMBDA = 20;
const MIN_GAIN = 0.03; // points of "picks right"

type Pair = [number, number]; // winner, loser
export type PosModel = { gamma: number; beta: Record<string, number>; gain: number; seasons: Record<number, number> };

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const gapOf = (r: { proj: number; ecrPts: number }) => (r.ecrPts > 0.5 && r.proj > 0.3 ? clamp(r.proj / r.ecrPts - 1) : 0);
const val = (r: Row, k: string) => (k === "gap" ? gapOf(r) : r.f[k]?.[0] ?? 0);

function groups(rows: Row[]) {
  const g = new Map<string, number[]>();
  rows.forEach((r, i) => { const k = `${r.season}:${r.week}:${r.pos}`; (g.get(k) ?? g.set(k, []).get(k)!).push(i); });
  return [...g.values()];
}
function allPairs(rows: Row[]): Pair[] {
  const out: Pair[] = [];
  for (const idx of groups(rows)) for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    const i = idx[a], j = idx[b];
    if (rows[i].actual !== rows[j].actual) out.push(rows[i].actual > rows[j].actual ? [i, j] : [j, i]);
  }
  return out;
}
function nearPairs(rows: Row[]): Pair[] {
  const out: Pair[] = [];
  for (const idx0 of groups(rows)) {
    const idx = [...idx0].sort((a, b) => rows[b].ecrPts - rows[a].ecrPts);
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < Math.min(idx.length, a + 1 + NEAR); b++) {
      const i = idx[a], j = idx[b];
      if (rows[i].actual !== rows[j].actual) out.push(rows[i].actual > rows[j].actual ? [i, j] : [j, i]);
    }
  }
  return out;
}
function acc(s: ArrayLike<number>, pairs: Pair[]) {
  let good = 0, all = 0;
  for (const [w, l] of pairs) { if (s[w] === s[l]) continue; all++; if (s[w] > s[l]) good++; }
  return all ? (100 * good) / all : 0;
}

/** Feature matrix: [ecrPts, ecrPts·x₁, ecrPts·x₂, …]. */
function feats(rows: Row[], keys: string[]) {
  return rows.map((r) => [r.ecrPts, ...keys.map((k) => r.ecrPts * val(r, k))]);
}
function solve(A: number[][], b: number[]) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / (M[i][i] || 1e-12));
}
/** Pairwise logistic regression (Newton steps, ridge). Returns coefficients normalised so the expert term = 1. */
function fitLogit(rows: Row[], keys: string[]) {
  const X = feats(rows, keys), P = nearPairs(rows), k = keys.length + 1;
  let sd = 0; for (const [w, l] of P) sd += (X[w][0] - X[l][0]) ** 2; sd = Math.sqrt(sd / Math.max(1, P.length)) || 1;
  let beta = new Array(k).fill(0); beta[0] = 1;
  for (let it = 0; it < 8; it++) {
    const g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const [w, l] of P) {
      const d = X[w].map((x, i) => (x - X[l][i]) / sd);
      let z = 0; for (let i = 0; i < k; i++) z += d[i] * beta[i];
      const p = 1 / (1 + Math.exp(-z)), q = p * (1 - p);
      for (let i = 0; i < k; i++) { g[i] += (1 - p) * d[i]; for (let j = 0; j <= i; j++) H[i][j] += q * d[i] * d[j]; }
    }
    for (let i = 0; i < k; i++) { g[i] -= LAMBDA * beta[i]; H[i][i] += LAMBDA; for (let j = 0; j < i; j++) H[j][i] = H[i][j]; }
    const step = solve(H, g);
    beta = beta.map((b, i) => b + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  const b0 = beta[0] || 1;
  return Object.fromEntries(keys.map((key, i) => [key, beta[i + 1] / b0])) as Record<string, number>;
}
const score = (rows: Row[], coef: Record<string, number>) =>
  Float64Array.from(rows.map((r) => r.ecrPts * (1 + Object.entries(coef).reduce((a, [k, c]) => a + c * val(r, k), 0))));

/** Leave-one-season-out gain (points of picks right) over the experts for a set of keys. */
function cv(rows: Row[], keys: string[], seasons: number[], test: Map<number, { rows: Row[]; pairs: Pair[]; ecr: number }>, shrink = 1) {
  const per: Record<number, number> = {};
  for (const s of seasons) {
    const t = test.get(s)!;
    if (!t.pairs.length) continue;
    const c = keys.length ? fitLogit(rows.filter((r) => r.season !== s), keys) : {};
    for (const k in c) c[k] *= shrink;
    per[s] = acc(score(t.rows, c), t.pairs) - t.ecr;
  }
  const v = Object.values(per);
  return { mean: v.reduce((a, b) => a + b, 0) / Math.max(1, v.length), per };
}

export function analyse(rows: Row[], projSource: string) {
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  const positions = ["QB", "RB", "WR", "TE"];
  const model: Record<string, PosModel> = {};
  const factorRows: { key: string; byPos: Record<string, number | null>; kept: string[] }[] = [];
  const allKeys = ["gap", ...new Set(rows.flatMap((r) => Object.keys(r.f)))].filter((k) => k !== "proj");
  const single: Record<string, Record<string, number | null>> = {};
  const oos: Record<string, Float64Array> = {}; // out-of-sample SHS scores per row index, per position
  for (const pos of positions) {
    const R = rows.filter((r) => r.pos === pos);
    const test = new Map(seasons.map((s) => { const t = R.filter((r) => r.season === s), p = allPairs(t); return [s, { rows: t, pairs: p, ecr: acc(Float64Array.from(t.map((r) => r.ecrPts)), p) }]; }));
    const keys = allKeys.filter((k) => k === "gap" || R.some((r) => r.f[k]));
    for (const k of keys) (single[k] ??= {})[pos] = r2(cv(R, [k], seasons, test).mean);
    const sel: string[] = [];
    let best = 0;
    for (;;) {
      let top: { k: string; mean: number; per: Record<number, number> } | null = null;
      for (const k of keys) if (!sel.includes(k)) { const c = cv(R, [...sel, k], seasons, test); if (!top || c.mean > top.mean) top = { k, ...c }; }
      if (!top) break;
      const v = Object.values(top.per);
      if (top.mean > best + MIN_GAIN && v.filter((x) => x > 0).length >= v.length - 2) { sel.push(top.k); best = top.mean; } else break;
    }
    let final = sel.length ? cv(R, sel, seasons, test, SHRINK) : { mean: 0, per: Object.fromEntries(seasons.map((s) => [s, 0])) as Record<number, number> };
    // After shrinking, the kept factors must still beat the experts out of sample, or the position stays on the experts.
    if (final.mean <= 0) { sel.length = 0; final = { mean: 0, per: Object.fromEntries(seasons.map((s) => [s, 0])) }; }
    const coef = sel.length ? fitLogit(R, sel) : {};
    const beta: Record<string, number> = {};
    for (const k of sel) if (k !== "gap") beta[k] = r3(coef[k] * SHRINK);
    model[pos] = { gamma: r3((coef.gap ?? 0) * SHRINK), beta, gain: r2(final.mean), seasons: Object.fromEntries(Object.entries(final.per).map(([s, v]) => [s, r2(v)])) };
    // Out-of-sample scores for the season table.
    const arr = new Float64Array(R.length);
    const idxOf = new Map(R.map((r, i) => [r, i]));
    for (const s of seasons) {
      const c = sel.length ? fitLogit(R.filter((r) => r.season !== s), sel) : {};
      for (const k in c) c[k] *= SHRINK;
      const t = test.get(s)!, sc = score(t.rows, c);
      t.rows.forEach((r, i) => (arr[idxOf.get(r)!] = sc[i]));
    }
    oos[pos] = arr;
    console.log(pos, JSON.stringify(model[pos]));
  }
  for (const k of allKeys) factorRows.push({ key: k, byPos: single[k] ?? {}, kept: positions.filter((p) => k === "gap" ? model[p].gamma !== 0 : (model[p].beta[k] ?? 0) !== 0) });

  // Season-by-season grades (all positions pooled the same way the app grades: pairs within position-week).
  const shsScore = new Map<Row, number>();
  for (const pos of positions) rows.filter((r) => r.pos === pos).forEach((r, i) => shsScore.set(r, oos[pos][i]));
  const factorIndex = (r: Row) => { let n = 0, d = 0; for (const k in r.f) { if (k === "proj") continue; const [v, w] = r.f[k]; n += v * w; d += w; } return d ? n / d : 0; };
  const perSeason = seasons.map((season) => {
    const t = rows.filter((r) => r.season === season), p = allPairs(t);
    const g = (f: (r: Row) => number) => r1(acc(Float64Array.from(t.map(f)), p));
    return {
      season, weeks: new Set(t.map((r) => r.week)).size, players: t.length,
      experts: g((r) => r.ecrPts), projection: g((r) => r.proj), ecrSleeper: g((r) => 0.5 * r.ecrPts + 0.5 * r.proj),
      mix: g((r) => 0.25 * r.ecrPts + 0.25 * r.proj + 0.5 * r.ecrPts * (1 + factorIndex(r))),
      shs: g((r) => shsScore.get(r)!),
    };
  });
  const avg = (k: "experts" | "projection" | "ecrSleeper" | "mix" | "shs") => r1(perSeason.reduce((a, s) => a + s[k], 0) / perSeason.length);
  const summary = { experts: avg("experts"), projection: avg("projection"), ecrSleeper: avg("ecrSleeper"), mix: avg("mix"), shs: avg("shs") };
  // How often SHS AI's disagreements with the experts were right (pairs it flipped vs the expert order).
  let flipped = 0, flippedRight = 0;
  for (const s of seasons) { const t = rows.filter((r) => r.season === s); for (const [a, b] of allPairs(t)) {
    const w = t[a], l = t[b];
    const ew = w.ecrPts, el = l.ecrPts, sw = shsScore.get(w)!, sl = shsScore.get(l)!;
    if (ew === el || sw === sl || (ew > el) === (sw > sl)) continue;
    flipped++; if (sw > sl) flippedRight++;
  } }
  const out = {
    generatedAt: new Date().toISOString(), projSource, seasons, rows: rows.length, weeks: perSeason.reduce((a, s) => a + s.weeks, 0),
    method: "pairwise logistic, leave-one-season-out, forward selection, 25% shrink",
    model, summary, perSeason, factors: factorRows,
    calls: { flipped, right: flipped ? r1((100 * flippedRight) / flipped) : null },
  };
  fs.writeFileSync(path.join(process.cwd(), "src/lib/services/shsResearch.json"), JSON.stringify(out, null, 1));
  fs.mkdirSync(path.join(process.cwd(), "docs"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "docs/shs-research.md"), report(out));
  console.log(JSON.stringify({ summary, calls: out.calls }, null, 1));
}

function report(o: { generatedAt: string; projSource: string; seasons: number[]; rows: number; weeks: number; model: Record<string, PosModel>; summary: Record<string, number>; perSeason: Record<string, number>[]; factors: { key: string; byPos: Record<string, number | null>; kept: string[] }[]; calls: { flipped: number; right: number | null } }) {
  const L: string[] = [];
  const long = (() => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/services/shsResearchLong.json"), "utf8")); } catch { return null; } })();
  L.push(`# SHS AI research (${o.seasons[0]}–${o.seasons.at(-1)})`, "", `Generated ${o.generatedAt.slice(0, 10)} · ${o.weeks} weeks · ${o.rows.toLocaleString()} player-weeks · projection source: ${o.projSource}.`, "");
  L.push("## Weekly", "", "Every week was replayed with only what was known before Sunday's first kickoff. *Picks right* = for every pair of players at the same position in the same week, how often the one ranked higher outscored the other (PPR). The SHS column is out of sample: fitted on the other seasons, graded on that one.", "");
  L.push("| Season | Weeks | Experts | Projection | 50/50 | Old mix 25/25/50 | **SHS formula** |", "|---|---|---|---|---|---|---|");
  for (const s of o.perSeason) L.push(`| ${s.season} | ${s.weeks} | ${s.experts}% | ${s.projection}% | ${s.ecrSleeper}% | ${s.mix}% | **${s.shs}%** |`);
  L.push(`| **Average** | | ${o.summary.experts}% | ${o.summary.projection}% | ${o.summary.ecrSleeper}% | ${o.summary.mix}% | **${o.summary.shs}%** |`, "");
  if (o.calls.flipped) L.push(`When SHS AI disagreed with the experts on which of two players would score more, it was right ${o.calls.right}% of the time (${o.calls.flipped.toLocaleString()} pairs).`, "");
  L.push("### Weekly formula by position", "", "| Pos | Projection pull γ | Factors kept (β) | Out-of-sample gain |", "|---|---|---|---|");
  for (const [p, m] of Object.entries(o.model)) L.push(`| ${p} | ${m.gamma} | ${Object.entries(m.beta).map(([k, v]) => `${k} ${v}`).join(", ") || "none"} | ${m.gain >= 0 ? "+" : ""}${m.gain} |`);
  L.push("", "### Each factor alone (gain in picks right vs experts, out of sample)", "", "| Factor | QB | RB | WR | TE | Kept for |", "|---|---|---|---|---|---|");
  for (const f of o.factors) L.push(`| ${f.key} | ${["QB", "RB", "WR", "TE"].map((p) => f.byPos[p] ?? "—").join(" | ")} | ${f.kept.join(", ") || "—"} |`);
  if (long) {
    for (const scope of ["ros", "dynasty"] as const) {
      L.push("", `## ${scope === "ros" ? "Rest of season" : "Dynasty"}`, "", long[scope].note, "", "| Pos | Experts | SHS gain | Factors kept (β) | Each factor alone |", "|---|---|---|---|---|");
      for (const [p, m] of Object.entries(long[scope].model as Record<string, { experts: number; gain: number; beta: Record<string, number>; single: Record<string, number> }>))
        L.push(`| ${p} | ${m.experts}% | ${m.gain >= 0 ? "+" : ""}${m.gain} | ${Object.entries(m.beta).map(([k, v]) => `${k} ${v}`).join(", ") || "none"} | ${Object.entries(m.single).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(", ")} |`);
    }
  }
  return L.join("\n") + "\n";
}

// Re-run the analysis on a saved dataset: npx tsx scripts/research/analyse.ts
if (process.argv[1]?.endsWith("analyse.ts")) {
  const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache/research/dataset.json"), "utf8"));
  analyse(d.rows, d.projSource);
}
