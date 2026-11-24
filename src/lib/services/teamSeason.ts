/** A team's season week by week: scores, opponents, weekly rank, all-play record and points by position. */
import type { LeagueContext } from "./league";

export interface WeekResult {
  week: number;
  pts: number;
  opp: { rosterId: number; name: string; pts: number } | null;
  won: boolean | null;
  /** 1 = highest score in the league that week. */
  rank: number;
  allPlayW: number;
  allPlayL: number;
  leagueAvg: number;
  leagueHigh: number;
  /** Points from starters by position. */
  byPos: Record<string, number>;
  /** Points left on the bench (bench players' points, for context). */
  benchPts: number;
}

export function playedWeeks(ctx: LeagueContext) {
  const last = ctx.seasonOver ? ctx.lastWeek : ctx.currentWeek - 1;
  return Array.from({ length: Math.max(0, Math.min(last, ctx.matchupsByWeek.length)) }, (_, i) => i + 1);
}

export function seasonResults(ctx: LeagueContext, rosterId: number): WeekResult[] {
  const out: WeekResult[] = [];
  for (const week of playedWeeks(ctx)) {
    const ms = (ctx.matchupsByWeek[week - 1] ?? []).filter((m) => m.points > 0 || m.starters.length);
    const me = ms.find((m) => m.roster_id === rosterId);
    if (!me || !ms.length) continue;
    const o = me.matchup_id ? ms.find((m) => m.matchup_id === me.matchup_id && m.roster_id !== rosterId) : undefined;
    const scores = ms.map((m) => m.points);
    const byPos: Record<string, number> = {};
    for (const pid of me.starters) {
      const pos = ctx.players.get(pid)?.pos ?? "?";
      byPos[pos] = (byPos[pos] ?? 0) + (me.players_points[pid] ?? 0);
    }
    const startSet = new Set(me.starters);
    const benchPts = me.players.filter((p) => !startSet.has(p)).reduce((a, p) => a + (me.players_points[p] ?? 0), 0);
    out.push({
      week, pts: me.points,
      opp: o ? { rosterId: o.roster_id, name: ctx.teams.find((t) => t.rosterId === o.roster_id)?.name ?? "Opponent", pts: o.points } : null,
      won: o ? (me.points === o.points ? null : me.points > o.points) : null,
      rank: 1 + scores.filter((s) => s > me.points).length,
      allPlayW: scores.filter((s) => s < me.points).length, allPlayL: scores.filter((s) => s > me.points).length,
      leagueAvg: scores.reduce((a, b) => a + b, 0) / scores.length, leagueHigh: Math.max(...scores),
      byPos, benchPts,
    });
  }
  return out;
}

export function seasonSummary(ctx: LeagueContext, rosterId: number) {
  const r = seasonResults(ctx, rosterId);
  const pts = r.map((x) => x.pts);
  const n = pts.length || 1;
  const avg = pts.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(pts.reduce((a, b) => a + (b - avg) ** 2, 0) / n);
  const apW = r.reduce((a, x) => a + x.allPlayW, 0), apL = r.reduce((a, x) => a + x.allPlayL, 0);
  const wins = r.filter((x) => x.won === true).length;
  // Expected wins if you'd played a random team each week = all-play win rate × games.
  const expWins = apW + apL ? (apW / (apW + apL)) * r.filter((x) => x.won !== null).length : 0;
  let streak = 0;
  for (let i = r.length - 1; i >= 0; i--) { const w = r[i].won; if (w === null) break; if (streak === 0) streak = w ? 1 : -1; else if ((streak > 0) === w) streak += w ? 1 : -1; else break; }
  const sorted = [...pts].sort((a, b) => a - b);
  return {
    results: r, avg, sd, median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    best: r.reduce<WeekResult | null>((a, x) => (!a || x.pts > a.pts ? x : a), null),
    worst: r.reduce<WeekResult | null>((a, x) => (!a || x.pts < a.pts ? x : a), null),
    last3: pts.slice(-3).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(3, pts.length)),
    allPlay: { w: apW, l: apL }, wins, expWins, luck: wins - expWins, streak,
    topScores: r.filter((x) => x.rank === 1).length,
  };
}

/** Every team's average points per game, high to low. */
export function leaguePpg(ctx: LeagueContext) {
  const weeks = playedWeeks(ctx).length || 1;
  return ctx.teams.map((t) => ({ rosterId: t.rosterId, name: t.name, avatar: t.avatar, ppg: t.pointsFor / weeks, papg: t.pointsAgainst / weeks })).sort((a, b) => b.ppg - a.ppg);
}
