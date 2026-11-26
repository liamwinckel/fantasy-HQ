import { describe, expect, it } from "vitest";
import { rankings } from "@/lib/services/rankings";
import type { LeagueContext } from "@/lib/services/league";

describe("week rankings", () => {
  it("keep the experts' order within a position", () => {
    const pts = [20, 18, 18, 17.5, 15, 15, 14, 9];
    const players = new Map(pts.map((_, i) => [`r${i}`, { id: `r${i}`, name: `RB ${i}`, pos: "RB", team: "NYG", injury: null, age: 25, yearsExp: 3 }]));
    players.set("q", { id: "q", name: "QB", pos: "QB", team: "GB", injury: null, age: 25, yearsExp: 3 });
    // Experts' order differs from projections.
    const ecr = [1, 3, 2, 5, 4, 7, 6, 8];
    const ctx = {
      currentWeek: 12, lastWeek: 17, teams: [], players,
      projections: new Map([...pts.map((p, i) => [`r${i}`, { byWeek: { 12: p } }] as const), ["q", { byWeek: { 12: 18 } }]]),
      values: new Map(), consensus: Object.fromEntries([...ecr.map((e, i) => [`r${i}`, { w: e }]), ["q", { w: 1 }]]),
      league: { scoring_settings: { rec: 0.5, pass_td: 4 }, roster_positions: ["QB", "RB", "RB", "FLEX"] },
      projStats: new Map(), nflOpponents: new Map(), keeperCost: new Map(), startedTeams: new Set(),
    } as unknown as LeagueContext;
    const rows = rankings(ctx, "week").filter((r) => r.pos === "RB");
    expect(rows.map((r) => r.ecrPos)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
