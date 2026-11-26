/**
 * SHS AI v2 research: fits the stacked weekly model (src/lib/services/shsStack.ts) and grades it honestly.
 *
 *   npx tsx scripts/research/stack.ts          (reads .cache/research/dataset.json written by shs-history.ts)
 *
 * Walk-forward: every season from the second on is predicted by a model trained only on earlier seasons.
 * Graded four ways, all within the same position and week:
 *   all pairs     every two ranked players: who scored more (the old headline number)
 *   close calls   players within 3 expert-rank spots of each other: the start/sit decisions people actually face
 *   error         average miss in fantasy points (lower is better)
 *   rank corr.    Spearman correlation of the ranking with what happened
 * Writes src/lib/services/shsStack.json (model trained on every season) and docs/shs-stack.md.
 */
import fs from "node:fs";
import path from "node:path";
import type { Row } from "./shs-history";
import { BASE, BASE_KEYS, STACK_POS, basePreds, deltas, dot, metaFeatures, stackPredict, withBias, type BaseKey, type PosStack, type StackJson, type StackX } from "../../src/lib/services/shsStack";
import { shsFormula, rankMoveLimit } from "../../src/lib/services/shsModel";

export type R = Row & { x: StackX };
const NEAR = 3;
const ALPHA = 0.02;

// ---------------- linear algebra ----------------
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
/** Ridge regression, penalty relative to each feature's scale, intercept (column 0) unpenalised. */
function ridge(X: number[][], y: number[], alpha = ALPHA, wt?: number[]) {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) { const x = X[i], c = wt?.[i] ?? 1; for (let p = 0; p < k; p++) { b[p] += c * x[p] * y[i]; for (let q = 0; q <= p; q++) A[p][q] += c * x[p] * x[q]; } }
  for (let p = 0; p < k; p++) for (let q = 0; q < p; q++) A[q][p] = A[p][q];
  for (let p = 1; p < k; p++) A[p][p] += alpha * A[p][p] + 1e-6;
  return solve(A, b);
}

// ---------------- grading ----------------
export type Scored = { g: string; ecrPos: number; score: number; pred: number; actual: number };
export interface Metrics { all: number; near: number; mae: number; rho: number; n: number; nearPairs: number }
export function grade(list: Scored[]): Metrics {
  const groups = new Map<string, Scored[]>();
  for (const s of list) (groups.get(s.g) ?? groups.set(s.g, []).get(s.g)!).push(s);
  let ga = 0, na = 0, gn = 0, nn = 0, rhoSum = 0, rhoN = 0, err = 0;
  for (const arr of groups.values()) {
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (a.actual === b.actual) continue;
      // A tie in the ranking is a coin flip: half credit, so every model is graded on the same pairs.
      const ok = a.score === b.score ? 0.5 : (a.actual > b.actual) === (a.score > b.score) ? 1 : 0;
      na++; ga += ok;
      if (Math.abs(a.ecrPos - b.ecrPos) <= NEAR) { nn++; gn += ok; }
    }
    if (arr.length >= 5) { rhoSum += spearman(arr.map((x) => x.score), arr.map((x) => x.actual)); rhoN++; }
  }
  for (const s of list) err += Math.abs(s.pred - s.actual);
  return { all: pct(ga, na), near: pct(gn, nn), mae: Math.round((err / Math.max(1, list.length)) * 100) / 100, rho: Math.round((rhoSum / Math.max(1, rhoN)) * 1000) / 1000, n: list.length, nearPairs: nn };
}
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 0);
function ranks(v: number[]) { const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); idx.forEach(([, i], k) => (r[i] = k)); return r as number[]; }
function spearman(a: number[], b: number[]) {
  const ra = ranks(a), rb = ranks(b), n = a.length, ma = (n - 1) / 2;
  let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (ra[i] - ma) * (rb[i] - ma); sa += (ra[i] - ma) ** 2; sb += (rb[i] - ma) ** 2; }
  return sa && sb ? s / Math.sqrt(sa * sb) : 0;
}
export const key = (r: R) => `${r.season}:${r.week}:${r.pos}`;

