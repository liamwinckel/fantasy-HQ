/**
 * Grades and fits SHS AI on the replayed dataset (see shs-history.ts).
 * Model (same as the app): SHS points = expert-rank points × (1 + (1 − expert share) × F),
 *   F = Σ value·weight·mult / Σ weight·mult over the player's factors.
 * Fit = coordinate search over each factor's multiplier (0–3×) and the expert share, maximising
 * "picks right" (pairwise ordering accuracy at each position, each week).
 */
import fs from "node:fs";
import path from "node:path";
import type { Row } from "./shs-history";

type Pair = [number, number]; // indices: winner, loser
const MULTS = [-1, -0.5, 0, 0.5, 1, 1.5, 2, 3];
const EXPERTS = [30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 97.5, 100];
const BLENDS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];

function groups(rows: Row[]) {
  const g = new Map<string, number[]>();
  rows.forEach((r, i) => { const k = `${r.season}:${r.week}:${r.pos}`; (g.get(k) ?? g.set(k, []).get(k)!).push(i); });
  return g;
}
function pairsOf(rows: Row[]): Pair[] {
  const out: Pair[] = [];
  for (const idx of groups(rows).values()) for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    const i = idx[a], j = idx[b];
    if (rows[i].actual === rows[j].actual) continue;
    out.push(rows[i].actual > rows[j].actual ? [i, j] : [j, i]);
  }
  return out;
}
function acc(scores: Float64Array, pairs: Pair[]) {
  let good = 0, all = 0;
  for (const [w, l] of pairs) { if (scores[w] === scores[l]) continue; all++; if (scores[w] > scores[l]) good++; }
  return all ? (100 * good) / all : 0;
}
const mae = (pred: Float64Array, rows: Row[]) => rows.reduce((a, r, i) => a + Math.abs(pred[i] - r.actual), 0) / Math.max(1, rows.length);

/** blend = share of the projection mixed into the expert-rank points before the factors tilt it. */
export function shsScores(rows: Row[], expert: number, mult: Record<string, number>, blend = 0) {
  const out = new Float64Array(rows.length);
  rows.forEach((r, i) => {
    let num = 0, den = 0;
    for (const k in r.f) { const [v, w] = r.f[k]; const ww = w * (mult[k] ?? 1); num += v * ww; den += ww; }
    const base = (1 - blend) * r.ecrPts + blend * r.proj;
    out[i] = base * (1 + (1 - expert / 100) * (den ? num / den : 0));
  });
  return out;
}

function fit(rows: Row[], keys: string[]) {
  const pairs = pairsOf(rows);
  const mult: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 1]));
  let expert = 75, blend = 0;
  const score = () => acc(shsScores(rows, expert, mult, blend), pairs);
  let best = score();
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const b of BLENDS) { const old = blend; blend = b; const s = score(); if (s > best + 0.01) { best = s; improved = true; } else blend = old; }
    for (const e of EXPERTS) { const old = expert; expert = e; const s = score(); if (s > best + 0.01) { best = s; improved = true; } else expert = old; }
    for (const k of keys) for (const m of MULTS) {
      const old = mult[k]; if (m === old) continue;
      mult[k] = m; const s = score();
      if (s > best + 0.01) { best = s; improved = true; } else mult[k] = old;
    }
    if (!improved) break;
  }
  return { expert, mult, blend, train: best };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function analyse(rows: Row[], projSource: string) {
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.f)))].sort();
  const grade = (sub: Row[], pred: (r: Row) => number) => {
    const s = Float64Array.from(sub.map(pred));
    return { pick: r1(acc(s, pairsOf(sub))), mae: r2(mae(s, sub)) };
  };
  // Leave-one-season-out: fit on the others, grade on the held-out season.
  const perSeason = seasons.map((season) => {
    const test = rows.filter((r) => r.season === season), train = rows.filter((r) => r.season !== season);
    const f = fit(train, keys);
    const tuned = shsScores(test, f.expert, f.mult, f.blend);
    const def = shsScores(test, 75, {});
    const pairs = pairsOf(test);
    return {
      season, weeks: new Set(test.map((r) => r.week)).size, players: test.length,
      experts: grade(test, (r) => r.ecrPts).pick, expertsMae: grade(test, (r) => r.ecrPts).mae,
      projection: grade(test, (r) => r.proj).pick, projectionMae: grade(test, (r) => r.proj).mae,
      shsDefault: r1(acc(def, pairs)), shsTuned: r1(acc(tuned, pairs)), shsTunedMae: r2(mae(tuned, test)),
      fitted: { expert: f.expert, mult: f.mult, blend: f.blend },
    };
  });
  const all = fit(rows, keys);
  // Each factor on its own: how many points of "picks right" it adds (or costs) when it nudges the expert rank by
  // up to ±5%. (A plain correlation with beating the rank is misleading: top-ranked players can't beat their rank.)
  const nudge = (sub: Row[], k: string, c: number) => { const p = pairsOf(sub); return acc(Float64Array.from(sub.map((r) => r.ecrPts * (1 + c * (r.f[k]?.[0] ?? 0)))), p) - acc(Float64Array.from(sub.map((r) => r.ecrPts)), p); };
  const factors = keys.map((k) => {
    const bySeason: Record<number, number | null> = {};
    for (const s of seasons) { const sub = rows.filter((r) => r.season === s); bySeason[s] = Math.round(nudge(sub, k, 0.05) * 100) / 100; }
    return { key: k, n: rows.filter((r) => r.f[k]).length, corr: Math.round(nudge(rows, k, 0.05) * 100) / 100, flipped: Math.round(nudge(rows, k, -0.05) * 100) / 100, bySeason, mult: all.mult[k] };
  });
  const avg = (k: keyof typeof perSeason[number]) => r1(perSeason.reduce((a, s) => a + (s[k] as number), 0) / perSeason.length);
  const summary = { experts: avg("experts"), projection: avg("projection"), shsDefault: avg("shsDefault"), shsTuned: avg("shsTuned") };
  const out = {
    generatedAt: new Date().toISOString(), projSource, seasons, rows: rows.length, weeks: perSeason.reduce((a, s) => a + s.weeks, 0),
    expert: all.expert, mult: all.mult, blend: all.blend, summary, perSeason, factors,
  };
  fs.writeFileSync(path.join(process.cwd(), "src/lib/services/shsResearch.json"), JSON.stringify(out, null, 1));
  fs.mkdirSync(path.join(process.cwd(), "docs"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "docs/shs-research.md"), report(out));
  console.log(JSON.stringify({ summary, expert: all.expert, blend: all.blend, mult: all.mult, perSeason: perSeason.map((p) => [p.season, p.experts, p.projection, p.shsDefault, p.shsTuned, p.fitted.expert, p.fitted.blend]) }, null, 1));
}

