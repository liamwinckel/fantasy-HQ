/**
 * Backtest: replay every finished week of this season as if it were the week ahead, using only what was known
 * before kickoff (stats, snaps, usage, injuries and practice reports through the previous week, that week's
 * expert rankings and Sleeper projection), then grade SHS AI, the experts and the projections on what happened.
 *
 * Not replayable: betting-market lines and kickoff weather (no free history), so those parts of weekly SHS AI
 * are graded only by the live track record going forward.
 *
 * Expensive part (factor values per player per week) is cached on this device; grading under any weights is cheap,
 * which is what lets the backtest tune the weights.
 */
import { kvGet, kvSet } from "../kv";
import { ecrWeekly, marketsHistory, type MarketsHistory } from "../nflverse";
import { marketPoints, type MarketLine } from "../markets";
import { sleeper } from "../sleeper/client";
import { scoreSleeperStats } from "../engine/scoring";
import { usageFromLogs } from "../engine/projections";
import type { LeagueContext } from "./league";
import { rankings } from "./rankings";
import { RESEARCH, shsAi } from "./shsai";
import { buildSignals } from "./signals";
import { DEFAULT_SHS, getSettings, type ShsWeights } from "../settings";

const POS_CUT: Record<string, number> = { QB: 24, RB: 40, WR: 50, TE: 20 };
const VERSION = 5;

/** One player in one replayed week. f = factor key → [value −1…1, base weight]. */
export interface BtRow { id: string; pos: string; ecrPos: number; ecrPts: number; proj: number; expert: number | null; actual: number; f: Record<string, [number, number]>; mkt?: number | null }
export interface BtWeek { week: number; at: string; rows: BtRow[] }

export interface Grade { pairAcc: number; mae: number; pairs: number; n: number }
export interface MarketGrade { n: number; markets: number; experts: number; shs: number }
export interface WeekGrade { week: number; shs: Grade; ecr: Grade; sleeper: Grade; mkt: MarketGrade | null; byPos: Record<string, { shs: number; ecr: number; sleeper: number }>; biggestCalls: { id: string; pct: number; ecrPos: number; actualPosRank: number; right: boolean }[] }
export interface BacktestReport {
  weeks: WeekGrade[];
  total: { shs: Grade; ecr: Grade; sleeper: Grade };
  /** Same, with weights the backtest found work best (in-sample, so read it as an upper bound). */
  tuned: { shs: Grade; mult: Record<string, number>; expert: number } | null;
  /** Betting lines, on the players and weeks that had saved lines. */
  markets: (MarketGrade & { weeks: number; corr: number }) | null;
  factors: { key: string; corr: number; n: number; mult: number }[];
  missing: number[];
}

function asOf(ctx: LeagueContext, w: number, projStats: Map<string, Record<string, number>>, ecr: Map<string, number>): LeagueContext {
  const scoring = ctx.league.scoring_settings as Record<string, number>;
  const logs = new Map([...ctx.logs].map(([id, l]) => [id, l.filter((g) => g.week < w)]));
  const status = new Map<string, string>();
  for (const r of ctx.signals.raw.injuries) if (r.week === w && r.status) status.set(r.gsis, r.status);
  const players = new Map([...ctx.players].map(([id, p]) => [id, { ...p, injury: (p.gsis && status.get(p.gsis)) || null }]));
  const projections = new Map([...ctx.projections].map(([id, pr]) => {
    const st = projStats.get(id);
    const pts = st ? scoreSleeperStats(st, scoring, ctx.players.get(id)?.pos ?? "") : 0;
    const past = logs.get(id) ?? [];
    const base = past.length >= 2 ? past.reduce((a, g) => a + g.pts, 0) / past.length : pr.base;
    const usageFactor = usageFromLogs(ctx.players.get(id)?.pos ?? "", [...past].sort((a, b) => a.week - b.week)).usageFactor;
    return [id, { ...pr, base, usageFactor, median: pts, byWeek: { ...pr.byWeek, [w]: pts } }];
  }));
  const consensus: LeagueContext["consensus"] = {};
  for (const id of new Set([...Object.keys(ctx.consensus), ...ecr.keys()])) {
    const c = { ...(ctx.consensus[id] ?? {}) };
    delete c.w;
    if (ecr.has(id)) c.w = ecr.get(id);
    consensus[id] = c;
  }
  return {
    ...ctx, currentWeek: w, seasonOver: false, logs, players, projections, consensus,
    stats: ctx.stats.filter((s) => s.week < w), projStats: new Map([[w, projStats]]),
    signals: buildSignals(ctx.signals.raw, w, null),
  };
}

