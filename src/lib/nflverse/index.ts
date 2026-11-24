/**
 * NFLverse data for the web app. A scheduled GitHub Action (scripts/build-data.ts) downloads the
 * NFLverse CSVs, trims them and publishes compact JSON next to the site; this module reads that JSON.
 */
import { cached } from "../cache";
import { dataUrl, fetchText } from "../net";
import type { Contract, Game, InjuryReport, NflPlayerInfo, SnapRow, WeekStat } from "./types";

export type { Contract, Game, InjuryReport, NflPlayerInfo, SnapRow, WeekStat };
export { toSleeperTeam } from "./parse";

const HOUR = 3_600_000;
const get = (file: string) => () => fetchText(dataUrl(file), 60_000);

/** Columnar JSON → rows. */
export function fromColumns<T>(body: string): T[] {
  const { cols, rows } = JSON.parse(body) as { cols: string[]; rows: unknown[][] };
  return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])) as T);
}

export const weeklyStats = (season: string, force = false) =>
  cached(`nflverse:stats:${season}`, "nflverse", 6 * HOUR, get(`stats-${season}.json`), (b) => fromColumns<WeekStat>(b), { force });

export const schedule = (season: string, force = false) =>
  cached(`nflverse:schedule:${season}`, "nflverse", 6 * HOUR, get(`schedule-${season}.json`), (b) => JSON.parse(b) as Game[], { force });

export const playerInfo = (force = false) =>
  cached("nflverse:players", "nflverse", 24 * HOUR, get("players.json"), (b) => new Map(fromColumns<NflPlayerInfo>(b).map((p) => [p.gsis, p])), { force });

export const snapCounts = (season: string, force = false) =>
  cached(`nflverse:snaps:${season}`, "nflverse", 6 * HOUR, get(`snaps-${season}.json`), (b) => fromColumns<SnapRow>(b), { force });

export const contracts = (force = false) =>
  cached("nflverse:contracts", "nflverse", 24 * HOUR, get("contracts.json"), (b) => new Map(fromColumns<Contract>(b).map((c) => [c.otc, c])), { force });

export const injuryReports = (season: string, force = false) =>
  cached(`nflverse:injuries:${season}`, "nflverse", 6 * HOUR, get(`injuries-${season}.json`), (b) => fromColumns<InjuryReport>(b), { force });

/** FantasyPros expert consensus + dynasty market values, keyed by Sleeper player ID. */
export interface ConsensusFile { ecrDate: string; weeklyDate: string; source: string; players: Record<string, import("../engine/values").Consensus> }
export const consensus = (force = false) =>
  cached("data:consensus", "nflverse", 6 * HOUR, get("consensus.json"), (b) => JSON.parse(b) as ConsensusFile, { force });

export type { CombineRow } from "./parse";
export const combine = (force = false) =>
  cached("nflverse:combine", "nflverse", 24 * HOUR, get("combine.json"), (b) => new Map(fromColumns<import("./parse").CombineRow>(b).map((c) => [c.gsis, c])), { force });

// ---- SHS AI signals (all optional: a missing file just drops that factor) ----
import type { NgsRow, NgsWeek, PfrRow, PfrWeek, XfpRow } from "./signals";
import type { MarketsFile } from "../markets";
export type { NgsRow, NgsWeek, PfrRow, PfrWeek, XfpRow };
export const xfp = (season: string, force = false) =>
  cached(`nflverse:xfp:${season}`, "nflverse", 6 * HOUR, get(`xfp-${season}.json`), (b) => fromColumns<XfpRow>(b), { force });
export const ngs = (season: string, force = false) =>
  cached(`nflverse:ngs2:${season}`, "nflverse", 6 * HOUR, get(`ngs-${season}.json`), (b) => fromColumns<NgsWeek>(b), { force });
export const pfrAdv = (season: string, force = false) =>
  cached(`nflverse:pfr2:${season}`, "nflverse", 6 * HOUR, get(`pfr-${season}.json`), (b) => fromColumns<PfrWeek>(b), { force });
/** Weekly expert rankings as they stood before each week's games: week → [sleeperId, ecr, expert projection][]. */
export interface EcrWeekly { season: number; weeks: Record<string, { at: string; rows: [string, number, number | null][] }> }
export const ecrWeekly = (season: string, force = false) =>
  cached(`data:ecrweekly:${season}`, "nflverse", 6 * HOUR, get(`ecr-weekly-${season}.json`), (b) => JSON.parse(b) as EcrWeekly, { force });
/** Prediction-market lines; refreshed hourly on game days, so cache briefly. */
export const markets = (force = false) =>
  cached("data:markets", "nflverse", 20 * 60_000, get("markets.json"), (b) => JSON.parse(b) as MarketsFile, { force });
