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
