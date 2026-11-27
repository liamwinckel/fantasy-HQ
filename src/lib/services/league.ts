import { sleeper } from "../sleeper/client";
import type { DraftPick, League, Matchup, Player, Roster, SleeperUser, Transaction } from "../sleeper/types";
import { combine, consensus, contracts, injuryReports, type CombineRow, playerInfo, returnStats, schedule, snapCounts, weeklyStats, type Contract, type Game, type WeekStat } from "../nflverse";
import { canFill, isSuperflex, playerPositions, primaryPosition, starterDemand, startingSlots } from "../engine/positions";
import { scoreSleeperStats, scoreStatLine, scoringLabel } from "../engine/scoring";
import { applySleeper, opportunityOf, priorFor, project, type GameLog, type PlayerLite, type Projection } from "../engine/projections";
import { applyKeeperBonus, bendDynasty, blendWithMarket, computeValues, replacementLevels, type Consensus, type PlayerValue } from "../engine/values";
import { optimizeLineup, lineupTotal, scoreStarters, type SlotAssignment } from "../engine/lineup";
import { simulateSeason, type SimResult, type TeamWeek } from "../engine/simulate";
import { classifyTeams, type Classification, type TeamClass, type TeamMetrics } from "../engine/classify";
import { emptySignals, loadSignals, type Signals } from "./signals";
import { buildPicks, marketForPick, type PickAsset, type Tier } from "../engine/picks";
import { easternToEpoch } from "../time";
import { getSettings, type Mode } from "../settings";
import { keeperPlan } from "../engine/keepers";
import { keeperRulesFor } from "./keeperRules";

export type LeagueFormat = "redraft" | "keeper" | "dynasty";

export interface PlayerExtras {
  contract: Contract | null;
  yearsLeft: number | null; // seasons left after this one (0 = expiring)
  contractFactor: number; // dynasty multiplier
  durability: number; // dynasty multiplier from games played
  durabilityPct: number; // % of team games played, last season + this season
  gamesPlayed: number;
  gamesPossible: number;
  reportsOut: number; // weeks listed Out on official reports, last season + this season
  recentInjuries: string[];
  prevSeason: { games: number; ppg: number } | null;
  offense: { ppg: number; rank: number; factor: number; trend: number } | null;
  outlookRos: number; // avg opponent factor for remaining weeks (1 = average, >1 = easier)
  outlookPlayoffs: number;
  height: string | null;
  weight: number | null;
  college: string | null;
  number: number | null;
  draftRound: number | null;
  draftPick: number | null;
}

export interface TeamInfo {
  rosterId: number;
  ownerId: string | null;
  name: string; // team name or display name
  manager: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
  players: string[];
  reserve: string[];
  taxi: string[];
  starters: string[]; // current week's set lineup
}

export interface LineupState {
  current: SlotAssignment[];
  optimal: SlotAssignment[];
  currentTotal: number;
  optimalTotal: number;
  gain: number;
  locked: string[];
}

export interface LeagueContext {
  league: League;
  format: LeagueFormat;
  valuationMode: Mode;
  scoring: string;
  superflex: boolean;
  teamsCount: number;
  currentWeek: number;
  playoffStart: number;
  lastWeek: number;
  inPlayoffs: boolean;
  seasonOver: boolean;
  teams: TeamInfo[];
  myRosterId: number | null;
  players: Map<string, PlayerLite>;
  projections: Map<string, Projection>;
  values: Map<string, PlayerValue>;
  replacement: Record<string, number>;
  waiverLevel: Record<string, number>;
  /** FantasyPros expert consensus (ECR) by Sleeper ID, and its dates. */
  consensus: Record<string, Consensus>;
  /** Keeper leagues: next-season keeper surplus (pts/g above what that keeper round returns), by player. */
  keeperSurplus: Map<string, number>;
  /** Keeper leagues: next season's keep price (round) and surplus (+ cheap for what he's worth, − overpriced) for rostered players. */
  keeperCost: Map<string, { round: number; surplus: number }>;
  /** How far expert ranks can be trusted per player (1 = fully; lower for return-yard specialists in leagues that score returns). */
  marketTrust: Map<string, number>;
  /** NFL teams whose game this week has kicked off (live or final). */
  startedTeams: Set<string>;
  /** NFL schedule this season (kickoffs, roof, coaches, Vegas lines). */
  games: Game[];
  /** Head coach of each NFL team last season. */
  prevCoach: Map<string, string>;
  /** NFL Combine results by GSIS ID. */
  combine: Map<string, CombineRow>;
  consensusDates: { ecr: string; weekly: string } | null;
  /** Sleeper's projected stat lines: week → player → stats (Sleeper keys). */
  projStats: Map<number, Map<string, Record<string, number>>>;
  /** SHS AI inputs: expected points, Next Gen Stats, PFR charting, prediction markets, practice reports. */
  signals: Signals;
  /** NFLverse weekly stat lines for this season (all players). */
  stats: WeekStat[];
  logs: Map<string, GameLog[]>;
  lineups: Map<number, LineupState>;
  weekStrength: Map<number, Map<number, TeamWeek>>;
  sim: SimResult;
  /** Remaining regular-season pairings: week → [rosterA, rosterB][] */
  remainingSchedule: Record<number, [number, number][]>;
  classifications: Map<number, Classification & { override?: TeamClass; overrideNote?: string | null }>;
  picks: PickAsset[];
  matchupsThisWeek: Matchup[];
  /** All loaded weeks, index 0 = week 1. Future regular-season weeks carry Sleeper's schedule pairings. */
  matchupsByWeek: Matchup[][];
  /** Projected points of each team's best healthy lineup (structural strength). */
  healthyStrength: Map<number, number>;
  /** Contender/Pretender/Rebuilder/Tanking only apply to dynasty valuation. */
  showClasses: boolean;
  /** Durability, contract, last season, offense, schedule outlook, bio. */
  extras: Map<string, PlayerExtras>;
  /** NFL team → week → opponent (absent = bye) */
  nflOpponents: Map<string, Map<number, string>>;
  liveScore: Map<number, { actual: number; projected: TeamWeek }>;
  /** This season's league transactions (adds, drops, trades). */
  transactions: Transaction[];
  /** Name and position of anyone in a transaction (including players not otherwise tracked). */
  txNames: Record<string, string>;
  fetchedAt: number;
  stale: boolean;
  warnings: string[];
}

