import { weeklyStats } from "../nflverse";
import { getLeagueContext, type LeagueContext } from "./league";
import { effectiveMode } from "../settings";
import type { Setup } from "./portfolio";

export interface PlayerCardData {
  id: string;
  name: string;
  pos: string;
  team: string | null;
  number: number | null;
  age: number | null;
  height: string | null;
  weight: number | null;
  college: string | null;
  yearsExp: number | null;
  draft: string | null;
  injury: string | null;
  injuryPart: string | null;
  leagueName: string;
  leagueMode: "redraft" | "dynasty";
  ownership: { leagueId: string; league: string; owner: string; mine: boolean; starter: boolean; value: number; mode: string }[];
  weeks: { week: number; opp: string | null; actual: number | null; proj: number | null; snap: number | null; opp_volume: number | null; bye: boolean }[];
  projection: { median: number; low: number; high: number; base: number; ros: number; confidence: string; notes: string[]; usage: number; env: number; matchup: number; opponent: string | null } | null;
  values: { redraft: number; dynasty: number; posRankRedraft: number; posRankDynasty: number; rosVorp: number } | null;
  replacement: number | null;
  projSource: "sleeper" | "model" | null;
  modelMedian: number | null;
  season: { games: number; lines: { label: string; value: string }[] } | null;
  extras: {
    contract: string | null; contractNote: string | null; durability: string; reportsOut: number; recentInjuries: string[];
    prevSeason: string | null; offense: string | null; outlookRos: number; outlookPlayoffs: number;
  } | null;
}

