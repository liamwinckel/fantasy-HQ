/**
 * NFLverse CSV parsing. Runs in the data job (scripts/build-data.ts), which turns the CSVs into
 * compact JSON the web app downloads. Kept free of Node-only imports.
 */
import Papa from "papaparse";
import type { Contract, Game, InjuryReport, NflPlayerInfo, SnapRow, WeekStat } from "./types";

/** NFLverse uses "LA" for the Rams; Sleeper uses "LAR". */
export const toSleeperTeam = (t: string) => (t === "LA" ? "LAR" : t);

export function parseCsv(body: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(body, { header: true, skipEmptyLines: true }).data;
}
const n = (v: string | undefined) => (v === undefined || v === "" || v === "NA" ? 0 : Number(v) || 0);

export const parseWeekly = (body: string): WeekStat[] =>
  parseCsv(body)
        .filter((r) => r.season_type === "REG" && r.player_id)
        .map((r) => ({
          gsis: r.player_id, week: n(r.week), position: r.position, team: toSleeperTeam(r.team), opp: toSleeperTeam(r.opponent_team),
          att: n(r.attempts), cmp: n(r.completions), passYd: n(r.passing_yards), passTd: n(r.passing_tds), int: n(r.passing_interceptions),
          pass2pt: n(r.passing_2pt_conversions), sacks: n(r.sacks_suffered),
          car: n(r.carries), rushYd: n(r.rushing_yards), rushTd: n(r.rushing_tds), rush2pt: n(r.rushing_2pt_conversions), rushFd: n(r.rushing_first_downs),
          tgt: n(r.targets), rec: n(r.receptions), recYd: n(r.receiving_yards), recTd: n(r.receiving_tds), rec2pt: n(r.receiving_2pt_conversions),
          recFd: n(r.receiving_first_downs), tgtShare: n(r.target_share), airShare: n(r.air_yards_share),
          fumLost: n(r.rushing_fumbles_lost) + n(r.receiving_fumbles_lost) + n(r.sack_fumbles_lost),
          fgm0_19: n(r.fg_made_0_19), fgm20_29: n(r.fg_made_20_29), fgm30_39: n(r.fg_made_30_39), fgm40_49: n(r.fg_made_40_49),
          fgm50p: n(r.fg_made_50_59) + n(r.fg_made_60_), fgMiss: n(r.fg_missed), xpm: n(r.pat_made), xpMiss: n(r.pat_missed),
          tklSolo: n(r.def_tackles_solo), tklAst: n(r.def_tackle_assists), tfl: n(r.def_tackles_for_loss), sack: n(r.def_sacks),
          qbHit: n(r.def_qb_hits), defInt: n(r.def_interceptions), pd: n(r.def_pass_defended), ff: n(r.def_fumbles_forced),
          fr: n(r.fumble_recovery_opp), defTd: n(r.def_tds), safety: n(r.def_safeties),
          pprPoints: n(r.fantasy_points_ppr),
        }));

export const parseSchedule = (body: string, season: string): Game[] =>
  parseCsv(body)
        .filter((r) => r.season === season && r.game_type === "REG")
        .map((r) => ({
          week: n(r.week), home: toSleeperTeam(r.home_team), away: toSleeperTeam(r.away_team),
          kickoff: r.gameday ? `${r.gameday}T${r.gametime || "13:00"}` : null,
          homeScore: r.home_score === "" || r.home_score === "NA" ? null : n(r.home_score),
          awayScore: r.away_score === "" || r.away_score === "NA" ? null : n(r.away_score),
          roof: r.roof && r.roof !== "NA" ? r.roof : null,
          neutral: r.location === "Neutral",
          homeCoach: r.home_coach && r.home_coach !== "NA" ? r.home_coach : null,
          awayCoach: r.away_coach && r.away_coach !== "NA" ? r.away_coach : null,
          spread: r.spread_line && r.spread_line !== "NA" ? n(r.spread_line) : null,
          total: r.total_line && r.total_line !== "NA" ? n(r.total_line) : null,
          wind: r.wind && r.wind !== "NA" ? n(r.wind) : null,
          homeRest: r.home_rest && r.home_rest !== "NA" ? n(r.home_rest) : null,
          awayRest: r.away_rest && r.away_rest !== "NA" ? n(r.away_rest) : null,
        }));