function report(o: { generatedAt: string; projSource: string; seasons: number[]; rows: number; weeks: number; expert: number; blend: number; mult: Record<string, number>; summary: Record<string, number>; perSeason: { season: number; weeks: number; players: number; experts: number; projection: number; shsDefault: number; shsTuned: number; expertsMae: number; projectionMae: number; shsTunedMae: number }[]; factors: { key: string; n: number; corr: number | null; bySeason: Record<number, number | null>; mult: number }[] }) {
  const L: string[] = [];
  L.push(`# SHS AI research (${o.seasons[0]}–${o.seasons.at(-1)})`, "", `Generated ${o.generatedAt.slice(0, 10)} · ${o.weeks} weeks · ${o.rows.toLocaleString()} player-weeks · projection source: ${o.projSource}.`, "");
  L.push("Every week was replayed with only information available before Sunday's first kickoff: FantasyPros weekly expert consensus (PPR), the weekly projection, and every SHS factor built from earlier weeks. Scored in PPR. *Picks right* = for every pair of ranked players at the same position in the same week, how often the higher-ranked one outscored the other. SHS tuned is out of sample: weights fitted on the other seasons, graded on that season.", "");
  L.push("| Season | Weeks | Experts | Projection | SHS (old default) | SHS (tuned, out of sample) |", "|---|---|---|---|---|---|");
  for (const s of o.perSeason) L.push(`| ${s.season} | ${s.weeks} | ${s.experts}% | ${s.projection}% | ${s.shsDefault}% | **${s.shsTuned}%** |`);
  L.push(`| **Average** | | ${o.summary.experts}% | ${o.summary.projection}% | ${o.summary.shsDefault}% | **${o.summary.shsTuned}%** |`, "");
  L.push(`**New default:** ${Math.round(o.blend * 100)}% of the weekly projection blended into the expert rank · expert share ${o.expert}% · factor weights ${Object.entries(o.mult).map(([k, v]) => `${k} ${v}×`).join(", ")}.`, "");
  L.push("## Factors", "", "Change in *picks right* (percentage points) when each factor alone nudges the expert rank by up to ±5%, and when it's flipped (−5%). Positive = it adds information the experts missed.", "", `| Factor | Player-weeks | All seasons | Flipped | ${o.seasons.join(" | ")} | Weight |`, `|---|---|---|---|${o.seasons.map(() => "---").join("|")}|---|`);
  for (const f of [...o.factors].sort((a, b) => (b.corr ?? 0) - (a.corr ?? 0))) L.push(`| ${f.key} | ${f.n.toLocaleString()} | ${f.corr ?? "—"} | ${(f as { flipped?: number }).flipped ?? "—"} | ${o.seasons.map((s) => f.bySeason[s] ?? "—").join(" | ")} | ${f.mult}× |`);
  return L.join("\n") + "\n";
}

// Re-run the analysis on a saved dataset: npx tsx scripts/research/analyse.ts
if (process.argv[1]?.endsWith("analyse.ts")) {
  const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache/research/dataset.json"), "utf8"));
  analyse(d.rows, d.projSource);
}