/** Everything on the player card for one league (the one you're looking at). */
export async function playerCard(ctx: LeagueContext, id: string): Promise<PlayerCardData | null> {
  const p = ctx.players.get(id);
  if (!p) return null;
  const ex = ctx.extras.get(id);
  const pr = ctx.projections.get(id);
  const v = ctx.values.get(id);
  const log = new Map((ctx.logs.get(id) ?? []).map((g) => [g.week, g]));
  const weeks = Array.from({ length: ctx.lastWeek }, (_, i) => i + 1).map((w) => {
    const g = log.get(w);
    const opp = p.team ? ctx.nflOpponents.get(p.team)?.get(w) ?? null : null;
    return {
      week: w, opp, bye: !!p.team && ctx.nflOpponents.has(p.team) && !opp,
      actual: w < ctx.currentWeek ? g?.pts ?? (opp ? 0 : null) : null,
      proj: w >= Math.min(ctx.currentWeek, ctx.lastWeek) ? pr?.byWeek[w] ?? null : null,
      snap: g?.snapPct !== null && g?.snapPct !== undefined ? Math.round(g.snapPct * 100) : null,
      opp_volume: g?.opportunity ?? null,
    };
  });

  // Season stat totals from NFLverse
  let season: PlayerCardData["season"] = null;
  if (p.gsis) {
    const rows = (await weeklyStats(ctx.league.season).catch(() => null))?.data.filter((s) => s.gsis === p.gsis) ?? [];
    if (rows.length) {
      const t = (f: (s: (typeof rows)[number]) => number) => rows.reduce((a, s) => a + f(s), 0);
      const lines: { label: string; value: string }[] = [];
      if (t((s) => s.att) > 0) lines.push({ label: "Passing", value: `${t((s) => s.cmp)}/${t((s) => s.att)} · ${t((s) => s.passYd)} yds · ${t((s) => s.passTd)} TD · ${t((s) => s.int)} INT` });
      if (t((s) => s.car) > 0) lines.push({ label: "Rushing", value: `${t((s) => s.car)} car · ${t((s) => s.rushYd)} yds · ${(t((s) => s.rushYd) / Math.max(1, t((s) => s.car))).toFixed(1)} ypc · ${t((s) => s.rushTd)} TD` });
      if (t((s) => s.tgt) > 0) lines.push({ label: "Receiving", value: `${t((s) => s.rec)}/${t((s) => s.tgt)} tgt · ${t((s) => s.recYd)} yds · ${t((s) => s.recTd)} TD · ${Math.round((100 * t((s) => s.tgtShare)) / rows.length)}% tgt share` });
      if (t((s) => s.fgm0_19 + s.fgm20_29 + s.fgm30_39 + s.fgm40_49 + s.fgm50p) > 0) lines.push({ label: "Kicking", value: `${t((s) => s.fgm0_19 + s.fgm20_29 + s.fgm30_39 + s.fgm40_49 + s.fgm50p)} FG · ${t((s) => s.xpm)} XP` });
      if (t((s) => s.tklSolo + s.tklAst) > 0) lines.push({ label: "Defense", value: `${t((s) => s.tklSolo + s.tklAst)} tkl · ${t((s) => s.sack)} sk · ${t((s) => s.defInt)} INT` });
      season = { games: rows.length, lines };
    }
  }

  const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);
  const data: PlayerCardData = {
    id, name: p.name, pos: p.pos, team: p.team, number: ex?.number ?? null, age: p.age, height: ex?.height ?? null, weight: ex?.weight ?? null,
    college: ex?.college ?? null, yearsExp: p.yearsExp, draft: ex?.draftRound ? `Round ${ex.draftRound}${ex.draftPick ? `, pick ${ex.draftPick}` : ""}` : p.yearsExp !== null && p.yearsExp >= 0 && ex ? "Undrafted" : null,
    injury: p.injury, injuryPart: p.injuryPart, leagueName: ctx.league.name, leagueMode: ctx.valuationMode, ownership: [], weeks,
    projection: pr ? {
      median: pr.median, low: pr.low, high: pr.high, base: pr.base, ros: Math.round(Object.values(pr.byWeek).reduce((a, b) => a + b, 0)),
      confidence: pr.confidence, notes: pr.notes, usage: pr.usageFactor, env: pr.envFactor, matchup: pr.matchupFactor, opponent: pr.opponent,
    } : null,
    values: v ? { redraft: v.redraft, dynasty: v.dynasty, posRankRedraft: v.posRankRedraft, posRankDynasty: v.posRankDynasty, rosVorp: v.rosVorp } : null,
    replacement: ctx.replacement[p.pos] ?? null, projSource: pr?.source ?? null, modelMedian: pr?.modelMedian ?? null,
    season,
    extras: ex ? {
      contract: ex.contract ? `${money(ex.contract.apy)}/yr through ${ex.contract.endYear}` : null,
      contractNote: ex.contract ? `${ex.contract.years}-year deal signed ${ex.contract.yearSigned} · ${money(ex.contract.guaranteed)} guaranteed` : null,
      durability: ex.gamesPossible ? `${ex.gamesPlayed}/${ex.gamesPossible} games (${ex.durabilityPct}%) last season + this season` : "Not enough games",
      reportsOut: ex.reportsOut, recentInjuries: ex.recentInjuries,
      prevSeason: ex.prevSeason ? `${ex.prevSeason.ppg} pts/g over ${ex.prevSeason.games} games` : null,
      offense: ex.offense ? `#${ex.offense.rank} of 32 (${ex.offense.ppg} fantasy pts/g, ${ex.offense.trend >= 0 ? "+" : ""}${ex.offense.trend}% last 4)` : null,
      outlookRos: ex.outlookRos, outlookPlayoffs: ex.outlookPlayoffs,
    } : null,
  };
  return data;
}

/** Who has this player in each of your leagues. */
export async function ownershipAcross(setup: Setup, id: string): Promise<PlayerCardData["ownership"]> {
  const out: PlayerCardData["ownership"] = [];
  await Promise.all(setup.leagues.map(async (l) => {
    try {
      const c = await getLeagueContext(l.league_id, { userId: setup.settings.userId, mode: effectiveMode(setup.settings, l.league_id, l.settings.type) });
      const t = c.teams.find((x) => x.players.includes(id));
      const val = c.values.get(id);
      out.push({
        leagueId: l.league_id, league: l.name, owner: t ? (t.rosterId === c.myRosterId ? "You" : t.name) : c.players.has(id) ? "Free agent" : "Not in pool",
        mine: !!t && t.rosterId === c.myRosterId, starter: !!t && t.starters.includes(id),
        value: val ? (c.valuationMode === "dynasty" ? val.dynasty : val.redraft) : 0, mode: c.valuationMode,
      });
    } catch { /* league unavailable */ }
  }));
  const order = setup.leagues.map((l) => l.league_id);
  return out.sort((a, b) => order.indexOf(a.leagueId) - order.indexOf(b.leagueId));
}