// ---------------- fitting ----------------
const isEcr = (r: R) => (r.src ?? "ecr") === "ecr";
/** Which rows each base model may learn from. Pre-expert rows (2012–2020) have no expert rank, so the experts base
 *  never sees them; the projection base only sees rows that had a real projection (Sleeper's starts in 2018). */
const BASE_ROWS: Record<BaseKey, (r: R) => boolean> = {
  experts: isEcr,
  projection: (r) => isEcr(r) || r.src === "sleeper",
  opportunity: () => true,
  context: () => true,
};
/** Pre-expert rows count for less than graded ones (older era, weaker anchor). */
export let PRE_WEIGHT = Number(process.env.PRE_W ?? 0.3);
export const setPreWeight = (w: number) => { PRE_WEIGHT = w; };
function fitBases(rows: R[]) {
  const base = {} as PosStack["base"];
  for (const k of BASE_KEYS) { const rs = rows.filter(BASE_ROWS[k]); base[k] = { w: ridge(rs.map((r) => withBias(BASE[k](r.x))), rs.map((r) => r.actual), ALPHA, rs.map((r) => (isEcr(r) ? 1 : PRE_WEIGHT))) }; }
  return base;
}
/** Out-of-fold base predictions for the graded rows, so the meta model learns trust from honest numbers.
 *  pool = rows the bases may learn from (the graded rows, plus pre-expert seasons in the two-stage model). */
export function oof(rows: R[], pool: R[] = rows) {
  const seasons = [...new Set(rows.map((r) => r.season))];
  const fold = (r: R) => (seasons.length >= 3 ? String(r.season) : `${r.season}:${r.week % 4}`);
  const folds = [...new Set(rows.map(fold))];
  const out = new Map<R, Record<BaseKey, number>>();
  for (const f of folds) {
    const tr = pool.filter((r) => fold(r) !== f), te = rows.filter((r) => fold(r) === f);
    if (!tr.length || !te.length) continue;
    const m: PosStack = { base: fitBases(tr), meta: { w: [] }, range: 0 };
    for (const r of te) out.set(r, basePreds(m, r.x));
  }
  return out;
}
const RANGE_GRID = [-0.3, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.3];
function fitPos(rows: R[], opts: { range: boolean }, pool: R[] = rows): PosStack {
  const o = oof(rows, pool);
  const tr = rows.filter((r) => o.has(r));
  const meta = { w: ridge(tr.map((r) => metaFeatures(o.get(r)!, r.x)), tr.map((r) => r.actual)) };
  let range = 0;
  if (opts.range) {
    // Pick the range nudge that best orders close calls in the (out-of-fold) training data; keep 0 unless it helps.
    let best = -1;
    for (const lam of RANGE_GRID) {
      const m = grade(tr.map((r) => { const pts = dot(meta.w, metaFeatures(o.get(r)!, r.x)); return { g: key(r), ecrPos: r.ecrPos, score: pts * (1 + lam * r.x.vol), pred: pts, actual: r.actual }; })).near;
      if (m > best + (lam === 0 ? -1 : 0.1)) { best = m; range = lam; }
    }
  }
  return { base: fitBases(pool), meta, range };
}
/** One plain ridge over every input (no stacking), for comparison. */
function fitFlat(rows: R[]) {
  const f = (x: StackX) => [1, ...BASE_KEYS.flatMap((k) => BASE[k](x))];
  const w = ridge(rows.map((r) => f(r.x)), rows.map((r) => r.actual));
  return (x: StackX) => dot(w, f(x));
}