async function replayWeek(ctx: LeagueContext, w: number, snap: { at: string; rows: [string, number, number | null][] }, lines: Record<string, { lines: MarketLine[] }> | null): Promise<BtWeek> {
  const key = `keep:bt:v${VERSION}:${ctx.league.league_id}:${ctx.league.season}:${w}:${lines ? Object.keys(lines).length : 0}`;
  const hit = await kvGet(key);
  if (hit) return JSON.parse(hit.body) as BtWeek;
  const lists = await Promise.all([["QB", "RB", "WR", "TE"]].map((g) => sleeper.projections(ctx.league.season, w, g)));
  const projStats = new Map<string, Record<string, number>>();
  for (const l of lists) for (const r of l.data) projStats.set(r.id, r.stats);
  const ecr = new Map(snap.rows.map((r) => [r[0], r[1]]));
  const expertProj = new Map(snap.rows.map((r) => [r[0], r[2]]));
  const cw = asOf(ctx, w, projStats, ecr);
  const rows = rankings(cw, "week");
  const ai = shsAi(cw, rows, "week", null, { neutral: true });
  // ECR rank → points on the projection scale (same curve SHS AI uses).
  const curve = new Map<string, number[]>();
  for (const r of rows) (curve.get(r.pos) ?? curve.set(r.pos, []).get(r.pos)!).push(r.pts);
  for (const a of curve.values()) a.sort((x, y) => y - x);
  const atRank = (pos: string, k: number) => { const c = curve.get(pos) ?? []; return c[Math.min(k, c.length) - 1] ?? 0; };
  const out: BtRow[] = [];
  for (const r of rows) {
    if (r.ecrPos === null || !POS_CUT[r.pos] || r.ecrPos > POS_CUT[r.pos] * 1.5) continue;
    const g = ctx.logs.get(r.id)?.find((x) => x.week === w);
    if (!g) continue; // didn't play: not a ranking question
    const a = ai.get(r.id);
    const ml = lines?.[r.id]?.lines;
    const mk = ml?.length ? marketPoints(ml, projStats.get(r.id), ctx.league.scoring_settings as Record<string, number>, r.pos) : null;
    out.push({
      mkt: mk ? Math.round(mk.pts * 10) / 10 : null,
      id: r.id, pos: r.pos, ecrPos: r.ecrPos, ecrPts: Math.round(atRank(r.pos, r.ecrPos) * 10) / 10, proj: r.pts, expert: expertProj.get(r.id) ?? null, actual: g.pts,
      f: Object.fromEntries((a?.factors ?? []).map((f) => [f.key, [Math.round(f.value * 1000) / 1000, f.weight]])),
    });
  }
  const res: BtWeek = { week: w, at: snap.at, rows: out };
  await kvSet({ key, fetchedAt: Date.now(), body: JSON.stringify(res) });
  return res;
}

/** SHS AI points for a replayed row under given weights; weeks with saved betting lines blend them in like the live app. */
export function shsPoints(r: BtRow, expert: number, mult: Record<string, number>, mk?: { e: number; m: number; f: number }) {
  let num = 0, den = 0;
  for (const [k, [v, w]] of Object.entries(r.f)) { const ww = w * (RESEARCH.mult[k] ?? 1) * (mult[k] ?? 1); num += v * ww; den += ww; }
  const F = den ? num / den : 0;
  const pb = RESEARCH.blend ?? 0;
  const base = (1 - pb) * r.ecrPts + pb * r.proj;
  if (mk && r.mkt !== null && r.mkt !== undefined && r.ecrPts > 0.5) {
    const t = mk.e + mk.m + mk.f || 1;
    const M = Math.max(-1, Math.min(1, (r.mkt / r.ecrPts - 1) / 0.3));
    const shift = ((mk.m / t) * M + (mk.f / t) * F);
    return base * (1 + shift);
  }
  return base * (1 + (1 - expert / 100) * F);
}

function grade(list: { score: number; pred: number; actual: number; pos: string }[]): Grade {
  let good = 0, all = 0, err = 0;
  const byPos = new Map<string, typeof list>();
  for (const x of list) (byPos.get(x.pos) ?? byPos.set(x.pos, []).get(x.pos)!).push(x);
  for (const arr of byPos.values()) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j];
    if (a.actual === b.actual || a.score === b.score) continue;
    all++; if ((a.actual > b.actual) === (a.score > b.score)) good++;
  }
  for (const x of list) err += Math.abs(x.pred - x.actual);
  return { pairAcc: all ? Math.round((good / all) * 1000) / 10 : 0, mae: list.length ? Math.round((err / list.length) * 100) / 100 : 0, pairs: all, n: list.length };
}