const cacheByLeague = new Map<string, { at: number; ctx: Promise<LeagueContext> }>();
const CONTEXT_TTL = 10 * 60_000;

export function getLeagueContext(leagueId: string, opts: { userId: string | null; mode?: Mode; force?: boolean; manualTiers?: Record<string, Tier> } ) {
  const key = `${leagueId}:${opts.mode ?? "auto"}:${JSON.stringify(opts.manualTiers ?? {})}`;
  const hit = cacheByLeague.get(key);
  if (hit && !opts.force && Date.now() - hit.at < CONTEXT_TTL) return hit.ctx;
  const ctx = buildLeagueContext(leagueId, opts);
  cacheByLeague.set(key, { at: Date.now(), ctx });
  ctx.catch(() => cacheByLeague.delete(key));
  return ctx;
}

export function clearLeagueContexts() {
  cacheByLeague.clear();
}

export function leagueFormat(l: League): LeagueFormat {
  return l.settings.type === 2 ? "dynasty" : l.settings.type === 1 ? "keeper" : "redraft";
}

async function buildLeagueContext(
  leagueId: string,
  opts: { userId: string | null; mode?: Mode; force?: boolean; manualTiers?: Record<string, Tier> },
): Promise<LeagueContext> {
  const force = !!opts.force;
  const warnings: string[] = [];
  const [stateR, leagueR, usersR, rostersR, tradedR, playersR] = await Promise.all([
    sleeper.state(force), sleeper.league(leagueId, force), sleeper.users(leagueId, force), sleeper.rosters(leagueId, force),
    sleeper.tradedPicks(leagueId, force), sleeper.players(false),
  ]);
  const league = leagueR.data;
  const state = stateR.data;
  const season = league.season;
  const format = leagueFormat(league);
  const valuationMode: Mode = opts.mode ?? (format === "dynasty" ? "dynasty" : "redraft");

  const playoffStart = league.settings.playoff_week_start || 15;
  const playoffTeams = league.settings.playoff_teams || 6;
  const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, playoffTeams))));
  const lastWeek = Math.min(18, playoffStart + rounds - 1);
  const sameSeason = state.season === season;
  const currentWeek = !sameSeason ? lastWeek + 1 : state.season_type === "regular" ? Math.max(1, state.week) : state.season_type === "pre" ? 1 : lastWeek + 1;
  const seasonOver = currentWeek > lastWeek || league.status === "complete";
  const inPlayoffs = !seasonOver && currentWeek >= playoffStart;

  // NFLverse: failures degrade gracefully to Sleeper-only data.
  const prevSeason = String(Number(season) - 1);
  const sc = league.scoring_settings;
  const scoresReturns = !!(sc.kr_yd || sc.pr_yd || sc.kr_td || sc.pr_td);
  const [statsR, schedR, infoR, snapsR, prevStatsR, contractsR, injNowR, injPrevR, consR, combineR, prevSchedR, returnsR] = await Promise.all([
    weeklyStats(season).catch((e) => { warnings.push(`NFLverse stats unavailable: ${e.message}`); return null; }),
    schedule(season).catch((e) => { warnings.push(`NFL schedule unavailable: ${e.message}`); return null; }),
    playerInfo().catch(() => null),
    snapCounts(season).catch(() => null),
    weeklyStats(prevSeason).catch(() => null),
    contracts().catch(() => null),
    injuryReports(season).catch(() => null),
    injuryReports(prevSeason).catch(() => null),
    consensus().catch(() => null),
    combine().catch(() => null),
    schedule(prevSeason).catch(() => null),
    scoresReturns ? returnStats(season).catch(() => null) : Promise.resolve(null),
  ]);
  const stats: WeekStat[] = statsR?.data ?? [];
  // Return yards/TDs (nflverse has none), scored with this league's settings, for games not already scored by Sleeper.
  const returnPts = (pid: string, w: number) => {
    const r = returnsR?.data.weeks[String(w)]?.[pid];
    if (!r) return 0;
    return returnsR!.data.keys.reduce((a, k, i) => a + (r[i] ?? 0) * (sc[k] ?? 0), 0);
  };
  const games: Game[] = schedR?.data ?? [];

  // Matchups: every regular-season week (future weeks carry the schedule pairings) + playoff weeks reached.
  const weekCount = Math.max(playoffStart - 1, Math.min(currentWeek, lastWeek));
  const matchupWeeks = await Promise.all(
    Array.from({ length: weekCount }, (_, i) => i + 1).map((w) =>
      sleeper.matchups(leagueId, w, currentWeek, force && w >= currentWeek - 1).then((r) => r.data).catch(() => [] as Matchup[]),
    ),
  );
  const txWeeks = await Promise.all(
    Array.from({ length: Math.min(currentWeek, 18) }, (_, i) => i + 1).filter((w) => w >= currentWeek - 8).map((w) =>
      sleeper.transactions(leagueId, w, currentWeek, force && w >= currentWeek - 1).then((r) => r.data).catch(() => [] as Transaction[]),
    ),
  );
  const transactions = txWeeks.flat();

  const allPlayers = playersR.data;
  const txNames: Record<string, string> = {};
  for (const tx of transactions) for (const pid of [...Object.keys(tx.adds ?? {}), ...Object.keys(tx.drops ?? {})]) {
    const p = (allPlayers as Record<string, { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string | null }>)[pid];
    if (p) txNames[pid] = p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (p.position === "DEF" ? `${pid} defense` : pid);
    else if (/^[A-Z]{2,3}$/.test(pid)) txNames[pid] = `${pid} defense`;
  }
  const info = infoR?.data;
  const users = new Map<string, SleeperUser>(usersR.data.map((u) => [u.user_id, u]));
  const rosters = rostersR.data;
  const teamsCount = rosters.length || league.total_rosters;
  const slots = startingSlots(league.roster_positions);
  const leaguePositions = new Set<string>();
  slots.forEach((s) => ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"].forEach((p) => canFill(s, [p]) && leaguePositions.add(p)));

  // ---------- Players ----------
  const rostered = new Set(rosters.flatMap((r) => r.players));
  const players = new Map<string, PlayerLite>();
  const nowYear = new Date().getFullYear();
  // Everyone rostered, every active player on an NFL team, and anyone the expert rankings cover, including
  // players on injured reserve / PUP / suspended lists (they still have dynasty and rest-of-season value).
  const ranked = consR?.data.players ?? {};
  const HURT = new Set(["Injured Reserve", "Physically Unable to Perform", "Non Football Injury", "Suspended", "Inactive"]);
  for (const p of Object.values(allPlayers)) {
    const pos = primaryPosition(p);
    if (!leaguePositions.has(pos)) continue;
    const inRankings = !!ranked[p.player_id];
    const onTeam = !!p.team && (!p.status || p.status === "Active" || pos === "DEF" || HURT.has(p.status) && inRankings);
    if (!rostered.has(p.player_id) && !onTeam && !inRankings) continue;
    players.set(p.player_id, toLite(p, pos, info, nowYear));
  }

  // ---------- Game logs (league scoring) ----------
  const sleeperPts = new Map<string, Map<number, number>>();
  matchupWeeks.forEach((ms, i) => {
    const week = i + 1;
    if (week >= currentWeek) return;
    for (const m of ms) for (const [pid, pts] of Object.entries(m.players_points)) {
      if (!sleeperPts.has(pid)) sleeperPts.set(pid, new Map());
      sleeperPts.get(pid)!.set(week, pts);
    }
  });
  const statsByGsis = new Map<string, WeekStat[]>();
  for (const s of stats) {
    if (s.week >= currentWeek) continue;
    const arr = statsByGsis.get(s.gsis) ?? [];
    arr.push(s);
    statsByGsis.set(s.gsis, arr);
  }
  const snapByPfr = new Map<string, Map<number, number>>();
  for (const s of snapsR?.data ?? []) {
    if (!snapByPfr.has(s.pfr)) snapByPfr.set(s.pfr, new Map());
    snapByPfr.get(s.pfr)!.set(s.week, s.pct);
  }
  const teamPlayed = new Map<string, Set<number>>();
  for (const g of games) for (const t of [g.home, g.away]) {
    if (!teamPlayed.has(t)) teamPlayed.set(t, new Set());
    teamPlayed.get(t)!.add(g.week);
  }

  const logs = new Map<string, GameLog[]>();
  for (const p of players.values()) {
    const sp = sleeperPts.get(p.id);
    const st = p.gsis ? statsByGsis.get(p.gsis) : undefined;
    const stByWeek = new Map((st ?? []).map((s) => [s.week, s]));
    const pfr = p.gsis ? info?.get(p.gsis)?.pfr : null;
    const snaps = pfr ? snapByPfr.get(pfr) : undefined;
    const log: GameLog[] = [];
    for (let w = 1; w < currentWeek; w++) {
      const s = stByWeek.get(w);
      const sleeperVal = sp?.get(w);
      let played: boolean;
      if (p.pos === "DEF") played = !!teamPlayed.get(p.id)?.has(w) && (sleeperVal !== undefined || !games.length);
      else played = !!s || (sleeperVal !== undefined && sleeperVal !== 0) || (scoresReturns && returnPts(p.id, w) > 0);
      if (!played) continue;
      let pts: number, source: GameLog["source"];
      if (sleeperVal !== undefined) { pts = sleeperVal; source = "sleeper"; }
      else if (s) { pts = scoreStatLine(s, league.scoring_settings, p.pos) + (scoresReturns ? returnPts(p.id, w) : 0); source = "nflverse"; }
      else if (scoresReturns && returnPts(p.id, w) > 0) { pts = returnPts(p.id, w); source = "nflverse"; }
      else continue;
      log.push({ week: w, pts, source, opportunity: s ? opportunityOf(p.pos, s) : null, snapPct: snaps?.get(w) ?? null });
    }
    logs.set(p.id, log);
  }

  // ---------- Schedule + defence vs position ----------
  const opponents = new Map<string, Map<number, string>>();
  for (const g of games) {
    if (!opponents.has(g.home)) opponents.set(g.home, new Map());
    if (!opponents.has(g.away)) opponents.set(g.away, new Map());
    opponents.get(g.home)!.set(g.week, g.away);
    opponents.get(g.away)!.set(g.week, g.home);
  }
  const defense = defenseFactors(stats, currentWeek);

  // ---------- Last season, offensive environment ----------
  const prevPpg = new Map<string, { games: number; ppg: number }>();
  for (const s of prevStatsR?.data ?? []) {
    const pos = ["QB", "RB", "WR", "TE", "K"].includes(s.position) ? s.position : null;
    if (!pos) continue;
    const cur = prevPpg.get(s.gsis) ?? { games: 0, ppg: 0 };
    const pts = scoreStatLine(s, league.scoring_settings, pos);
    prevPpg.set(s.gsis, { games: cur.games + 1, ppg: (cur.ppg * cur.games + pts) / (cur.games + 1) });
  }
  const offense = offenseEnvironment(stats, currentWeek);

  // ---------- Projections (two passes: rough bases → replacement → priors) ----------
  const demand = starterDemand(league.roster_positions);
  const basesByPos = new Map<string, number[]>();
  for (const p of players.values()) {
    const l = logs.get(p.id) ?? [];
    if (l.length < 3) continue;
    const avg = l.reduce((a, g) => a + g.pts, 0) / l.length;
    const arr = basesByPos.get(p.pos) ?? [];
    arr.push(avg);
    basesByPos.set(p.pos, arr);
  }
  const roughRepl = replacementLevels(basesByPos, demand, teamsCount);
  const projections = new Map<string, Projection>();
  for (const p of players.values()) {
    const posPrior = priorFor(roughRepl[p.pos] ?? 0, p.yearsExp, p.draftRound);
    const prev = p.gsis ? prevPpg.get(p.gsis) : undefined;
    // Last season's production (in this league's scoring) anchors the prior when it's a real sample.
    const prior = prev && prev.games >= 6 ? 0.7 * prev.ppg + 0.3 * posPrior : posPrior;
    projections.set(p.id, project({
      player: p, log: logs.get(p.id) ?? [], prior,
      currentWeek: Math.min(currentWeek, lastWeek), lastWeek, opponents, defense,
      envFactor: p.team ? offense.get(p.team)?.factor ?? 1 : 1,
    }));
  }
  // ---------- Sleeper projections (preferred) ----------
  const sleeperWeeks = new Map<number, Map<string, number> | null>();
  const projStats = new Map<number, Map<string, Record<string, number>>>();
  const liveInjury = new Map<string, string | null>();
  if (!seasonOver) {
    const idp = ["DL", "LB", "DB"].some((p) => leaguePositions.has(p));
    const groups = [["QB", "RB", "WR", "TE", "K", "DEF"], ...(idp ? [["DL", "LB", "DB"]] : [])];
    const weeks = Array.from({ length: lastWeek - Math.min(currentWeek, lastWeek) + 1 }, (_, i) => Math.min(currentWeek, lastWeek) + i);
    await Promise.all(weeks.map(async (w) => {
      try {
        const lists = await Promise.all(groups.map((g) => sleeper.projections(season, w, g, force && w === currentWeek)));
        const m = new Map<string, number>();
        const st = new Map<string, Record<string, number>>();
        for (const l of lists) for (const r of l.data) {
          const p = players.get(r.id);
          if (!p) continue;
          st.set(r.id, r.stats);
          m.set(r.id, scoreSleeperStats(r.stats, league.scoring_settings, p.pos));
          if (w === Math.min(currentWeek, lastWeek)) liveInjury.set(r.id, r.injury);
        }
        sleeperWeeks.set(w, m.size ? m : null);
        if (st.size) projStats.set(w, st);
      } catch {
        sleeperWeeks.set(w, null);
      }
    }));
    if ([...sleeperWeeks.values()].every((v) => !v)) warnings.push("Sleeper projections couldn't load; using the SHS model's projections instead.");
    // Live injury designations from the projections feed are fresher than the daily player list.
    for (const [id, inj] of liveInjury) {
      const p = players.get(id);
      if (p && inj !== undefined) p.injury = inj;
    }
    for (const [id, pr] of projections) projections.set(id, applySleeper(pr, sleeperWeeks, Math.min(currentWeek, lastWeek), players.get(id)?.injury ?? null));
  }
  const finalBases = new Map<string, number[]>();
  for (const p of players.values()) {
    const arr = finalBases.get(p.pos) ?? [];
    arr.push(projections.get(p.id)!.base);
    finalBases.set(p.pos, arr);
  }
  const replacement = replacementLevels(finalBases, demand, teamsCount);
  // Waiver level: what you could pick up today. At one-slot or streamable positions (QB in 1QB, TE, K, DEF)
  // this is often close to a weekly starter, so a starter there is worth less than the raw points suggest.
  const waiverLevel: Record<string, number> = {};
  for (const pos of Object.keys(replacement)) {
    const fa = [...players.values()]
      .filter((p) => p.pos === pos && !rostered.has(p.id) && !["IR", "Out", "PUP", "NFI", "Sus"].includes(p.injury ?? ""))
      .map((p) => projections.get(p.id)!.base)
      .sort((a, b) => b - a);
    waiverLevel[pos] = fa[1] ?? fa[0] ?? 0;
    replacement[pos] = Math.round(Math.max(replacement[pos], 0.95 * waiverLevel[pos]) * 10) / 10;
  }
  // ---------- Durability, contracts, season outlook (player extras) ----------
  const extras = new Map<string, PlayerExtras>();
  const reportsBy = new Map<string, { season: number; week: number; status: string; injury: string }[]>();
  for (const r of [...(injPrevR?.data ?? []), ...(injNowR?.data ?? [])]) {
    const arr = reportsBy.get(r.gsis) ?? [];
    arr.push(r);
    reportsBy.set(r.gsis, arr);
  }
  const prevGamesBy = new Map<string, number>();
  for (const s of prevStatsR?.data ?? []) prevGamesBy.set(s.gsis, (prevGamesBy.get(s.gsis) ?? 0) + 1);
  const teamGamesNow = (team: string | null) => (team ? [...(teamPlayed.get(team) ?? [])].filter((w) => w < currentWeek).length : 0);
  const contractMap = contractsR?.data;
  for (const p of players.values()) {
    if (p.pos === "DEF") continue;
    const ni = p.gsis ? info?.get(p.gsis) : undefined;
    const contract: Contract | null = ni?.otc ? contractMap?.get(ni.otc) ?? null : null;
    const playedNow = (logs.get(p.id) ?? []).length;
    const possibleNow = teamGamesNow(p.team);
    const playedPrev = p.gsis ? prevGamesBy.get(p.gsis) ?? 0 : 0;
    const wasActivePrev = (p.yearsExp ?? 0) >= 1;
    const played = playedNow + (wasActivePrev ? playedPrev : 0);
    const possible = possibleNow + (wasActivePrev ? 17 : 0);
    const reports = p.gsis ? reportsBy.get(p.gsis) ?? [] : [];
    const out = reports.filter((r) => r.status === "Out").length;
    const durabilityPct = possible ? Math.min(1, played / possible) : 1;
    const durability = possible < 6 ? 1 : durabilityPct < 0.6 ? 0.88 : durabilityPct < 0.8 ? 0.94 : 1;
    const yearsLeft = contract ? contract.endYear - Number(season) : null;
    const contractFactor = yearsLeft === null ? 1 : yearsLeft <= 0 && (p.age ?? 0) >= 26 ? 0.95 : yearsLeft >= 2 ? 1.02 : 1;
    const pr = projections.get(p.id);
    const remaining = pr ? Object.entries(pr.byWeek).map(([w]) => Number(w)) : [];
    const factorAt = (w: number) => {
      const opp = p.team ? opponents.get(p.team)?.get(w) : undefined;
      const f = opp ? defense.get(opp)?.[p.pos] : undefined;
      return f ?? 1;
    };
    const avg = (ws: number[]) => (ws.length ? ws.reduce((a, w) => a + factorAt(w), 0) / ws.length : 1);
    extras.set(p.id, {
      contract, yearsLeft, contractFactor, durability, durabilityPct: Math.round(durabilityPct * 100),
      gamesPlayed: played, gamesPossible: possible, reportsOut: out,
      recentInjuries: [...new Set(reports.filter((r) => r.injury).slice(-6).map((r) => r.injury))].slice(-3),
      prevSeason: p.gsis && prevPpg.get(p.gsis) ? { games: prevPpg.get(p.gsis)!.games, ppg: Math.round(prevPpg.get(p.gsis)!.ppg * 10) / 10 } : null,
      offense: p.team ? offense.get(p.team) ?? null : null,
      outlookRos: Math.round(avg(remaining.filter((w) => w > currentWeek)) * 100) / 100,
      outlookPlayoffs: Math.round(avg(remaining.filter((w) => w >= playoffStart)) * 100) / 100,
      height: ni?.height ?? (allPlayers[p.id]?.height ? String(allPlayers[p.id]!.height) : null),
      weight: ni?.weight ?? (allPlayers[p.id]?.weight ? Number(allPlayers[p.id]!.weight) : null),
      college: ni?.college ?? allPlayers[p.id]?.college ?? null,
      number: allPlayers[p.id]?.number ?? null,
      draftRound: ni?.draftRound ?? null,
      draftPick: ni?.draftPick ?? null,
    });
  }
  const dynastyAdjust = new Map([...extras].map(([id, e]) => [id, e.durability * e.contractFactor]));
  const values = computeValues({
    players: [...players.values()], projections, replacement,
    currentWeek: Math.min(currentWeek, lastWeek), playoffStart, lastWeek, dynastyAdjust,
  });
  const cons: Record<string, Consensus> = consR?.data.players ?? {};
  // Market trust: share of each player's points this season that came from return yards (which expert ranks ignore).
  const trust = new Map<string, number>();
  if (scoresReturns) for (const [id, log] of logs) {
    const tot = log.reduce((x, g) => x + g.pts, 0);
    if (tot <= 0) continue;
    let ret = 0;
    for (const g of log) ret += returnPts(id, g.week);
    const share = Math.min(1, ret / tot);
    if (share > 0.02) trust.set(id, Math.max(0, 1 - 2.5 * share));
  }
  blendWithMarket(values, [...players.values()], cons, isSuperflex(league.roster_positions), trust);

  // ---------- Teams ----------
  const sortedForRank = [...rosters].sort((a, b) => b.settings.wins - a.settings.wins || pts(b, "fpts") - pts(a, "fpts"));
  const thisWeekMatchups = matchupWeeks[Math.min(currentWeek, weekCount) - 1] ?? [];
  const thisWeekByRoster = new Map(thisWeekMatchups.map((m) => [m.roster_id, m]));
  const teams: TeamInfo[] = rosters.map((r) => {
    const u = r.owner_id ? users.get(r.owner_id) : undefined;
    const teamName = (u?.metadata?.team_name as string | undefined) || u?.display_name || `Team ${r.roster_id}`;
    return {
      rosterId: r.roster_id, ownerId: r.owner_id ?? null, name: teamName, manager: u?.display_name ?? "Open slot",
      avatar: (typeof u?.metadata?.avatar === "string" && (u.metadata.avatar as string).startsWith("http") ? (u.metadata.avatar as string) : u?.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null), wins: r.settings.wins, losses: r.settings.losses, ties: r.settings.ties,
      pointsFor: pts(r, "fpts"), pointsAgainst: pts(r, "fpts_against"), rank: sortedForRank.indexOf(r) + 1,
      players: r.players, reserve: r.reserve, taxi: r.taxi,
      starters: thisWeekByRoster.get(r.roster_id)?.starters?.length ? thisWeekByRoster.get(r.roster_id)!.starters : r.starters,
    };
  });
  const myRosterId =
    rosters.find((r) => r.owner_id === opts.userId || (opts.userId && r.co_owners?.includes(opts.userId)))?.roster_id ?? null;

  // ---------- Lineups (this week) ----------
  const now = Date.now();
  const kickoff = new Map<string, { start: number; final: boolean }>();
  for (const g of games.filter((x) => x.week === currentWeek)) {
    const start = g.kickoff ? easternToEpoch(g.kickoff) : Infinity;
    const final = g.homeScore !== null || now > start + 4 * 3_600_000;
    kickoff.set(g.home, { start, final });
    kickoff.set(g.away, { start, final });
  }
  const isLocked = (pid: string) => {
    const t = players.get(pid)?.team;
    const k = t ? kickoff.get(t) : undefined;
    return !!k && now >= k.start;
  };
  const projPts = (pid: string) => projections.get(pid)?.median ?? 0;
  const lineups = new Map<number, LineupState>();
  for (const t of teams) {
    const unavailable = new Set([...t.reserve, ...t.taxi]);
    const cands = t.players.filter((pid) => !unavailable.has(pid) && players.has(pid)).map((pid) => ({
      id: pid, positions: players.get(pid)!.positions, points: projPts(pid), locked: isLocked(pid) && t.starters.includes(pid),
    }));
    const current = scoreStarters(league.roster_positions, t.starters, projPts);
    const optimal = optimizeLineup(league.roster_positions, cands, t.starters);
    lineups.set(t.rosterId, {
      current, optimal, currentTotal: lineupTotal(current), optimalTotal: lineupTotal(optimal),
      gain: Math.round((lineupTotal(optimal) - lineupTotal(current)) * 10) / 10, locked: cands.filter((c) => c.locked).map((c) => c.id),
    });
  }

  // ---------- Team strength by week ----------
  const weekStrength = new Map<number, Map<number, TeamWeek>>();
  const healthyStrength = new Map<number, number>();
  for (const t of teams) {
    const m = new Map<number, TeamWeek>();
    const usable = t.players.filter((pid) => !t.taxi.includes(pid) && players.has(pid));
    for (let w = Math.min(currentWeek, lastWeek); w <= lastWeek; w++) {
      const lu = optimizeLineup(league.roster_positions, usable.map((pid) => ({
        id: pid, positions: players.get(pid)!.positions, points: projections.get(pid)?.byWeek[w] ?? 0,
      })));
      const sd = Math.sqrt(lu.reduce((a, s) => a + (s.playerId ? (projections.get(s.playerId)?.sd ?? 0) ** 2 : 0), 0));
      m.set(w, { mean: lineupTotal(lu), sd: Math.max(sd, 8) });
    }
    weekStrength.set(t.rosterId, m);
    const healthy = optimizeLineup(league.roster_positions, usable.map((pid) => ({
      id: pid, positions: players.get(pid)!.positions, points: projections.get(pid)?.base ?? 0,
    })));
    healthyStrength.set(t.rosterId, lineupTotal(healthy));
  }
  const strengthAt = (rid: number, w: number): TeamWeek => {
    const m = weekStrength.get(rid);
    return m?.get(w) ?? m?.get(lastWeek) ?? { mean: healthyStrength.get(rid) ?? 100, sd: 20 };
  };

  // ---------- Live score this week ----------
  const liveScore = new Map<number, { actual: number; projected: TeamWeek }>();
  if (!seasonOver) {
    for (const m of thisWeekMatchups) {
      let mean = 0, varSum = 0;
      for (const pid of m.starters) {
        if (!pid || pid === "0") continue;
        const pr = projections.get(pid);
        const actual = m.players_points[pid] ?? 0;
        const t = players.get(pid)?.team;
        const k = t ? kickoff.get(t) : undefined;
        if (k?.final) mean += actual;
        else if (k && now >= k.start) { mean += Math.max(actual, 0.5 * actual + 0.5 * (pr?.median ?? 0)); varSum += ((pr?.sd ?? 0) * 0.5) ** 2; }
        else { mean += pr?.median ?? 0; varSum += (pr?.sd ?? 0) ** 2; }
      }
      liveScore.set(m.roster_id, { actual: m.points, projected: { mean: Math.round(mean * 10) / 10, sd: Math.max(Math.sqrt(varSum), 3) } });
    }
  }

  // ---------- Season simulation ----------
  const remaining: { week: number; games: [number, number][] }[] = [];
  if (!inPlayoffs && !seasonOver) {
    for (let w = currentWeek; w < playoffStart; w++) {
      const ms = matchupWeeks[w - 1] ?? [];
      const byId = new Map<number, number[]>();
      for (const m of ms) if (m.matchup_id) byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m.roster_id]);
      remaining.push({ week: w, games: [...byId.values()].filter((g) => g.length === 2).map((g) => [g[0], g[1]] as [number, number]) });
    }
  }
  const rosterIds = rosters.map((r) => r.roster_id);
  const sim = simulateSeason({
    rosterIds,
    wins: Object.fromEntries(rosters.map((r) => [r.roster_id, r.settings.wins])),
    losses: Object.fromEntries(rosters.map((r) => [r.roster_id, r.settings.losses])),
    ties: Object.fromEntries(rosters.map((r) => [r.roster_id, r.settings.ties])),
    pointsFor: Object.fromEntries(rosters.map((r) => [r.roster_id, pts(r, "fpts")])),
    schedule: remaining,
    strength: (rid, w) => {
      const live = w === currentWeek ? liveScore.get(rid) : undefined;
      return live ? live.projected : strengthAt(rid, w);
    },
    playoffTeams,
    playoffWeeks: Array.from({ length: rounds }, (_, i) => playoffStart + i),
    reseed: (league.settings as Record<string, unknown>).playoff_seed_type === 1,
    runs: 4000,
    seed: Number(leagueId.slice(-6)) || 7,
  });

  // ---------- Classification ----------
  const pastWeeks = matchupWeeks.slice(0, Math.min(currentWeek - 1, weekCount));
  const allPlay = new Map<number, { w: number; g: number }>();
  for (const ms of pastWeeks) {
    for (const m of ms) {
      const others = ms.filter((o) => o.roster_id !== m.roster_id);
      const beat = others.filter((o) => m.points > o.points).length + 0.5 * others.filter((o) => o.points === m.points).length;
      const cur = allPlay.get(m.roster_id) ?? { w: 0, g: 0 };
      allPlay.set(m.roster_id, { w: cur.w + beat, g: cur.g + others.length });
    }
  }
  const benched = benchedWeeks(pastWeeks.slice(-6), Math.max(1, currentWeek - 6), league.roster_positions, players, projections);
  const metrics: TeamMetrics[] = teams.map((t) => {
    const rosterVals = t.players.map((pid) => values.get(pid)).filter(Boolean) as PlayerValue[];
    const top = [...rosterVals].sort((a, b) => b.dynasty - a.dynasty).slice(0, 10);
    const tv = top.reduce((a, v) => a + v.dynasty, 0) || 1;
    const youth = top.reduce((a, v) => a + (players.get(v.id)?.age ?? 26) * v.dynasty, 0) / tv;
    const allDyn = rosterVals.reduce((a, v) => a + v.dynasty, 0) || 1;
    const fut = rosterVals.reduce((a, v) => a + v.dynastyFuture, 0) / allDyn;
    const lu = lineups.get(t.rosterId)!;
    const startPts = lu.optimal.map((s) => s.points).sort((a, b) => b - a);
    const ap = allPlay.get(t.rosterId);
    return {
      rosterId: t.rosterId, wins: t.wins, losses: t.losses, ties: t.ties, pointsFor: t.pointsFor, pointsAgainst: t.pointsAgainst,
      gamesPlayed: t.wins + t.losses + t.ties, strength: healthyStrength.get(t.rosterId) ?? 0,
      allPlayPct: ap && ap.g ? ap.w / ap.g : 0.5, playoffOdds: sim.playoffOdds[t.rosterId] ?? 0, titleOdds: sim.titleOdds[t.rosterId] ?? 0,
      youth, capital: 0, futureShare: fut,
      topHeavy: (startPts[0] + startPts[1]) / Math.max(1, startPts.reduce((a, b) => a + b, 0)),
      benchedWeeks: benched.get(t.rosterId) ?? [],
      vetsSoldForFuture: vetsSold(transactions, t.rosterId, players),
    };
  });
  // Pick capital needs an order; use simulated wins (worst first) then strength.
  const projectedOrder = [...teams]
    .sort((a, b) => (sim.projectedWins[a.rosterId] ?? 0) - (sim.projectedWins[b.rosterId] ?? 0) || (healthyStrength.get(a.rosterId) ?? 0) - (healthyStrength.get(b.rosterId) ?? 0))
    .map((t) => t.rosterId);
  const picks = buildPicks({
    rosterIds, traded: tradedR.data, firstSeason: Number(season) + 1, years: 3,
    rounds: format === "dynasty" ? league.settings.draft_rounds || 4 : Math.min(4, league.settings.draft_rounds || 4),
    teams: teamsCount, superflex: isSuperflex(league.roster_positions), projectedOrder, manualTiers: opts.manualTiers,
    valueOn: valuationMode === "dynasty",
  });
  // Dynasty: price picks with the market (same scale as player values) when DynastyProcess covers them.
  const pm = consR?.data.picks;
  if (pm && valuationMode === "dynasty") {
    const sf = isSuperflex(league.roster_positions);
    const maxMk = Math.max(1, ...[...players.keys()].map((id) => (sf ? cons[id]?.v2 : cons[id]?.v1) ?? 0));
    for (const p of picks) {
      const m = marketForPick(p, pm);
      if (!m) continue;
      p.market = m;
      p.value = bendDynasty((100 * (sf ? m.v2 : m.v1)) / maxMk);
    }
  }
  for (const m of metrics) m.capital = picks.filter((p) => p.ownerRosterId === m.rosterId).reduce((a, p) => a + (p.value || pickProxy(p)), 0);
  const showClasses = valuationMode === "dynasty";
  const classes = showClasses ? classifyTeams(metrics, "dynasty") : [];
  const overrides = getSettings().classOverrides[leagueId] ?? {};
  const classifications = new Map(
    classes.map((c) => {
      const o = overrides[String(c.rosterId)];
      return [c.rosterId, { ...c, override: o as TeamClass | undefined, overrideNote: undefined as string | undefined }];
    }),
  );

  if (!statsR) warnings.push("Usage trends and unrostered-player projections are limited until NFLverse data loads.");
  const stale = [stateR, leagueR, rostersR].some((r) => r.stale);
  if (stale) warnings.push("Sleeper could not be reached; showing the last saved data.");

  const signals = await loadSignals(season, injNowR?.data ?? [], Math.min(currentWeek, lastWeek), force).catch(() => emptySignals());

  const out: LeagueContext = {
    league, format, valuationMode, scoring: scoringLabel(league.scoring_settings), superflex: isSuperflex(league.roster_positions),
    teamsCount, currentWeek, playoffStart, lastWeek, inPlayoffs, seasonOver, teams, myRosterId, players, projections, values,
    replacement, waiverLevel, consensus: cons, consensusDates: consR ? { ecr: consR.data.ecrDate, weekly: consR.data.weeklyDate } : null, projStats, stats, logs, signals, lineups, weekStrength, sim, remainingSchedule: Object.fromEntries(remaining.map((r) => [r.week, r.games])), classifications, picks, matchupsThisWeek: thisWeekMatchups, matchupsByWeek: matchupWeeks, healthyStrength, showClasses, extras, nflOpponents: opponents, liveScore, transactions, txNames,
    fetchedAt: Math.min(rostersR.fetchedAt, leagueR.fetchedAt), stale, warnings, keeperSurplus: new Map(), keeperCost: new Map(), marketTrust: trust, startedTeams: new Set([...kickoff].filter(([, k]) => now >= k.start).map(([t]) => t)), games,
    prevCoach: new Map((prevSchedR?.data ?? []).flatMap((g) => [[g.home, g.homeCoach ?? ""], [g.away, g.awayCoach ?? ""]] as [string, string][]).filter(([, c]) => c)),
    combine: combineR?.data ?? new Map(),
  };
  // Keeper leagues: a player who'd be a cheap keeper next year is worth more in a trade now.
  if (format === "keeper" && !seasonOver) {
    try {
      // The draft's own settings hold the real round count (the league's draft_rounds field is often stale).
      let rounds = league.settings.draft_rounds || 15, dTeams = teamsCount;
      let picks: DraftPick[] = [];
      const drafts = (await sleeper.drafts(league.league_id).catch(() => null))?.data ?? [];
      const d = drafts.find((x) => x.draft_id === league.draft_id) ?? drafts[0];
      if (d) {
        const st = (d.settings ?? {}) as Record<string, unknown>;
        rounds = Number(st.rounds) || rounds; dTeams = Number(st.teams) || dTeams;
        picks = (await sleeper.draftPicks(d.draft_id)).data;
      }
      const rules = keeperRulesFor(getSettings(), league);
      let pool: number[] = [];
      for (const t of teams) for (const r of keeperPlan(out, t.rosterId, picks, rules, rounds, { teams: dTeams, onPool: (p) => (pool = p) })) {
        if (r.surplus !== null && r.surplus > 0) out.keeperSurplus.set(r.playerId, r.surplus);
        if (r.surplus !== null && r.costRound !== null) out.keeperCost.set(r.playerId, { round: r.costRound, surplus: r.surplus });
      }
      const toValue = applyKeeperBonus(values, out.keeperSurplus);
      // Draft picks, keeper-aware: a pick lands the best player left after every team's keepers are off the board
      // (keepers take their teams' picks, so roughly the top keepers × teams are gone). A late pick also brings a
      // cheap future keeper, so it never drops to nothing. Later years are discounted.
      const kept = Math.round(rules.maxKeepers * dTeams * 0.6);
      const slotOf = (tier: string) => (tier === "early" ? 0.2 : tier === "late" ? 0.8 : 0.5);
      for (const pk of out.picks) {
        const overall = (pk.round - 1) * dTeams + Math.max(1, Math.round(slotOf(pk.tier) * dTeams));
        const s = pool[Math.min(pool.length - 1, overall - 1 + kept)] ?? 0;
        const yearsOut = Math.max(0, Number(pk.season) - Number(league.season) - 1);
        const cheapKeep = 0.25 * Math.max(0, 1 - pk.round / Math.max(1, rounds)); // late picks = cheap keepers later
        pk.keeperValue = toValue(Math.max(0.15, s + cheapKeep) * Math.pow(0.85, yearsOut));
      }
    } catch { warnings.push("Keeper costs couldn't be loaded, so trade values ignore keeper value for now."); }
  }
  return out;
}

