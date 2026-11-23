/**
 * Stats & schedule: fantasy points allowed by NFL defenses (this league's scoring), strength of schedule,
 * a sortable player stats table and fantasy-team scoring stats.
 */
import type { LeagueContext } from "./league";

export const SOS_POS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
export type SosPos = (typeof SOS_POS)[number];

export interface DefenseRow {
  team: string;
  /** Fantasy points allowed per game to each position, in this league's scoring. */
  allowed: Partial<Record<SosPos, number>>;
  /** Allowed vs league average (1.10 = gives up 10% more than average). */
  factor: Partial<Record<SosPos, number>>;
  /** 1 = gives up the most (easiest matchup). */
  rank: Partial<Record<SosPos, number>>;
}

export interface ScheduleRow {
  team: string;
  /** Average opponent factor over the remaining regular season + fantasy playoffs (1 = average, higher = easier). */
  ros: Partial<Record<SosPos, number>>;
  rosRank: Partial<Record<SosPos, number>>;
  playoffs: Partial<Record<SosPos, number>>;
  playoffRank: Partial<Record<SosPos, number>>;
  /** Week → opponent (null = bye). */
  weeks: Record<number, string | null>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function defenseTable(ctx: LeagueContext): DefenseRow[] {
  const sum = new Map<string, Partial<Record<SosPos, number>>>();
  const games = new Map<string, Set<number>>();
  for (const p of ctx.players.values()) {
    if (!SOS_POS.includes(p.pos as SosPos) || !p.team) continue;
    for (const g of ctx.logs.get(p.id) ?? []) {
      const opp = ctx.nflOpponents.get(p.team)?.get(g.week);
      if (!opp) continue;
      const row = sum.get(opp) ?? {};
      row[p.pos as SosPos] = (row[p.pos as SosPos] ?? 0) + g.pts;
      sum.set(opp, row);
      (games.get(opp) ?? games.set(opp, new Set()).get(opp)!).add(g.week);
    }
  }
  const rows: DefenseRow[] = [...sum].map(([team, s]) => {
    const n = games.get(team)?.size || 1;
    const allowed: DefenseRow["allowed"] = {};
    for (const pos of SOS_POS) if (s[pos] !== undefined) allowed[pos] = Math.round((s[pos]! / n) * 10) / 10;
    return { team, allowed, factor: {}, rank: {} };
  });
  for (const pos of SOS_POS) {
    const avg = mean(rows.map((r) => r.allowed[pos]).filter((x): x is number => x !== undefined));
    for (const r of rows) if (r.allowed[pos] !== undefined && avg > 0) r.factor[pos] = Math.round((r.allowed[pos]! / avg) * 100) / 100;
    [...rows].filter((r) => r.allowed[pos] !== undefined).sort((a, b) => b.allowed[pos]! - a.allowed[pos]!).forEach((r, i) => (r.rank[pos] = i + 1));
  }
  return rows.sort((a, b) => a.team.localeCompare(b.team));
}

export function scheduleTable(ctx: LeagueContext, def: DefenseRow[]): { rows: ScheduleRow[]; weeks: number[]; playoffWeeks: number[] } {
  const byTeam = new Map(def.map((d) => [d.team, d]));
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const weeks = ctx.seasonOver ? [] : Array.from({ length: ctx.lastWeek - w0 + 1 }, (_, i) => w0 + i);
  const playoffWeeks = weeks.filter((w) => w >= ctx.playoffStart);
  const rows: ScheduleRow[] = [...ctx.nflOpponents.keys()].sort().map((team) => {
    const opps = ctx.nflOpponents.get(team)!;
    const wk: Record<number, string | null> = {};
    for (const w of weeks) wk[w] = opps.get(w) ?? null;
    const avgOver = (ws: number[], pos: SosPos) => {
      const fs = ws.map((w) => opps.get(w)).filter((o): o is string => !!o).map((o) => byTeam.get(o)?.factor[pos]).filter((x): x is number => x !== undefined);
      return fs.length ? Math.round(mean(fs) * 100) / 100 : undefined;
    };
    const ros: ScheduleRow["ros"] = {};
    const playoffs: ScheduleRow["playoffs"] = {};
    for (const pos of SOS_POS) {
      const r = avgOver(weeks, pos);
      if (r !== undefined) ros[pos] = r;
      const pl = avgOver(playoffWeeks, pos);
      if (pl !== undefined) playoffs[pos] = pl;
    }
    return { team, ros, rosRank: {}, playoffs, playoffRank: {}, weeks: wk };
  });
  for (const pos of SOS_POS) {
    [...rows].filter((r) => r.ros[pos] !== undefined).sort((a, b) => b.ros[pos]! - a.ros[pos]!).forEach((r, i) => (r.rosRank[pos] = i + 1));
    [...rows].filter((r) => r.playoffs[pos] !== undefined).sort((a, b) => b.playoffs[pos]! - a.playoffs[pos]!).forEach((r, i) => (r.playoffRank[pos] = i + 1));
  }
  return { rows, weeks, playoffWeeks };
}

export interface PlayerStatRow {
  id: string; name: string; pos: string; team: string | null; age: number | null; injury: string | null;
  owner: string; mine: boolean;
  games: number; total: number; ppg: number; last4: number; best: number;
  projWeek: number; rosPpg: number; value: number;
  snapPct: number | null; // season
  tgt: number; tgtShare: number | null; rec: number; recYd: number; car: number; rushYd: number;
  passYd: number; passTd: number; int: number; td: number;
}

export function playerStats(ctx: LeagueContext): PlayerStatRow[] {
  const byGsis = new Map<string, typeof ctx.stats>();
  for (const s of ctx.stats) if (s.week < ctx.currentWeek) (byGsis.get(s.gsis) ?? byGsis.set(s.gsis, []).get(s.gsis)!).push(s);
  const ownerOf = new Map<string, { name: string; mine: boolean }>();
  for (const t of ctx.teams) for (const id of t.players) ownerOf.set(id, { name: t.rosterId === ctx.myRosterId ? "You" : t.name, mine: t.rosterId === ctx.myRosterId });
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";
  const rows: PlayerStatRow[] = [];
  for (const p of ctx.players.values()) {
    const log = ctx.logs.get(p.id) ?? [];
    const pr = ctx.projections.get(p.id);
    if (!log.length && !(pr && pr.median > 0)) continue;
    const st = p.gsis ? byGsis.get(p.gsis) ?? [] : [];
    const t = (f: (s: (typeof st)[number]) => number) => st.reduce((a, s) => a + f(s), 0);
    const pts = log.map((g) => g.pts);
    const snaps = log.map((g) => g.snapPct).filter((x): x is number => x !== null);
    const o = ownerOf.get(p.id);
    rows.push({
      id: p.id, name: p.name, pos: p.pos, team: p.team, age: p.age, injury: p.injury,
      owner: o?.name ?? "Free agent", mine: !!o?.mine,
      games: log.length, total: r1(pts.reduce((a, b) => a + b, 0)), ppg: r1(mean(pts)), last4: r1(mean(pts.slice(-4))), best: r1(Math.max(0, ...pts)),
      projWeek: pr?.median ?? 0, rosPpg: pr?.base ?? 0, value: ctx.values.get(p.id)?.[key] ?? 0,
      snapPct: snaps.length ? Math.round(mean(snaps) * 100) : null,
      tgt: t((s) => s.tgt), tgtShare: st.length && t((s) => s.tgt) > 0 ? Math.round((100 * t((s) => s.tgtShare)) / st.length) : null,
      rec: t((s) => s.rec), recYd: t((s) => s.recYd), car: t((s) => s.car), rushYd: t((s) => s.rushYd),
      passYd: t((s) => s.passYd), passTd: t((s) => s.passTd), int: t((s) => s.int), td: t((s) => s.rushTd + s.recTd),
    });
  }
  return rows.sort((a, b) => b.total - a.total);
}

export interface TeamStatRow {
  rosterId: number; name: string; avatar: string | null;
  record: string; pf: number; pa: number; avg: number; high: number; low: number;
  /** Record if you played every team every week. */
  allPlay: { w: number; l: number; pct: number };
  /** Wins minus all-play expected wins: + = lucky, − = unlucky. */
  luck: number;
  weekly: number[];
}

export function teamStats(ctx: LeagueContext): TeamStatRow[] {
  const lastPlayed = Math.min(ctx.currentWeek - 1, ctx.playoffStart - 1);
  const weeks = ctx.matchupsByWeek.slice(0, Math.max(0, lastPlayed));
  return ctx.teams.map((t) => {
    const weekly = weeks.map((ms) => ms.find((m) => m.roster_id === t.rosterId)?.points ?? 0);
    let w = 0, l = 0;
    weeks.forEach((ms, i) => {
      for (const m of ms) {
        if (m.roster_id === t.rosterId) continue;
        if (weekly[i] > m.points) w++;
        else if (weekly[i] < m.points) l++;
      }
    });
    const pct = w + l ? w / (w + l) : 0;
    const games = t.wins + t.losses + t.ties;
    return {
      rosterId: t.rosterId, name: t.name, avatar: t.avatar,
      record: `${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ""}`, pf: t.pointsFor, pa: t.pointsAgainst,
      avg: r1(mean(weekly.filter((x) => x > 0))), high: r1(Math.max(0, ...weekly)), low: r1(Math.min(...(weekly.filter((x) => x > 0).length ? weekly.filter((x) => x > 0) : [0]))),
      allPlay: { w, l, pct: Math.round(pct * 1000) / 10 }, luck: r1(t.wins - pct * games), weekly,
    };
  }).sort((a, b) => b.pf - a.pf);
}

const r1 = (x: number) => Math.round(x * 10) / 10;
