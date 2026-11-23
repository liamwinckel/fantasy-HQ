import { sleeper } from "../sleeper/client";
import { effectiveMode, getSettings, saveSettings, type AppSettings } from "../settings";
import type { League } from "../sleeper/types";
import { getLeagueContext, leagueFormat, type LeagueContext } from "./league";
import { winProbability } from "../engine/simulate";

export interface Setup {
  settings: AppSettings;
  season: string;
  week: number;
  seasonType: string;
  leagues: League[];
  errors: string[];
}

/** Resolve the Sleeper user, season and league list. Never throws: errors come back as messages. */
export async function loadSetup(force = false): Promise<Setup> {
  const settings = getSettings();
  const errors: string[] = [];
  let season = settings.season ?? String(new Date().getFullYear());
  let week = 1;
  let seasonType = "regular";
  try {
    const st = (await sleeper.state(force)).data;
    season = settings.season ?? st.season;
    week = st.week;
    seasonType = st.season_type;
  } catch (e) {
    errors.push(`Couldn't reach Sleeper for the current week (${(e as Error).message}).`);
  }
  let leagues: League[] = [];
  if (settings.userId) {
    try {
      leagues = (await sleeper.leagues(settings.userId, season, force)).data;
    } catch (e) {
      errors.push(`League discovery failed (${(e as Error).message}). You can add leagues by ID in Settings.`);
    }
    for (const id of settings.manualLeagueIds) {
      if (leagues.some((l) => l.league_id === id)) continue;
      try {
        leagues.push((await sleeper.league(id, force)).data);
      } catch {
        errors.push(`League ${id} couldn't be loaded.`);
      }
    }
    leagues = leagues.filter((l) => !settings.hiddenLeagues.includes(l.league_id));
  }
  return { settings, season, week, seasonType, leagues, errors };
}

export async function connectUser(username: string) {
  const name = username.replace(/^@/, "").trim();
  let u;
  try {
    u = (await sleeper.user(name, true)).data;
  } catch (e) {
    const msg = (e as Error).message;
    if (/returned nothing|404/.test(msg)) throw new Error(`No Sleeper user called "${name}".`);
    throw new Error("Couldn't reach Sleeper. Check your connection and try again.");
  }
  saveSettings({ username: u.username ?? username, userId: u.user_id });
  return u;
}

export interface LeagueSummary {
  id: string;
  name: string;
  format: string;
  mode: "redraft" | "dynasty";
  scoring: string;
  teams: number;
  myTeam: string | null;
  record: string;
  rank: number | null;
  pointsFor: number;
  pointsAgainst: number;
  playoffOdds: number | null;
  titleOdds: number | null;
  classification: string | null;
  confidence: number | null;
  week: number;
  opponent: { name: string; classification: string | null } | null;
  live: { me: number; opp: number } | null;
  projected: { me: number; opp: number } | null;
  winProb: number | null;
  lineupGain: number;
  injuredStarters: { id: string; name: string; status: string }[];
  byeStarters: { id: string; name: string }[];
  emptySlots: number;
  warnings: string[];
  fetchedAt: number;
  error?: string;
}

export function summarize(ctx: LeagueContext): LeagueSummary {
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId) ?? null;
  const cls = me ? ctx.classifications.get(me.rosterId) : undefined;
  const myM = ctx.matchupsThisWeek.find((m) => m.roster_id === me?.rosterId);
  const oppM = myM?.matchup_id ? ctx.matchupsThisWeek.find((m) => m.matchup_id === myM.matchup_id && m.roster_id !== myM.roster_id) : undefined;
  const opp = oppM ? ctx.teams.find((t) => t.rosterId === oppM.roster_id) : undefined;
  const myLive = me ? ctx.liveScore.get(me.rosterId) : undefined;
  const oppLive = opp ? ctx.liveScore.get(opp.rosterId) : undefined;
  const lu = me ? ctx.lineups.get(me.rosterId) : undefined;
  const injured: LeagueSummary["injuredStarters"] = [];
  const bye: LeagueSummary["byeStarters"] = [];
  let empty = 0;
  for (const s of lu?.current ?? []) {
    if (!s.playerId) { empty++; continue; }
    const p = ctx.players.get(s.playerId);
    const pr = ctx.projections.get(s.playerId);
    if (!p) continue;
    if (pr?.onBye) bye.push({ id: p.id, name: p.name });
    else if (p.injury && p.injury !== "Probable") injured.push({ id: p.id, name: p.name, status: p.injury });
  }
  return {
    id: ctx.league.league_id, name: ctx.league.name, format: ctx.format, mode: ctx.valuationMode, scoring: ctx.scoring,
    teams: ctx.teamsCount, myTeam: me?.name ?? null,
    record: me ? `${me.wins}–${me.losses}${me.ties ? `–${me.ties}` : ""}` : "—", rank: me?.rank ?? null,
    pointsFor: me?.pointsFor ?? 0, pointsAgainst: me?.pointsAgainst ?? 0,
    playoffOdds: me ? ctx.sim.playoffOdds[me.rosterId] ?? null : null, titleOdds: me ? ctx.sim.titleOdds[me.rosterId] ?? null : null,
    classification: cls ? cls.override ?? cls.primary : null, confidence: cls?.confidence ?? null, week: ctx.currentWeek,
    opponent: opp ? { name: opp.name, classification: ctx.classifications.get(opp.rosterId)?.primary ?? null } : null,
    live: myM && oppM && (myM.points > 0 || oppM.points > 0) ? { me: myM.points, opp: oppM.points } : null,
    projected: myLive && oppLive ? { me: myLive.projected.mean, opp: oppLive.projected.mean } : null,
    winProb: myLive && oppLive ? winProbability(myLive.projected, oppLive.projected) : null,
    lineupGain: lu?.gain ?? 0, injuredStarters: injured, byeStarters: bye, emptySlots: empty,
    warnings: ctx.warnings, fetchedAt: ctx.fetchedAt,
  };
}

export async function loadAllLeagues(setup: Setup, opts: { force?: boolean } = {}) {
  const results = await Promise.all(
    setup.leagues.map(async (l) => {
      try {
        const ctx = await getLeagueContext(l.league_id, {
          userId: setup.settings.userId, force: opts.force, mode: effectiveMode(setup.settings, l.league_id, l.settings.type),
        });
        return { league: l, ctx, summary: summarize(ctx) };
      } catch (e) {
        return { league: l, ctx: null, summary: null, error: (e as Error).message };
      }
    }),
  );
  return results;
}

export const formatLabel = (l: League) => {
  const f = leagueFormat(l);
  return f === "dynasty" ? "Dynasty" : f === "keeper" ? "Keeper" : "Redraft";
};