// ---------- helpers ----------

function pts(r: Roster, k: "fpts" | "fpts_against") {
  const s = r.settings as Record<string, number>;
  return Math.round(((s[k] ?? 0) + (s[`${k}_decimal`] ?? 0) / 100) * 10) / 10;
}

function toLite(p: Player, pos: string, info: Map<string, { birthDate: string | null; draftRound: number | null; draftPick?: number | null; rookieSeason?: number | null }> | undefined, nowYear: number): PlayerLite {
  const gsis = p.gsis_id?.trim() || null;
  const ni = gsis ? info?.get(gsis) : undefined;
  const birth = p.birth_date || ni?.birthDate || null;
  let age = p.age ?? null;
  if (birth) {
    const b = new Date(birth);
    if (!Number.isNaN(b.getTime())) age = Math.round(((Date.now() - b.getTime()) / (365.25 * 864e5)) * 10) / 10;
  }
  void nowYear;
  const name = pos === "DEF" ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.player_id : p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  const injury = p.injury_status || (p.status === "Injured Reserve" ? "IR" : null);
  return {
    id: p.player_id, name, pos, positions: playerPositions(p), team: p.team ?? null, age: pos === "DEF" ? null : age,
    yearsExp: p.years_exp ?? null, injury, injuryPart: p.injury_body_part ?? null, gsis, draftRound: ni?.draftRound ?? null, draftPick: ni?.draftPick ?? null, rookieSeason: ni?.rookieSeason ?? null,
    depth: p.depth_chart_order ?? null,
  };
}

