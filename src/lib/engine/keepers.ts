/**
 * Keeper planning (SHS model).
 *
 * Keeper cost = the draft round you give up next year:
 *   drafted this year   → this year's round + modifier ("same", +1, +2, +3)   e.g. 5th-rounder at +1 costs a 4th
 *   undrafted / waivers → the league's "undrafted round" (default: last round)
 *   manual override     → whatever round you set for that player
 * (Lower round number = earlier = more expensive. "+1" moves the cost one round EARLIER, the usual escalation.)
 *
 * Keeper value = next season's projected points per game above replacement (healthy base × age curve to next year),
 * compared with what a pick in the cost round typically returns: the player ranked at the middle of that round
 * when every relevant player is sorted by next-season value. Surplus = keeper value − round value.
 */
import type { LeagueContext } from "../services/league";
import type { DraftPick } from "../sleeper/types";
import { ageMultiplier } from "./values";

export type KeeperModifier = "same" | "+1" | "+2" | "+3";

export interface KeeperRules {
  maxKeepers: number;
  modifier: KeeperModifier;
  undraftedRound: number;
  overrides: Record<string, number>; // playerId → cost round
  /** Direction of escalation: "earlier" (+1 = one round earlier, default) or "later". */
  direction: "earlier" | "later";
}

export interface KeeperRow {
  playerId: string;
  name: string;
  pos: string;
  team: string | null;
  age: number | null;
  draftedRound: number | null; // this season
  wasKeeper: boolean;
  costRound: number | null; // null = not eligible (beyond the draft)
  costSource: "drafted" | "undrafted" | "manual";
  capped: boolean; // escalation hit round 1 or the last round
  nextSeasonPpg: number;
  keeperValue: number; // surplus over replacement, points per game
  roundValue: number; // typical surplus from a pick in that round
  surplus: number;
  recommended: boolean;
}

const MOD: Record<KeeperModifier, number> = { same: 0, "+1": 1, "+2": 2, "+3": 3 };

export function keeperPlan(ctx: LeagueContext, rosterId: number, picks: DraftPick[], rules: KeeperRules, rounds: number): KeeperRow[] {
  const team = ctx.teams.find((t) => t.rosterId === rosterId)!;
  const T = ctx.teamsCount;
  const nextPpg = (id: string) => {
    const p = ctx.players.get(id);
    const pr = ctx.projections.get(id);
    if (!p || !pr) return 0;
    const ratio = p.age === null ? 1 : ageMultiplier(p.pos, p.age + 1) / Math.max(0.01, ageMultiplier(p.pos, p.age));
    return pr.base * ratio * (ctx.extras.get(id)?.durability ?? 1);
  };
  const surplusOf = (id: string) => Math.max(0, nextPpg(id) - (ctx.replacement[ctx.players.get(id)?.pos ?? ""] ?? 0) * 0.9);
  // Draft pool: every relevant player, ranked by next-season surplus.
  const pool = [...ctx.players.keys()].filter((id) => ctx.players.get(id)!.team).map(surplusOf).sort((a, b) => b - a);
  const roundValue = (r: number) => pool[Math.min(pool.length - 1, Math.max(0, Math.round((r - 1) * T + T / 2) - 1))] ?? 0;
  const byPlayer = new Map(picks.map((p) => [p.player_id, p]));
  const rows: KeeperRow[] = team.players.filter((id) => ctx.players.has(id) && ctx.players.get(id)!.pos !== "DEF").map((id) => {
    const p = ctx.players.get(id)!;
    const pick = byPlayer.get(id);
    let cost: number | null;
    let source: KeeperRow["costSource"];
    if (rules.overrides[id]) { cost = rules.overrides[id]; source = "manual"; }
    else if (pick) {
      const shift = MOD[rules.modifier] * (rules.direction === "earlier" ? -1 : 1);
      cost = pick.round + shift;
      source = "drafted";
    } else { cost = rules.undraftedRound; source = "undrafted"; }
    let capped = false;
    if (cost !== null && cost < 1) { cost = 1; capped = true; } // can't escalate past round 1
    if (cost !== null && cost > rounds) { cost = rounds; capped = true; }
    const kv = surplusOf(id);
    const rv = cost !== null ? roundValue(cost) : 0;
    return {
      playerId: id, name: p.name, pos: p.pos, team: p.team, age: p.age, draftedRound: pick?.round ?? null, wasKeeper: !!pick?.is_keeper,
      costRound: cost, costSource: source, capped, nextSeasonPpg: Math.round(nextPpg(id) * 10) / 10, keeperValue: Math.round(kv * 10) / 10,
      roundValue: Math.round(rv * 10) / 10, surplus: cost === null ? -Infinity : Math.round((kv - rv) * 10) / 10, recommended: false,
    };
  });
  rows.sort((a, b) => b.surplus - a.surplus);
  rows.filter((r) => r.costRound !== null && r.surplus > 0).slice(0, rules.maxKeepers).forEach((r) => (r.recommended = true));
  return rows;
}
