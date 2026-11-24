/**
 * Waiver planner: the next few weeks, not just this one. For each upcoming week it finds holes in your best lineup
 * (byes, injuries, weak starters) and the free agents who fill them, so you can add a bye-week fill early (before
 * other teams do) and stash players who'll matter later (returning from injury, soft schedule ahead).
 */
import type { LeagueContext } from "./league";
import { optimizeLineup, lineupTotal } from "../engine/lineup";

export interface PlanWeek {
  week: number;
  total: number;
  holes: { slot: string; name: string; pts: number; why: string }[];
}
export interface PlanTarget {
  id: string; name: string; pos: string; team: string | null; injury: string | null;
  gains: Record<number, number>; total: number; bestWeek: number; why: string; kind: "fill" | "upgrade" | "stash";
}

const OUT = ["Out", "IR", "PUP", "NFI", "Sus", "Doubtful"];

export function waiverPlan(ctx: LeagueContext, rosterId: number, horizon = 4): { weeks: PlanWeek[]; targets: PlanTarget[]; drop: { id: string; name: string } | null } {
  const t = ctx.teams.find((x) => x.rosterId === rosterId)!;
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const weeks = Array.from({ length: Math.min(horizon, ctx.lastWeek - w0 + 1) }, (_, i) => w0 + i);
  const roster = t.players.filter((id) => !t.taxi.includes(id) && !t.reserve.includes(id) && ctx.players.has(id));
  const pts = (id: string, w: number) => ctx.projections.get(id)?.byWeek[w] ?? 0;
  const lu = (ids: string[], w: number) => optimizeLineup(ctx.league.roster_positions, ids.map((id) => ({ id, positions: ctx.players.get(id)?.positions ?? [], points: pts(id, w) })));
  const base = new Map(weeks.map((w) => [w, lu(roster, w)]));
  const planWeeks: PlanWeek[] = weeks.map((w) => {
    const a = base.get(w)!;
    const holes = a.filter((s) => !["BN", "IR", "TAXI"].includes(s.slot)).flatMap((s) => {
      const p = s.playerId ? ctx.players.get(s.playerId) : null;
      const repl = ctx.replacement[p?.pos ?? ""] ?? 0;
      if (!p) return [{ slot: s.slot, name: "Empty", pts: 0, why: "No one to start" }];
      const pr = ctx.projections.get(p.id);
      const bye = !!p.team && !ctx.nflOpponents.get(p.team)?.get(w);
      if (bye || pts(p.id, w) === 0) return [{ slot: s.slot, name: p.name, pts: 0, why: bye ? "Bye week" : "Not expected to play" }];
      if (s.points < repl * 0.8 && (pr?.base ?? 0) < repl) return [{ slot: s.slot, name: p.name, pts: s.points, why: "Below a typical waiver option" }];
      return [];
    });
    return { week: w, total: lineupTotal(a), holes };
  });
  // Free agents worth checking: the best by healthy points per game at each position, plus injured stashes.
  const rostered = new Set(ctx.teams.flatMap((x) => x.players));
  const fa = [...ctx.players.values()].filter((p) => p.team && !rostered.has(p.id) && ["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.pos))
    .sort((a, b) => (ctx.projections.get(b.id)?.base ?? 0) - (ctx.projections.get(a.id)?.base ?? 0)).slice(0, 80);
  const targets: PlanTarget[] = [];
  for (const p of fa) {
    const gains: Record<number, number> = {};
    let total = 0;
    for (const w of weeks) { const g = Math.max(0, lineupTotal(lu([...roster, p.id], w)) - lineupTotal(base.get(w)!)); gains[w] = Math.round(g * 10) / 10; total += g; }
    const pr = ctx.projections.get(p.id);
    const stash = OUT.includes(p.injury ?? "") && (pr?.base ?? 0) >= (ctx.replacement[p.pos] ?? 99) * 1.1;
    if (total < 1 && !stash) continue;
    const bestWeek = weeks.reduce((b, w) => (gains[w] > gains[b] ? w : b), weeks[0]);
    const spread = weeks.filter((w) => gains[w] > 0.5).length;
    const kind: PlanTarget["kind"] = stash && total < 1 ? "stash" : spread <= 2 && gains[bestWeek] > 0.6 * total ? "fill" : "upgrade";
    const why = kind === "stash" ? `${p.injury} now, ${pr?.base.toFixed(1)} pts/g when healthy: stash before he's back`
      : kind === "fill" ? `Fills your week ${bestWeek} hole (+${gains[bestWeek].toFixed(1)} pts)${bestWeek > w0 ? `: add now, before others plan for it` : ""}`
      : `Starts for you most weeks (+${(total / weeks.length).toFixed(1)} pts/g over the next ${weeks.length})`;
    targets.push({ id: p.id, name: p.name, pos: p.pos, team: p.team, injury: p.injury, gains, total: Math.round(total * 10) / 10, bestWeek, why, kind });
  }
  targets.sort((a, b) => b.total - a.total || (a.kind === "stash" ? -1 : 1));
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";
  const starters = new Set(weeks.flatMap((w) => base.get(w)!.filter((s) => s.slot !== "BN").map((s) => s.playerId)));
  const drop = roster.filter((id) => !starters.has(id)).sort((a, b) => (ctx.values.get(a)?.[key] ?? 0) - (ctx.values.get(b)?.[key] ?? 0))[0];
  return { weeks: planWeeks, targets: targets.slice(0, 12), drop: drop ? { id: drop, name: ctx.players.get(drop)?.name ?? drop } : null };
}