/** Opponent defence factor by position: fantasy points allowed per game ÷ league average. */
function defenseFactors(stats: WeekStat[], beforeWeek: number) {
  const allowed = new Map<string, Record<string, number>>();
  const gamesByTeam = new Map<string, Set<number>>();
  for (const s of stats) {
    if (s.week >= beforeWeek || !["QB", "RB", "WR", "TE", "K"].includes(s.position)) continue;
    const a = allowed.get(s.opp) ?? {};
    a[s.position] = (a[s.position] ?? 0) + s.pprPoints;
    allowed.set(s.opp, a);
    if (!gamesByTeam.has(s.opp)) gamesByTeam.set(s.opp, new Set());
    gamesByTeam.get(s.opp)!.add(s.week);
  }
  const perGame = new Map<string, Record<string, number>>();
  const avg: Record<string, number[]> = {};
  for (const [team, a] of allowed) {
    const g = gamesByTeam.get(team)?.size || 1;
    const pg: Record<string, number> = {};
    for (const [pos, v] of Object.entries(a)) { pg[pos] = v / g; (avg[pos] ??= []).push(v / g); }
    perGame.set(team, pg);
  }
  const out = new Map<string, Record<string, number>>();
  for (const [team, pg] of perGame) {
    const f: Record<string, number> = {};
    for (const [pos, v] of Object.entries(pg)) {
      const la = avg[pos].reduce((x, y) => x + y, 0) / avg[pos].length;
      f[pos] = la > 0 ? v / la : 1;
    }
    out.set(team, f);
  }
  return out;
}