function gradeWeeks(weeks: BtWeek[], expert: number, mult: Record<string, number>) {
  const shs = weeks.flatMap((w) => w.rows.map((r) => ({ score: shsPoints(r, expert, mult), pred: shsPoints(r, expert, mult), actual: r.actual, pos: `${w.week}:${r.pos}` })));
  return grade(shs);
}

export async function runBacktest(ctx: LeagueContext, onProgress?: (done: number, total: number) => void): Promise<BacktestReport | null> {
  const hist = await ecrWeekly(ctx.league.season).catch(() => null);
  const mh: MarketsHistory | null = (await marketsHistory(ctx.league.season).catch(() => null))?.data ?? null;
  if (!hist?.data) return null;
  const last = ctx.seasonOver ? ctx.lastWeek : ctx.currentWeek - 1;
  const want = Array.from({ length: Math.max(0, last) }, (_, i) => i + 1);
  const missing = want.filter((w) => !hist.data.weeks[w]);
  const weeks: BtWeek[] = [];
  let done = 0;
  for (const w of want) {
    const snap = hist.data.weeks[w];
    if (!snap) continue;
    try { weeks.push(await replayWeek(ctx, w, snap, mh?.weeks[String(w)] ?? null)); } catch { missing.push(w); }
    onProgress?.(++done, want.length - missing.length);
  }
  if (!weeks.length) return null;
  const cfg: ShsWeights = { ...DEFAULT_SHS, ...(getSettings().shs ?? {}) };
  const userMult = cfg.factor;
  const mkw = { e: cfg.wkExpert, m: cfg.wkMarket, f: cfg.wkFactors };
  // On players with saved lines: markets alone vs experts vs SHS AI (with lines blended in).
  const mgrade = (rs: BtRow[]): MarketGrade | null => {
    const sub = rs.filter((r) => r.mkt !== null && r.mkt !== undefined);
    if (sub.length < 8) return null;
    const L = (f: (r: BtRow) => number) => sub.map((r) => ({ score: f(r), pred: f(r), actual: r.actual, pos: r.pos }));
    return { n: sub.length, markets: grade(L((r) => r.mkt!)).pairAcc, experts: grade(L((r) => -r.ecrPos)).pairAcc, shs: grade(L((r) => shsPoints(r, cfg.wkNoMkt, userMult, mkw))).pairAcc };
  };

  const weekGrades: WeekGrade[] = weeks.map((wk) => {
    const L = (f: (r: BtRow) => { score: number; pred: number }) => wk.rows.map((r) => ({ ...f(r), actual: r.actual, pos: r.pos }));
    const shsL = L((r) => { const v = shsPoints(r, cfg.wkNoMkt, userMult, mkw); return { score: v, pred: v }; });
    const ecrL = L((r) => ({ score: -r.ecrPos, pred: r.ecrPts }));
    const slL = L((r) => ({ score: r.proj, pred: r.proj }));
    const byPos: WeekGrade["byPos"] = {};
    for (const pos of Object.keys(POS_CUT)) {
      const f = (l: typeof shsL) => grade(l.filter((x) => x.pos === pos)).pairAcc;
      byPos[pos] = { shs: f(shsL), ecr: f(ecrL), sleeper: f(slL) };
    }
    // Biggest disagreements with the experts, and whether SHS AI was right.
    const actualRank = new Map<string, number>();
    for (const pos of Object.keys(POS_CUT)) wk.rows.filter((r) => r.pos === pos).sort((a, b) => b.actual - a.actual).forEach((r, i) => actualRank.set(r.id, i + 1));
    const calls = wk.rows.map((r) => ({ r, pct: Math.round((shsPoints(r, cfg.wkNoMkt, userMult) / Math.max(0.5, r.ecrPts) - 1) * 100) }))
      .filter((x) => Math.abs(x.pct) >= 5).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 6)
      .map(({ r, pct }) => ({ id: r.id, pct, ecrPos: r.ecrPos, actualPosRank: actualRank.get(r.id)!, right: pct > 0 ? actualRank.get(r.id)! < r.ecrPos : actualRank.get(r.id)! > r.ecrPos }));
    return { week: wk.week, shs: grade(shsL), ecr: grade(ecrL), sleeper: grade(slL), mkt: mgrade(wk.rows), byPos, biggestCalls: calls };
  });

  const all = (f: (r: BtRow) => { score: number; pred: number }) => grade(weeks.flatMap((wk) => wk.rows.map((r) => ({ ...f(r), actual: r.actual, pos: `${wk.week}:${r.pos}` }))));
  const total = {
    shs: all((r) => { const v = shsPoints(r, cfg.wkNoMkt, userMult, mkw); return { score: v, pred: v }; }),
    ecr: all((r) => ({ score: -r.ecrPos, pred: r.ecrPts })),
    sleeper: all((r) => ({ score: r.proj, pred: r.proj })),
  };

  // Factor diagnostics: does each factor predict beating (or missing) the expert rank?
  const keys = [...new Set(weeks.flatMap((w) => w.rows.flatMap((r) => Object.keys(r.f))))];
  const factors = keys.map((k) => {
    const xs: number[] = [], ys: number[] = [];
    for (const wk of weeks) for (const pos of Object.keys(POS_CUT)) {
      const arr = wk.rows.filter((r) => r.pos === pos);
      const n = arr.length;
      if (n < 4) continue;
      const byA = [...arr].sort((a, b) => a.actual - b.actual), byE = [...arr].sort((a, b) => b.ecrPos - a.ecrPos);
      for (const r of arr) if (r.f[k]) { xs.push(r.f[k][0]); ys.push(byA.indexOf(r) / (n - 1) - byE.indexOf(r) / (n - 1)); }
    }
    return { key: k, corr: Math.round(corr(xs, ys) * 1000) / 1000, n: xs.length, mult: 1 };
  });

  // Tune: coordinate search over factor multipliers and the expert share, then shrink halfway back to default.
  let tuned: BacktestReport["tuned"] = null;
  if (weeks.length >= 4) {
    const mult: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 1]));
    let expert = 75;
    const score = () => gradeWeeks(weeks, expert, mult).pairAcc;
    let best = score();
    for (let pass = 0; pass < 2; pass++) {
      for (const k of keys) {
        for (const m of [0, 0.5, 1, 1.5, 2]) { const old = mult[k]; mult[k] = m; const s = score(); if (s > best + 0.05) best = s; else mult[k] = old; }
      }
      for (const e of [60, 65, 70, 75, 80, 85, 90]) { const old = expert; expert = e; const s = score(); if (s > best + 0.05) best = s; else expert = old; }
    }
    const shrunk = Object.fromEntries(keys.map((k) => [k, Math.round((1 + (mult[k] - 1) / 2) * 100) / 100]));
    tuned = { shs: gradeWeeks(weeks, expert, mult), mult: shrunk, expert };
    for (const f of factors) f.mult = shrunk[f.key] ?? 1;
    try { localStorage.setItem(`fhq-tune-${ctx.league.league_id}`, JSON.stringify(shrunk)); } catch { /* ignore */ }
  }
  // Betting lines' own signal: does "markets above his expert rank" predict beating it?
  let markets: BacktestReport["markets"] = null;
  const mRows = weeks.flatMap((wk) => wk.rows.filter((r) => r.mkt != null).map((r) => ({ wk: wk.week, r })));
  if (mRows.length >= 8) {
    const g = mgrade(mRows.map((x) => ({ ...x.r, pos: `${x.wk}:${x.r.pos}` })))!;
    const xs: number[] = [], ys: number[] = [];
    for (const wk of weeks) for (const pos of Object.keys(POS_CUT)) {
      const arr = wk.rows.filter((r) => r.pos === pos && r.mkt != null); const n = arr.length; if (n < 4) continue;
      const byA = [...arr].sort((a, b) => a.actual - b.actual), byE = [...arr].sort((a, b) => b.ecrPos - a.ecrPos);
      for (const r of arr) { xs.push(r.mkt! / Math.max(0.5, r.ecrPts) - 1); ys.push(byA.indexOf(r) / (n - 1) - byE.indexOf(r) / (n - 1)); }
    }
    markets = { ...g, weeks: new Set(mRows.map((x) => x.wk)).size, corr: Math.round(corr(xs, ys) * 1000) / 1000 };
  }
  return { weeks: weekGrades, total, tuned, markets, factors: factors.sort((a, b) => b.corr - a.corr), missing };
}

function corr(xs: number[], ys: number[]) {
  const n = xs.length; if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : 0;
}
