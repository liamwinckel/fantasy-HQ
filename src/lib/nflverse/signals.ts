/**
 * Advanced player signals for SHS AI, parsed in the data job:
 *   xFP  — expected fantasy points from each player's actual opportunities (ffopportunity model)
 *   NGS  — tracking data: separation, YAC over expected, rush yards over expected, CPOE
 *   PFR  — charting: yards after contact, broken tackles, drops, rating when targeted, bad throws, pressure
 * Each is reduced to one season-to-date row per player (GSIS ID).
 */
import { parseCsv } from "./parse";

const n = (v: string | undefined) => (v === undefined || v === "" || v === "NA" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const r2 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

export interface XfpRow { gsis: string; week: number; xfp: number; fp: number }
export function parseXfp(body: string, season: number): XfpRow[] {
  return parseCsv(body)
    .filter((r) => Number(r.season) === season && r.player_id && n(r.total_fantasy_points_exp) !== null)
    .map((r) => ({ gsis: r.player_id, week: Number(r.week), xfp: r2(n(r.total_fantasy_points_exp))!, fp: r2(n(r.total_fantasy_points) ?? 0)! }));
}

export interface NgsRow { gsis: string; sep: number | null; yacoe: number | null; ryoe: number | null; cpoe: number | null; tgt: number; att: number }
/** One player-week of tracking data (weights let weeks be combined). */
export interface NgsWeek { gsis: string; week: number; sep: number | null; yacoe: number | null; ryoe: number | null; cpoe: number | null; tgt: number; rec: number; ratt: number; patt: number }
type Acc = { w: number; s: number };
const add = (a: Acc | undefined, v: number | null, w: number): Acc => { const o = a ?? { w: 0, s: 0 }; if (v !== null && w > 0) { o.w += w; o.s += v * w; } return o; };
const avg = (a: Acc | undefined) => (a && a.w ? a.s / a.w : null);

/** Weekly NGS rows for one regular season. */
export function parseNgs(rec: string, rush: string, pass: string, season: number): NgsWeek[] {
  const out = new Map<string, NgsWeek>();
  const get = (id: string, week: number) => { const k = `${id}:${week}`; return out.get(k) ?? out.set(k, { gsis: id, week, sep: null, yacoe: null, ryoe: null, cpoe: null, tgt: 0, rec: 0, ratt: 0, patt: 0 }).get(k)!; };
  const weekly = (rows: Record<string, string>[]) => rows.filter((r) => Number(r.season) === season && r.season_type === "REG" && Number(r.week) > 0 && r.player_gsis_id);
  for (const r of weekly(parseCsv(rec))) { const o = get(r.player_gsis_id, Number(r.week)); o.sep = r2(n(r.avg_separation)); o.yacoe = r2(n(r.avg_yac_above_expectation)); o.tgt = n(r.targets) ?? 0; o.rec = n(r.receptions) ?? 0; }
  for (const r of weekly(parseCsv(rush))) { const o = get(r.player_gsis_id, Number(r.week)); o.ryoe = r2(n(r.rush_yards_over_expected_per_att)); o.ratt = n(r.rush_attempts) ?? 0; }
  for (const r of weekly(parseCsv(pass))) { const o = get(r.player_gsis_id, Number(r.week)); o.cpoe = r2(n(r.completion_percentage_above_expectation)); o.patt = n(r.attempts) ?? 0; }
  return [...out.values()];
}
/** Season-to-date tracking per player, using weeks before `beforeWeek` only. */
export function aggregateNgs(rows: NgsWeek[], beforeWeek: number): Map<string, NgsRow> {
  const acc = new Map<string, { sep?: Acc; yacoe?: Acc; ryoe?: Acc; cpoe?: Acc; tgt: number; att: number }>();
  for (const r of rows) {
    if (r.week >= beforeWeek) continue;
    const o = acc.get(r.gsis) ?? acc.set(r.gsis, { tgt: 0, att: 0 }).get(r.gsis)!;
    o.sep = add(o.sep, r.sep, r.tgt); o.yacoe = add(o.yacoe, r.yacoe, r.rec); o.ryoe = add(o.ryoe, r.ryoe, r.ratt); o.cpoe = add(o.cpoe, r.cpoe, r.patt);
    o.tgt += r.tgt; o.att += r.ratt + r.patt;
  }
  return new Map([...acc].map(([gsis, o]) => [gsis, { gsis, sep: r2(avg(o.sep)), yacoe: r2(avg(o.yacoe)), ryoe: r2(avg(o.ryoe)), cpoe: r2(avg(o.cpoe)), tgt: o.tgt, att: o.att }]));
}

export interface PfrRow { gsis: string; games: number; yacoAtt: number | null; btPerG: number | null; dropPct: number | null; tgtRating: number | null; badPct: number | null; pressPct: number | null }
export interface PfrWeek { gsis: string; week: number; carries: number; yaco: number; bt: number; drop: number | null; rat: number | null; bad: number | null; press: number | null }
/** Weekly PFR advanced rows for one regular season. */
export function parsePfrAdv(rec: string, rush: string, pass: string, pfrToGsis: Map<string, string>, season: number): PfrWeek[] {
  const out = new Map<string, PfrWeek>();
  const get = (pfr: string, week: number) => { const g = pfrToGsis.get(pfr); if (!g) return null; const k = `${g}:${week}`; return out.get(k) ?? out.set(k, { gsis: g, week, carries: 0, yaco: 0, bt: 0, drop: null, rat: null, bad: null, press: null }).get(k)!; };
  const reg = (rows: Record<string, string>[]) => rows.filter((r) => Number(r.season) === season && r.game_type === "REG" && r.pfr_player_id);
  for (const r of reg(parseCsv(rush))) { const o = get(r.pfr_player_id, Number(r.week)); if (!o) continue; o.carries += n(r.carries) ?? 0; o.yaco += n(r.rushing_yards_after_contact) ?? 0; o.bt += n(r.rushing_broken_tackles) ?? 0; }
  for (const r of reg(parseCsv(rec))) { const o = get(r.pfr_player_id, Number(r.week)); if (!o) continue; o.bt += n(r.receiving_broken_tackles) ?? 0; o.drop = r2(n(r.receiving_drop_pct)); o.rat = r2(n(r.receiving_rat)); }
  for (const r of reg(parseCsv(pass))) { const o = get(r.pfr_player_id, Number(r.week)); if (!o) continue; o.bad = r2(n(r.passing_bad_throw_pct)); o.press = r2(n(r.times_pressured_pct)); }
  return [...out.values()];
}
/** Season-to-date charting per player, weeks before `beforeWeek` only. */
export function aggregatePfr(rows: PfrWeek[], beforeWeek: number): Map<string, PfrRow> {
  type A = { games: number; carries: number; yaco: number; bt: number; drop: Acc; rat: Acc; bad: Acc; press: Acc };
  const acc = new Map<string, A>();
  for (const r of rows) {
    if (r.week >= beforeWeek) continue;
    const o = acc.get(r.gsis) ?? acc.set(r.gsis, { games: 0, carries: 0, yaco: 0, bt: 0, drop: { w: 0, s: 0 }, rat: { w: 0, s: 0 }, bad: { w: 0, s: 0 }, press: { w: 0, s: 0 } }).get(r.gsis)!;
    o.games++; o.carries += r.carries; o.yaco += r.yaco; o.bt += r.bt;
    add(o.drop, r.drop, 1); add(o.rat, r.rat, 1); add(o.bad, r.bad, 1); add(o.press, r.press, 1);
  }
  return new Map([...acc].map(([gsis, o]) => [gsis, {
    gsis, games: o.games, yacoAtt: o.carries >= 10 ? r2(o.yaco / o.carries) : null, btPerG: o.games ? r2(o.bt / o.games) : null,
    dropPct: r2(avg(o.drop)), tgtRating: r2(avg(o.rat)), badPct: r2(avg(o.bad)), pressPct: r2(avg(o.press)),
  }]));
}