/**
 * Weeks where a team's starters were clearly worse than its best available players,
 * judged by season-average points (not hindsight), counting only bench players who actually played.
 */
function benchedWeeks(
  weeks: Matchup[][], firstWeek: number, rosterPositions: string[],
  players: Map<string, PlayerLite>, projections: Map<string, Projection>,
) {
  const out = new Map<number, { week: number; gap: number }[]>();
  weeks.forEach((ms, i) => {
    const week = firstWeek + i;
    for (const m of ms) {
      const base = (pid: string) => projections.get(pid)?.base ?? 0;
      const playedOrStarter = (pid: string) => (m.players_points[pid] ?? 0) !== 0 || m.starters.includes(pid);
      const cands = m.players.filter((pid) => players.has(pid) && playedOrStarter(pid)).map((pid) => ({ id: pid, positions: players.get(pid)!.positions, points: base(pid) }));
      const best = lineupTotal(optimizeLineup(rosterPositions, cands));
      const actual = lineupTotal(scoreStarters(rosterPositions, m.starters, (pid) => ((m.players_points[pid] ?? 0) !== 0 || players.get(pid)?.pos === "DEF" ? base(pid) : 0)));
      const gap = best - actual;
      if (gap > Math.max(18, 0.15 * best)) {
        const arr = out.get(m.roster_id) ?? [];
        arr.push({ week, gap: Math.round(gap * 10) / 10 });
        out.set(m.roster_id, arr);
      }
    }
  });
  return out;
}