export interface CombineRow { gsis: string; forty: number | null; wt: number | null; vertical: number | null; broad: number | null; cone: number | null; shuttle: number | null; draftYear: number | null }

/** NFL Combine results, keyed to GSIS IDs through the players file's PFR IDs. */
export function parseCombine(body: string, pfrToGsis: Map<string, string>): CombineRow[] {
  const v = (x: string | undefined) => (x === undefined || x === "" || x === "NA" ? null : Number(x) || null);
  const out: CombineRow[] = [];
  for (const r of parseCsv(body)) {
    const gsis = r.pfr_id ? pfrToGsis.get(r.pfr_id) : undefined;
    if (!gsis) continue;
    out.push({ gsis, forty: v(r.forty), wt: v(r.wt), vertical: v(r.vertical), broad: v(r.broad_jump), cone: v(r.cone), shuttle: v(r.shuttle), draftYear: v(r.draft_year) });
  }
  return out;
}

export function parsePlayers(body: string): NflPlayerInfo[] {
      const map = new Map<string, NflPlayerInfo>();
      for (const r of parseCsv(body)) {
        if (!r.gsis_id) continue;
        map.set(r.gsis_id, {
          gsis: r.gsis_id, pfr: r.pfr_id || null, birthDate: r.birth_date || null,
          draftRound: r.draft_round && r.draft_round !== "NA" ? n(r.draft_round) : null,
          draftPick: r.draft_pick && r.draft_pick !== "NA" ? n(r.draft_pick) : null,
          rookieSeason: r.rookie_season ? n(r.rookie_season) : null,
          otc: r.otc_id && r.otc_id !== "NA" ? r.otc_id : null,
          height: r.height && r.height !== "NA" ? r.height : null,
          weight: r.weight && r.weight !== "NA" ? n(r.weight) : null,
          college: r.college_name && r.college_name !== "NA" ? r.college_name : null,
        });
      }
      return [...map.values()];
}

export const parseSnaps = (body: string): SnapRow[] =>
  parseCsv(body)
        .filter((r) => r.game_type === "REG" && r.pfr_player_id && n(r.offense_snaps) > 0)
        .map((r) => ({ pfr: r.pfr_player_id, week: n(r.week), pct: n(r.offense_pct), snaps: n(r.offense_snaps) }));

export function parseContracts(body: string): Contract[] {
      const map = new Map<string, Contract>();
      for (const r of parseCsv(body)) {
        if (r.is_active !== "TRUE" || !r.otc_id) continue;
        const yearSigned = n(r.year_signed);
        const years = n(r.years);
        const c = { otc: r.otc_id, team: r.team, yearSigned, years, endYear: yearSigned + Math.max(1, years) - 1, apy: n(r.apy), guaranteed: n(r.guaranteed), capPct: n(r.apy_cap_pct) };
        const prev = map.get(r.otc_id);
        if (!prev || prev.yearSigned < yearSigned) map.set(r.otc_id, c);
      }
      return [...map.values()];
}

export const parseInjuries = (body: string): InjuryReport[] =>
  parseCsv(body)
        .filter((r) => r.game_type === "REG" && r.gsis_id && ((r.report_status && r.report_status !== "NA") || (r.practice_status && r.practice_status !== "NA")))
        .map((r) => ({ gsis: r.gsis_id, season: n(r.season), week: n(r.week), status: r.report_status && r.report_status !== "NA" ? r.report_status : "",
          injury: r.report_primary_injury || r.practice_primary_injury || "", practice: practiceCode(r.practice_status, r.practice_primary_injury),
          team: r.team ? toSleeperTeam(r.team) : undefined, position: r.position || undefined }));

/** Practice participation: DNP / LP (limited) / FP (full); "" when not listed or a rest day. */
export function practiceCode(status: string | undefined, injury: string | undefined): string {
  if (!status || status === "NA") return "";
  if (/not injury related|rest/i.test(injury ?? "")) return "";
  if (/did not/i.test(status)) return "DNP";
  if (/limited/i.test(status)) return "LP";
  if (/full/i.test(status)) return "FP";
  return "";
}
