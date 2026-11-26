/**
 * Cross-league check for Home: what needs fixing before kickoff in every league at once, how much of your week rides
 * on each player (exposure), and where your own starters work against each other (e.g. your QB facing your defense).
 * Read-only: nothing here changes a lineup in Sleeper.
 */
import type { LeagueContext } from "./league";

export type IssueKind = "out" | "doubtful" | "questionable" | "bye" | "empty" | "lineup";
export interface Issue {
  leagueId: string;
  league: string;
  kind: IssueKind;
  severity: "high" | "medium";
  playerId: string | null;
  text: string;
}
export interface Exposure {
  playerId: string;
  name: string;
  pos: string;
  team: string | null;
  leagues: { leagueId: string; league: string; starting: boolean }[];
  starting: number;
  injury: string | null;
}
export interface Conflict {
  leagueId: string;
  league: string;
  text: string;
}
export interface CrossLeague { issues: Issue[]; exposure: Exposure[]; conflicts: Conflict[]; leaguesChecked: number }

const OUT = new Set(["Out", "IR", "PUP", "Sus", "Suspended", "NA"]);

export function crossLeague(ctxs: LeagueContext[]): CrossLeague {
  const issues: Issue[] = [];
  const conflicts: Conflict[] = [];
  const expo = new Map<string, Exposure>();
  let checked = 0;
  for (const ctx of ctxs) {
    if (ctx.myRosterId === null || ctx.seasonOver) continue;
    const lu = ctx.lineups.get(ctx.myRosterId);
    const team = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
    if (!lu || !team) continue;
    checked++;
    const id = ctx.league.league_id, league = ctx.league.name;
    const week = Math.min(ctx.currentWeek, ctx.lastWeek);
    const locked = new Set(lu.locked);
    const starters = new Set<string>();
    for (const s of lu.current) {
      if (!s.playerId) { issues.push({ leagueId: id, league, kind: "empty", severity: "high", playerId: null, text: `Empty ${s.slot} slot` }); continue; }
      starters.add(s.playerId);
      if (locked.has(s.playerId)) continue; // game already started: nothing to fix
      const p = ctx.players.get(s.playerId);
      const pr = ctx.projections.get(s.playerId);
      if (!p) continue;
      if (pr?.onBye) issues.push({ leagueId: id, league, kind: "bye", severity: "high", playerId: p.id, text: `${p.name} is on bye` });
      else if (p.injury && OUT.has(p.injury)) issues.push({ leagueId: id, league, kind: "out", severity: "high", playerId: p.id, text: `${p.name} is ${p.injury === "IR" ? "on IR" : p.injury.toLowerCase()}` });
      else if (p.injury === "Doubtful") issues.push({ leagueId: id, league, kind: "doubtful", severity: "high", playerId: p.id, text: `${p.name} is doubtful` });
      else if (p.injury === "Questionable") issues.push({ leagueId: id, league, kind: "questionable", severity: "medium", playerId: p.id, text: `${p.name} is questionable` });
    }
    if (lu.gain >= 1) issues.push({ leagueId: id, league, kind: "lineup", severity: lu.gain >= 4 ? "high" : "medium", playerId: null, text: `Best lineup projects +${lu.gain.toFixed(1)} pts` });

    for (const pid of team.players) {
      const p = ctx.players.get(pid);
      if (!p) continue;
      const e = expo.get(pid) ?? { playerId: pid, name: p.name, pos: p.pos, team: p.team, leagues: [], starting: 0, injury: p.injury };
      e.leagues.push({ leagueId: id, league, starting: starters.has(pid) });
      if (starters.has(pid)) e.starting++;
      expo.set(pid, e);
    }

    // Working against yourself: a starter facing your own starting defense, or two starters at QB on opposite sides.
    const opp = (t: string | null) => (t ? ctx.nflOpponents.get(t)?.get(week) ?? null : null);
    const startPlayers = [...starters].map((pid) => ctx.players.get(pid)).filter(Boolean) as NonNullable<ReturnType<typeof ctx.players.get>>[];
    const defs = startPlayers.filter((p) => p.pos === "DEF");
    for (const d of defs) {
      const facing = startPlayers.filter((p) => p.pos !== "DEF" && p.team && opp(p.team) === d.team);
      if (facing.length) conflicts.push({ leagueId: id, league, text: `${facing.map((p) => p.name).join(", ")} ${facing.length > 1 ? "face" : "faces"} your ${d.name} defense` });
    }
    const qbs = startPlayers.filter((p) => p.pos === "QB");
    for (let i = 0; i < qbs.length; i++) for (let j = i + 1; j < qbs.length; j++)
      if (qbs[i].team && opp(qbs[i].team) === qbs[j].team) conflicts.push({ leagueId: id, league, text: `${qbs[i].name} and ${qbs[j].name} play each other (a shootout helps both, a slog hurts both)` });
  }
  const exposure = [...expo.values()].filter((e) => e.leagues.length >= 2).sort((a, b) => b.starting - a.starting || b.leagues.length - a.leagues.length);
  const rank = { high: 0, medium: 1 } as const;
  issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { issues, exposure, conflicts, leaguesChecked: checked };
}