function vetsSold(txs: Transaction[], rosterId: number, players: Map<string, PlayerLite>) {
  let n = 0;
  for (const t of txs) {
    if (t.type !== "trade" || t.status !== "complete" || !t.roster_ids.includes(rosterId)) continue;
    const sent = Object.entries(t.drops).filter(([, r]) => r === rosterId).map(([pid]) => players.get(pid));
    const got = Object.entries(t.adds).filter(([, r]) => r === rosterId).map(([pid]) => players.get(pid));
    const gotPicks = t.draft_picks.filter((p) => p.owner_id === rosterId).length;
    const sentVet = sent.some((p) => p && p.age !== null && p.age >= 27);
    const gotYoung = got.length > 0 && got.every((p) => p && p.age !== null && p.age < 25);
    if (sentVet && (gotPicks > 0 || gotYoung)) n++;
  }
  return n;
}

/** In redraft, picks carry no value, but we still count raw pick capital for classification. */
function pickProxy(p: PickAsset) {
  return p.round === 1 ? 3 : p.round === 2 ? 1 : 0.3;
}

export function ownerRosterOf(ctx: LeagueContext, playerId: string): number | null {
  return ctx.teams.find((t) => t.players.includes(playerId))?.rosterId ?? null;
}

export function slotsOf(ctx: LeagueContext) {
  return startingSlots(ctx.league.roster_positions);
}

