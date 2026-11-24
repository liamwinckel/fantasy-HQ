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
type Acc = { w: number; s: number };
const add = (a: Acc | undefined, v: number | null, w: number): Acc => { const o = a ?? { w: 0, s: 0 }; if (v !== null && w > 0) { o.w += w; o.s += v * w; } return o; };
const avg = (a: Acc | undefined) => (a && a.w ? a.s / a.w : null);

/** Season-to-date NGS per player (weighted by targets / carries / attempts over regular-season weeks). */
export function parseNgs(rec: string, rush: string, pass: string, season: number): NgsRow[] {
  const out = new Map<string, { sep?: Acc; yacoe?: Acc; ryoe?: Acc; cpoe?: Acc; tgt: number; att: number }>();
  const get = (id: string) => out.get(id) ?? out.set(id, { tgt: 0, att: 0 }).get(id)!;
  const weekly = (rows: Record<string, string>[]) => rows.filter((r) => Number(r.season) === season && r.season_type === "REG" && Number(r.week) > 0 && r.player_gsis_id);
  for (const r of weekly(parseCsv(rec))) {
    const o = get(r.player_gsis_id), t = n(r.targets) ?? 0;
    o.sep = add(o.sep, n(r.avg_separation), t); o.yacoe = add(o.yacoe, n(r.avg_yac_above_expectation), n(r.receptions) ?? 0); o.tgt += t;
  }
  for (const r of weekly(parseCsv(rush))) {
    const o = get(r.player_gsis_id), a = n(r.rush_attempts) ?? 0;
    o.ryoe = add(o.ryoe, n(r.rush_yards_over_expected_per_att), a); o.att += a;
  }
  for (const r of weekly(parseCsv(pass))) {
    const o = get(r.player_gsis_id), a = n(r.attempts) ?? 0;
    o.cpoe = add(o.cpoe, n(r.completion_percentage_above_expectation), a); o.att += a;
  }
  return [...out].map(([gsis, o]) => ({ gsis, sep: r2(avg(o.sep)), yacoe: r2(avg(o.yacoe)), ryoe: r2(avg(o.ryoe)), cpoe: r2(avg(o.cpoe)), tgt: o.tgt, att: o.att }));
}

export interface PfrRow { gsis: string; games: number; yacoAtt: number | null; btPerG: number | null; dropPct: number | null; tgtRating: number | null; badPct: number | null; pressPct: number | null }
/** Season-to-date PFR advanced stats per player. */
export function parsePfrAdv(rec: string, rush: string, pass: string, pfrToGsis: Map<string, string>, season: number): PfrRow[] {
  type A = { games: Set<number>; carries: number; yaco: number; bt: number; drop: Acc; rat: Acc; bad: Acc; press: Acc };
  const out = new Map<string, A>();
  const get = (pfr: string) => { const g = pfrToGsis.get(pfr); if (!g) return null; return out.get(g) ?? out.set(g, { games: new Set(), carries: 0, yaco: 0, bt: 0, drop: { w: 0, s: 0 }, rat: { w: 0, s: 0 }, bad: { w: 0, s: 0 }, press: { w: 0, s: 0 } }).get(g)!; };
  const reg = (rows: Record<string, string>[]) => rows.filter((r) => Number(r.season) === season && r.game_type === "REG" && r.pfr_player_id);
  for (const r of reg(parseCsv(rush))) {
    const o = get(r.pfr_player_id); if (!o) continue;
    o.games.add(Number(r.week)); o.carries += n(r.carries) ?? 0; o.yaco += n(r.rushing_yards_after_contact) ?? 0; o.bt += n(r.rushing_broken_tackles) ?? 0;
  }
  for (const r of reg(parseCsv(rec))) {
    const o = get(r.pfr_player_id); if (!o) continue;
    o.games.add(Number(r.week)); o.bt += n(r.receiving_broken_tackles) ?? 0;
    add(o.drop, n(r.receiving_drop_pct), 1); add(o.rat, n(r.receiving_rat), 1);
  }
  for (const r of reg(parseCsv(pass))) {
    const o = get(r.pfr_player_id); if (!o) continue;
    o.games.add(Number(r.week)); add(o.bad, n(r.passing_bad_throw_pct), 1); add(o.press, n(r.times_pressured_pct), 1);
  }
  return [...out].map(([gsis, o]) => ({
    gsis, games: o.games.size, yacoAtt: o.carries >= 10 ? r2(o.yaco / o.carries) : null, btPerG: o.games.size ? r2(o.bt / o.games.size) : null,
    dropPct: r2(avg(o.drop)), tgtRating: r2(avg(o.rat)), badPct: r2(avg(o.bad)), pressPct: r2(avg(o.press)),
  }));
}
