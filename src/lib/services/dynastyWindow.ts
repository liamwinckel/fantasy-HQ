/**
 * Dynasty window: how strong every roster is likely to be this season and the next two, from each player's healthy
 * points per game aged forward with his position's age curve (rookies and young players improve, older players
 * decline), best possible lineup each year. Shows when your title window is open, and who's rising or fading.
 */
import type { LeagueContext } from "./league";
import { ageMultiplier } from "../engine/values";
import { optimizeLineup, lineupTotal } from "../engine/lineup";

export interface WindowRow { rosterId: number; name: string; years: number[]; ranks: number[]; trend: "rising" | "steady" | "fading" }

export function dynastyWindow(ctx: LeagueContext, years = 3): { seasons: number[]; rows: WindowRow[] } {
  const season = Number(ctx.league.season);
  const seasons = Array.from({ length: years }, (_, i) => season + i);
  const rows = ctx.teams.map((t) => {
    const ids = t.players.filter((id) => ctx.players.has(id));
    const ys = seasons.map((_, y) => {
      const lu = optimizeLineup(ctx.league.roster_positions, ids.map((id) => {
        const p = ctx.players.get(id)!;
        const base = ctx.projections.get(id)?.base ?? 0;
        const k = p.age === null ? 1 : ageMultiplier(p.pos, p.age + y) / Math.max(0.01, ageMultiplier(p.pos, p.age));
        return { id, positions: p.positions, points: base * k * (y ? ctx.extras.get(id)?.durability ?? 1 : 1) };
      }));
      return Math.round(lineupTotal(lu) * 10) / 10;
    });
    return { rosterId: t.rosterId, name: t.name, years: ys, ranks: [] as number[], trend: "steady" as WindowRow["trend"] };
  });
  seasons.forEach((_, y) => [...rows].sort((a, b) => b.years[y] - a.years[y]).forEach((r, i) => (r.ranks[y] = i + 1)));
  for (const r of rows) { const d = r.ranks[0] - r.ranks[years - 1]; r.trend = d >= 2 ? "rising" : d <= -2 ? "fading" : "steady"; }
  return { seasons, rows: rows.sort((a, b) => a.ranks[1] - b.ranks[1]) };
}
