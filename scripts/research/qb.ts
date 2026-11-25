/**
 * QB research: which quarterback-specific inputs (src/lib/services/shsQb.ts) improve SHS AI v2's close calls?
 *
 *   npx tsx scripts/research/qb.ts     (after shs-history.ts has written .cache/research/dataset.json)
 *
 * 1. Each input on its own: added to the v2 ranking head, walk-forward (each season predicted from earlier ones).
 * 2. Forward selection: inside the training seasons only, add inputs one at a time while they raise
 *    leave-one-season-out close-call accuracy; then score the chosen set on the held-out season.
 * Writes src/lib/services/shsQb.json (chosen inputs + head trained on every season, with `use` only if the
 * walk-forward result beats both the experts and the base v2 model) and docs/shs-qb.md.
 */
import fs from "node:fs";
import path from "node:path";
import type { Row } from "./shs-history";
import { fitRank, grade, key, oof, type R, type Scored } from "./stack";
import { deltas } from "../../src/lib/services/shsStack";
import { QB_KEYS, qbFeat, type QbKey, type QbX } from "../../src/lib/services/shsQb";

type Q = R & { qx: QbX };
const LAMS = [100, 300, 1000, 3000];
/**
 * Live trial chosen by the user (Nov 2026): v2 + wind for QBs. Wind was the strongest single input with both
 * Sleeper and FantasyPros projections, but it was picked after seeing these results, so it ships as a trial and
 * is judged by the live track record. Empty = use the automatic selection and its out-of-sample gate.
 */
const TRIAL: QbKey[] = ["wind"];
// Inputs enter the head scaled by his expert-rank points (a 10% softer defence matters more for a QB1).
const feat = (r: Q, k: QbKey) => qbFeat(r.x.E, r.qx, k);

function design(rows: Q[], keys: QbKey[]) {
  const o = oof(rows);
  const tr = rows.filter((r) => o.has(r));
  return { tr, D: tr.map((r) => [...deltas(o.get(r)!, r.x), ...keys.map((k) => feat(r, k))]) };
}
/** Close-call accuracy of a head trained on `train` and scored on `test` (base deltas from out-of-fold bases). */
function evalSet(train: Q[], test: Q[], keys: QbKey[], lam: number): Scored[] {
  const { tr, D } = design(train, keys);
  const b = fitRank(tr, D, lam);
  const all = [...train, ...test];
  const o = oof(all); // test rows get bases fitted without their season
  return test.filter((r) => o.has(r)).map((r) => { const v = r.x.E + [...deltas(o.get(r)!, r.x), ...keys.map((k) => feat(r, k))].reduce((a, d, i) => a + d * (b[i] ?? 0), 0); return { g: key(r), ecrPos: r.ecrPos, score: v, pred: v, actual: r.actual }; });
}
/** Leave-one-season-out close calls inside `rows`, picking λ too. */
function innerCv(rows: Q[], keys: QbKey[]) {
  const seasons = [...new Set(rows.map((r) => r.season))];
  let best = { acc: -1, lam: 1000 };
  for (const lam of LAMS) {
    const sc: Scored[] = [];
    for (const s of seasons) sc.push(...evalSet(rows.filter((r) => r.season !== s), rows.filter((r) => r.season === s), keys, lam));
    const a = grade(sc).near;
    if (a > best.acc) best = { acc: a, lam };
  }
  return best;
}
function select(rows: Q[]) {
  let keys: QbKey[] = [];
  let cur = innerCv(rows, keys);
  for (;;) {
    let step: { k: QbKey; acc: number; lam: number } | null = null;
    for (const k of QB_KEYS) {
      if (keys.includes(k)) continue;
      const r = innerCv(rows, [...keys, k]);
      if (r.acc > (step?.acc ?? cur.acc + 0.15)) step = { k, ...r };
    }
    if (!step) break;
    keys = [...keys, step.k]; cur = { acc: step.acc, lam: step.lam };
    if (keys.length >= 6) break;
  }
  return { keys, lam: cur.lam };
}