/**
 * Offensive environment: each team's offensive fantasy points per game (PPR, all skill players),
 * last 4 games vs season. Factor feeds projections, capped at ±6%.
 */
function offenseEnvironment(stats: WeekStat[], beforeWeek: number) {
  const byTeamWeek = new Map<string, Map<number, number>>();
  for (const s of stats) {
    if (s.week >= beforeWeek || !["QB", "RB", "WR", "TE"].includes(s.position)) continue;
    const m = byTeamWeek.get(s.team) ?? new Map<number, number>();
    m.set(s.week, (m.get(s.week) ?? 0) + s.pprPoints);
    byTeamWeek.set(s.team, m);
  }
  const rows = [...byTeamWeek].map(([team, m]) => {
    const weeks = [...m.keys()].sort((a, b) => a - b);
    const all = weeks.map((w) => m.get(w)!);
    const last4 = all.slice(-4);
    const ppg = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
    const recent = last4.reduce((a, b) => a + b, 0) / Math.max(1, last4.length);
    return { team, ppg, recent };
  });
  const sorted = [...rows].sort((a, b) => b.ppg - a.ppg);
  const out = new Map<string, { ppg: number; rank: number; factor: number; trend: number }>();
  for (const r of rows) {
    const trend = r.ppg > 0 ? r.recent / r.ppg : 1;
    out.set(r.team, {
      ppg: Math.round(r.ppg * 10) / 10, rank: sorted.indexOf(r) + 1,
      factor: Math.max(0.94, Math.min(1.06, 1 + 0.3 * (trend - 1))), trend: Math.round((trend - 1) * 100),
    });
  }
  return out;
}