// ---------------- ranking head: pairwise logistic on close calls ----------------
function nearPairs(rows: R[], within: number) {
  const g = new Map<string, number[]>();
  rows.forEach((r, i) => (g.get(key(r)) ?? g.set(key(r), []).get(key(r))!).push(i));
  const out: [number, number][] = [];
  for (const idx of g.values()) for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    const i = idx[a], j = idx[b];
    if (Math.abs(rows[i].ecrPos - rows[j].ecrPos) > within || rows[i].actual === rows[j].actual) continue;
    out.push(rows[i].actual > rows[j].actual ? [i, j] : [j, i]);
  }
  return out;
}
/** score = E + β·Δ, β from pairwise logistic regression (Newton, ridge λ) on near pairs. */
export function fitRank(rows: R[], D: number[][], lambda: number) {
  const P = nearPairs(rows, 6), k = D[0]?.length ?? 0;
  let beta = new Array(k).fill(0);
  for (let it = 0; it < 10; it++) {
    const g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const [w, l] of P) {
      const dE = rows[w].x.E - rows[l].x.E;
      const d = D[w].map((v, i) => v - D[l][i]);
      let z = dE; for (let i = 0; i < k; i++) z += beta[i] * d[i];
      const p = 1 / (1 + Math.exp(-z / 4)), q = p * (1 - p) / 16;
      for (let i = 0; i < k; i++) { g[i] += ((1 - p) * d[i]) / 4; for (let j = 0; j <= i; j++) H[i][j] += q * d[i] * d[j]; }
    }
    for (let i = 0; i < k; i++) { g[i] -= lambda * beta[i]; H[i][i] += lambda; for (let j = 0; j < i; j++) H[j][i] = H[i][j]; }
    const step = solve(H, g);
    beta = beta.map((b, i) => b + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  return beta;
}
const LAMBDAS = [30, 100, 300, 1000, 3000];
/** Ranking head with its ridge strength picked by out-of-fold close-call accuracy inside the training seasons. */
function fitRankHead(rows: R[], pool: R[] = rows) {
  const o = oof(rows, pool);
  const tr = rows.filter((r) => o.has(r));
  const D = tr.map((r) => deltas(o.get(r)!, r.x));
  const seasons = [...new Set(tr.map((r) => r.season))];
  let best = { lam: 3000, acc: -1 };
  if (seasons.length >= 2) {
    for (const lam of LAMBDAS) {
      const sc: Scored[] = [];
      for (const s of seasons) {
        const fi = tr.map((r, i) => [r, i] as const).filter(([r]) => r.season !== s);
        const b = fitRank(fi.map(([r]) => r), fi.map(([, i]) => D[i]), lam);
        tr.forEach((r, i) => { if (r.season === s) { const v = r.x.E + dot(b, D[i]); sc.push({ g: key(r), ecrPos: r.ecrPos, score: v, pred: v, actual: r.actual }); } });
      }
      const a = grade(sc).near;
      if (a > best.acc) best = { lam, acc: a };
    }
  }
  return { beta: fitRank(tr, D, best.lam), lambda: best.lam };
}

// ---------------- the old SHS formula, for comparison ----------------
const oldShs = (r: R) => shsFormula("week", r.pos, r.ecrPts, r.proj > 0.3 ? r.proj : null, Object.entries(r.f).map(([k, [v]]) => ({ key: k, value: v })), null, { lines: 0 }).rating;

/** The app caps how far SHS may move a player from his expert rank; apply the same cap to a score. */
function capped(list: (Scored & { id: string })[]) {
  const groups = new Map<string, typeof list>();
  for (const s of list) (groups.get(s.g) ?? groups.set(s.g, []).get(s.g)!).push(s);
  const out: Scored[] = [];
  for (const arr of groups.values()) {
    const want = new Map([...arr].sort((a, b) => b.score - a.score).map((s, i) => [s.id, i + 1]));
    const ecr = new Map([...arr].sort((a, b) => a.ecrPos - b.ecrPos).map((s, i) => [s.id, i + 1]));
    const k = (s: (typeof arr)[number]) => { const e = ecr.get(s.id)!; const lim = rankMoveLimit(e); const mv = Math.max(-lim, Math.min(lim, e - want.get(s.id)!)); return e - mv + (want.get(s.id)! / 1000); };
    const order = [...arr].sort((a, b) => k(a) - k(b));
    order.forEach((s, i) => out.push({ ...s, score: -i }));
  }
  return out;
}

export function stackResearch(all: Row[], projSource: string) {
  const every = all.filter((r): r is R => !!r.x && STACK_POS.includes(r.pos as (typeof STACK_POS)[number]));
  const rows = every.filter(isEcr);
  const PRE_FROM = Number(process.env.PRE_FROM ?? 0);
  const preRows = every.filter((r) => !isEcr(r) && r.season >= PRE_FROM);
  const preSeasons = [...new Set(preRows.map((r) => r.season))].sort();
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  const tests = seasons.slice(1);
  const models = ["Experts", "Projection", "SHS (current)", "Opportunity only", "Context only", "One ridge (no stack)", "Stack", "Stack + range", "Stack, ranking head", "Stack, ranking head, capped",
    "Two-stage: opportunity only", "Two-stage: stack", "Two-stage: ranking head", "Two-stage: ranking head, capped"] as const;
  type M = (typeof models)[number];
  const bySeason: Record<number, Record<M, Metrics>> = {};
  const pooled: Record<M, (Scored & { id: string })[]> = Object.fromEntries(models.map((m) => [m, []])) as never;
  const rangeUsed: Record<string, number[]> = {};
  const lamUsed: Record<string, number[]> = {};

  for (const s of tests) {
    const train = rows.filter((r) => r.season < s), test = rows.filter((r) => r.season === s);
    const L: Record<M, (Scored & { id: string })[]> = Object.fromEntries(models.map((m) => [m, []])) as never;
    for (const pos of STACK_POS) {
      const tr = train.filter((r) => r.pos === pos), te = test.filter((r) => r.pos === pos);
      if (tr.length < 200 || !te.length) continue;
      const st = fitPos(tr, { range: false });
      const sr = fitPos(tr, { range: true });
      (rangeUsed[pos] ??= []).push(sr.range);
      const flat = fitFlat(tr);
      const head = fitRankHead(tr);
      (lamUsed[pos] ??= []).push(head.lambda);
      // Two-stage: bases also learn from the pre-expert seasons (all earlier than any test season).
      const pool = [...tr, ...preRows.filter((r) => r.pos === pos)];
      const st2 = fitPos(tr, { range: false }, pool);
      const head2 = fitRankHead(tr, pool);
      for (const r of te) {
        const base = { g: key(r), ecrPos: r.ecrPos, actual: r.actual, id: r.id };
        const b = basePreds(st, r.x);
        const p1 = stackPredict(st, r.x), p2 = stackPredict(sr, r.x);
        L["Experts"].push({ ...base, score: -r.ecrPos, pred: r.ecrPts });
        L["Projection"].push({ ...base, score: r.proj, pred: r.proj });
        const o = oldShs(r); L["SHS (current)"].push({ ...base, score: o, pred: o });
        L["Opportunity only"].push({ ...base, score: b.opportunity, pred: b.opportunity });
        L["Context only"].push({ ...base, score: b.context, pred: b.context });
        const f = flat(r.x); L["One ridge (no stack)"].push({ ...base, score: f, pred: f });
        L["Stack"].push({ ...base, score: p1.score, pred: p1.pts });
        L["Stack + range"].push({ ...base, score: p2.score, pred: p2.pts });
        const hv = r.x.E + dot(head.beta, deltas(b, r.x));
        L["Stack, ranking head"].push({ ...base, score: hv, pred: p1.pts });
        const b2 = basePreds(st2, r.x), q2 = stackPredict(st2, r.x);
        L["Two-stage: opportunity only"].push({ ...base, score: b2.opportunity, pred: b2.opportunity });
        L["Two-stage: stack"].push({ ...base, score: q2.score, pred: q2.pts });
        const hv2 = r.x.E + dot(head2.beta, deltas(b2, r.x));
        L["Two-stage: ranking head"].push({ ...base, score: hv2, pred: q2.pts });
      }
    }
    L["Stack, ranking head, capped"] = capped(L["Stack, ranking head"]).map((x, i) => ({ ...x, id: String(i) }));
    L["Two-stage: ranking head, capped"] = capped(L["Two-stage: ranking head"]).map((x, i) => ({ ...x, id: String(i) }));
    bySeason[s] = Object.fromEntries(models.map((m) => [m, grade(L[m])])) as Record<M, Metrics>;
    for (const m of models) pooled[m].push(...L[m]);
    console.log(`${s}: close calls experts ${bySeason[s]["Experts"].near} · head ${bySeason[s]["Stack, ranking head"].near} · capped ${bySeason[s]["Stack, ranking head, capped"].near} | all ${bySeason[s]["Experts"].all} → ${bySeason[s]["Stack, ranking head"].all}`, JSON.stringify(lamUsed));
  }
  const total = Object.fromEntries(models.map((m) => [m, grade(pooled[m])])) as Record<M, Metrics>;
  // By position, pooled out-of-sample
  const byPos: Record<string, Record<M, Metrics>> = {};
  for (const pos of STACK_POS) byPos[pos] = Object.fromEntries(models.map((m) => [m, grade(pooled[m].filter((x) => x.g.endsWith(`:${pos}`)))])) as Record<M, Metrics>;

  // Final model: every season.
  const preNote = preRows.length ? `; usage & matchup pretrained on ${preSeasons[0]}–${preSeasons.at(-1)} (+${preRows.length.toLocaleString()} player-weeks) where it helped` : "";
  const final: StackJson = { version: 2, trainedOn: `${seasons[0]}–${seasons.at(-1)} (${rows.length.toLocaleString()} player-weeks)${preNote}`, projSource, model: {} };
  const twoStage: Record<string, boolean> = {};
  for (const pos of STACK_POS) {
    const pr = rows.filter((r) => r.pos === pos);
    const t = byPos[pos];
    // Pretraining is kept for a position only if it beat the single-stage model out of sample on close calls
    // without losing on all pairs.
    const two = preRows.length > 0 && t["Two-stage: ranking head, capped"].near > t["Stack, ranking head, capped"].near && t["Two-stage: ranking head, capped"].all >= t["Stack, ranking head, capped"].all - 0.1;
    twoStage[pos] = two;
    const pool = two ? [...pr, ...preRows.filter((r) => r.pos === pos)] : pr;
    const m = fitPos(pr, { range: true }, pool);
    m.head = fitRankHead(pr, pool).beta;
    // The app ranks with v2 only where it beat both the experts and the current SHS formula out of sample on close
    // calls (by at least 0.2 points) without losing on all pairs.
    const c = two ? t["Two-stage: ranking head, capped"] : t["Stack, ranking head, capped"];
    m.use = c.near >= Math.max(t["Experts"].near, t["SHS (current)"].near) + 0.2 && c.all >= t["Experts"].all;
    final.model[pos] = m;
  }
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const round = (m: PosStack): PosStack => ({ base: Object.fromEntries(BASE_KEYS.map((k) => [k, { w: m.base[k].w.map(r4) }])) as PosStack["base"], meta: { w: m.meta.w.map(r4) }, range: m.range, head: m.head?.map(r4), use: m.use });
  for (const pos of STACK_POS) final.model[pos] = round(final.model[pos]!);
  final.report = { tests, total, bySeason, byPos, rangeUsed, twoStage, preSeasons, preRows: preRows.length };
  fs.writeFileSync(path.join(process.cwd(), "src/lib/services/shsStack.json"), JSON.stringify(final, null, 1));
  fs.mkdirSync(path.join(process.cwd(), "docs"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "docs/shs-stack.md"), report(models as unknown as string[], total, bySeason, byPos, tests, projSource, rows.length, rangeUsed, final, twoStage, preSeasons, preRows.length));
  console.log(JSON.stringify(total, null, 1));
}

function report(models: string[], total: Record<string, Metrics>, bySeason: Record<number, Record<string, Metrics>>, byPos: Record<string, Record<string, Metrics>>, tests: number[], projSource: string, n: number, rangeUsed: Record<string, number[]>, final: StackJson, twoStage: Record<string, boolean>, preSeasons: number[], preN: number) {
  const tbl = (t: Record<string, Metrics>) => ["| Model | Close calls | All pairs | Avg miss (pts) | Rank corr. |", "|---|---|---|---|---|", ...models.map((m) => `| ${m} | ${t[m].near}% | ${t[m].all}% | ${t[m].mae} | ${t[m].rho} |`)].join("\n");
  const e = total["Experts"], s = total["Stack + range"];
  return `# SHS AI v2: stacked weekly model

Replayed ${n.toLocaleString()} player-weeks (QB/RB/WR/TE ranked by the experts). Projection source: ${projSource}.
Out of sample, walk-forward: seasons ${tests.join(", ")} are each predicted by a model trained only on earlier seasons.

**Close calls** = pairs of players within ${NEAR} expert-rank spots at the same position in the same week (${e.nearPairs.toLocaleString()} pairs): the start/sit decisions people face. **All pairs** = every two ranked players (the old headline number). **Avg miss** = average absolute error in fantasy points. **Rank corr.** = Spearman correlation with actual scoring, averaged over each position-week.

Headline: close calls ${e.near}% (experts) → ${s.near}% (SHS v2), avg miss ${e.mae} → ${s.mae} pts.

**Two-stage models**: ${preN ? `the usage, matchup and projection parts also learn from ${preN.toLocaleString()} player-weeks of ${preSeasons[0]}–${preSeasons.at(-1)} (before the expert-rank archive; projection from Sleeper's 2018+ archive). The blend with expert ranks still learns only from graded seasons. Kept per position only where it beat the single-stage model out of sample: ${Object.entries(twoStage).map(([p, v]) => `${p} ${v ? "yes" : "no"}`).join(", ")}.` : "not run (no pre-expert seasons in the dataset)."}

## All test seasons

${tbl(total)}

## By position (all test seasons)

${Object.entries(byPos).map(([p, t]) => `### ${p}\n\n${tbl(t)}`).join("\n\n")}

## By season

${tests.map((y) => `### ${y}\n\n${tbl(bySeason[y])}`).join("\n\n")}

## What the final model trusts (trained on every season)

Meta weights per position: intercept, experts, projection, opportunity, context, early-season projection pull, small-sample usage pull.

${Object.entries(final.model).map(([p, m]) => `- **${p}**: ${m!.meta.w.map((v) => v.toFixed(2)).join(" · ")}; range nudge ${m!.range}; ranking head ${(m!.head ?? []).map((v) => v.toFixed(3)).join(" · ")}; **${m!.use ? "used by the app" : "not used (no out-of-sample edge); the app keeps the current formula"}**`).join("\n")}

Range nudges chosen per test season: ${Object.entries(rangeUsed).map(([p, v]) => `${p} ${v.join(", ")}`).join("; ")}.

Not in the backtest: player prop betting lines (no free history; the live app blends them in when available) and weather.
`;
}

if (process.argv[1]?.endsWith("stack.ts")) {
  const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache/research/dataset.json"), "utf8")) as { projSource: string; rows: Row[] };
  stackResearch(d.rows, d.projSource);
}