export function qbResearch(all: Row[], projSource: string) {
  const rows = all.filter((r): r is Q => r.pos === "QB" && !!r.x && !!r.qx);
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  const tests = seasons.filter((s) => seasons.filter((x) => x < s).length >= 2); // need ≥2 training seasons for inner CV
  const pool: Record<string, Scored[]> = { Experts: [], "v2 base": [], "v2 + QB inputs (selected)": [] };
  const single: Record<string, Scored[]> = Object.fromEntries(QB_KEYS.map((k) => [k, []]));
  const chosen: Record<number, string[]> = {};
  for (const s of tests) {
    const train = rows.filter((r) => r.season < s), test = rows.filter((r) => r.season === s);
    pool.Experts.push(...test.map((r) => ({ g: key(r), ecrPos: r.ecrPos, score: -r.ecrPos, pred: r.ecrPts, actual: r.actual })));
    const base = innerCv(train, []);
    pool["v2 base"].push(...evalSet(train, test, [], base.lam));
    for (const k of QB_KEYS) single[k].push(...evalSet(train, test, [k], base.lam));
    const sel = select(train);
    chosen[s] = sel.keys;
    pool["v2 + QB inputs (selected)"].push(...evalSet(train, test, sel.keys, sel.lam));
    console.log(`${s}: chose ${sel.keys.join(", ") || "(none)"}`);
  }
  const total = Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, grade(v)]));
  const singles = Object.fromEntries(Object.entries(single).map(([k, v]) => [k, grade(v)]));
  // Final: select on every season, fit, and decide whether the app should use it.
  const fin = TRIAL.length ? { keys: TRIAL, lam: innerCv(rows, TRIAL).lam } : select(rows);
  const { tr, D } = design(rows, fin.keys);
  const head = fitRank(tr, D, fin.lam);
  const t = total["v2 + QB inputs (selected)"];
  const use = TRIAL.length ? true : t.near >= Math.max(total.Experts.near, total["v2 base"].near) + 0.2 && t.all >= total.Experts.all - 0.05;
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const json = { version: 1, projSource, keys: fin.keys, head: head.map(r4), use, trial: TRIAL.length > 0, report: { tests, total, singles, chosen } };
  fs.writeFileSync(path.join(process.cwd(), "src/lib/services/shsQb.json"), JSON.stringify(json, null, 1));
  const tbl = (t: Record<string, { near: number; all: number; mae: number; rho: number }>) => ["| | Close calls | All pairs | Rank corr. |", "|---|---|---|---|", ...Object.entries(t).map(([k, m]) => `| ${k} | ${m.near}% | ${m.all}% | ${m.rho} |`)].join("\n");
  fs.writeFileSync(path.join(process.cwd(), "docs/shs-qb.md"), `# SHS AI: quarterback inputs

Walk-forward, seasons ${tests.join(", ")} (each predicted only from earlier seasons). Projection source: ${projSource}. ${total.Experts.nearPairs.toLocaleString()} QB close calls.

## Result

${tbl(total)}

Inputs chosen inside each training window: ${Object.entries(chosen).map(([s, k]) => `${s}: ${k.join(", ") || "none"}`).join("; ")}.

Final model (every season): **${fin.keys.join(", ") || "no inputs"}**, ${TRIAL.length ? "**live trial** (picked by hand after these results; judged by the live track record)" : use ? "**used by the app**" : "**not used** (didn't beat the experts and base v2 out of sample by 0.2+)"}.

## Each input on its own (added to v2 base)

${tbl(singles)}
`);
  console.log(JSON.stringify({ total, singles }, null, 1));
}

if (process.argv[1]?.endsWith("qb.ts")) {
  const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache/research/dataset.json"), "utf8")) as { projSource: string; rows: Row[] };
  qbResearch(d.rows, d.projSource);
}
