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
  /** Rounds added to the drafted round (0–5). Legacy "same"/"+1"… values are still read. */
  modifier: KeeperModifier | number;
  undraftedRound: number;
  overrides: Record<string, number>; // playerId → cost round
  /** Direction of escalation: "earlier" (+1 = one round earlier, default) or "later". */
  direction: "earlier" | "later";
  /** Extra rounds of escalation for every season he's already been kept (0 = none). */
  perYearKept: number;
  /** A player can be kept at most this many seasons in a row (0 = no limit). */
  maxYears: number;
  /** Players drafted in rounds 1…N can't be kept (0 = any round can be kept). */
  protectedRounds: number;
  /** Value horizon: next season only, or next two (weights 1 and 0.6). */
  horizon: 1 | 2;
}

export interface KeeperExtra {
  /** Seasons in a row each player has already been kept (from Sleeper drafts). */
  yearsKept?: Map<string, number>;
  /** Draft size, for pick numbers and ranges. */
  teams?: number;
  /** Roster id → team name (who drafted him). */
  teamName?: (rosterId: number) => string;
}

export interface KeeperRow {
  playerId: string;
  name: string;
  pos: string;
  team: string | null;
  age: number | null;
  draftedRound: number | null; // this season
  /** Pick within the round (e.g. 7 in 3.07) and overall pick number. */
  draftedPick: number | null;
  draftedOverall: number | null;
  draftedBy: string | null;
  wasKeeper: boolean;
  yearsKept: number;
  /** Why he can't be kept, when he can't. */
  ineligible: string | null;
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
export const modRounds = (m: KeeperRules["modifier"]) => (typeof m === "number" ? m : MOD[m] ?? 1);

export function keeperPlan(ctx: LeagueContext, rosterId: number, picks: DraftPick[], rules: KeeperRules, rounds: number, extra: KeeperExtra = {}): KeeperRow[] {
  const team = ctx.teams.find((t) => t.rosterId === rosterId)!;
  const T = ctx.teamsCount;
  const T2 = extra.teams || T;
  const ppgAt = (id: string, yearsAhead: number) => {
    const p = ctx.players.get(id);
    const pr = ctx.projections.get(id);
    if (!p || !pr) return 0;
    const ratio = p.age === null ? 1 : ageMultiplier(p.pos, p.age + yearsAhead) / Math.max(0.01, ageMultiplier(p.pos, p.age));
    return pr.base * ratio * (ctx.extras.get(id)?.durability ?? 1);
  };
  // Next season, or next two seasons blended (the second counts 60%) when keepers can be held longer.
  const nextPpg = (id: string) => (rules.horizon === 2 ? (ppgAt(id, 1) + 0.6 * ppgAt(id, 2)) / 1.6 : ppgAt(id, 1));
  const surplusOf = (id: string) => Math.max(0, nextPpg(id) - (ctx.replacement[ctx.players.get(id)?.pos ?? ""] ?? 0) * 0.9);
  // Draft pool: every relevant player, ranked by next-season surplus.
  const pool = [...ctx.players.keys()].filter((id) => ctx.players.get(id)!.team).map(surplusOf).sort((a, b) => b - a);
  // Typical value of a pick in round r: the player ranked in the middle of that round.
  const roundValue = (r: number) => pool[Math.min(pool.length - 1, Math.max(0, Math.round((r - 1) * T2 + T2 / 2) - 1))] ?? 0;
  const byPlayer = new Map(picks.map((p) => [p.player_id, p]));
  const rows: KeeperRow[] = team.players.filter((id) => ctx.players.has(id) && ctx.players.get(id)!.pos !== "DEF").map((id) => {
    const p = ctx.players.get(id)!;
    const pick = byPlayer.get(id);
    const years = extra.yearsKept?.get(id) ?? (pick?.is_keeper ? 1 : 0);
    let cost: number | null;
    let source: KeeperRow["costSource"];
    let ineligible: string | null = null;
    if (rules.overrides[id]) { cost = rules.overrides[id]; source = "manual"; }
    else if (pick) {
      // Escalation: the base modifier plus extra rounds for each season he's already been kept.
      const steps = modRounds(rules.modifier) + rules.perYearKept * years;
      cost = pick.round + steps * (rules.direction === "earlier" ? -1 : 1);
      source = "drafted";
    } else { cost = rules.undraftedRound; source = "undrafted"; }
    if (!rules.overrides[id]) {
      if (rules.maxYears > 0 && years >= rules.maxYears) ineligible = `Kept ${years} season${years === 1 ? "" : "s"} already (limit ${rules.maxYears})`;
      else if (pick && rules.protectedRounds > 0 && pick.round <= rules.protectedRounds && !pick.is_keeper) ineligible = `Drafted in round ${pick.round}; rounds 1–${rules.protectedRounds} can't be kept`;
    }
    let capped = false;
    if (cost !== null && cost < 1) { cost = 1; capped = true; } // can't escalate past round 1
    if (cost !== null && cost > rounds) { cost = rounds; capped = true; }
    if (ineligible) cost = null;
    const kv = surplusOf(id);
    const rv = cost !== null ? roundValue(cost) : 0;
    const inRound = pick ? ((pick.pick_no - 1) % T2) + 1 : null;
    return {
      playerId: id, name: p.name, pos: p.pos, team: p.team, age: p.age, draftedRound: pick?.round ?? null,
      draftedPick: inRound, draftedOverall: pick?.pick_no ?? null, draftedBy: pick?.roster_id != null && extra.teamName ? extra.teamName(pick.roster_id) : null,
      wasKeeper: !!pick?.is_keeper, yearsKept: years, ineligible,
      costRound: cost, costSource: source, capped, nextSeasonPpg: Math.round(nextPpg(id) * 10) / 10, keeperValue: Math.round(kv * 10) / 10,
      roundValue: Math.round(rv * 10) / 10, surplus: cost === null ? -Infinity : Math.round((kv - rv) * 10) / 10, recommended: false,
    };
  });
  rows.sort((a, b) => b.surplus - a.surplus);
  rows.filter((r) => r.costRound !== null && r.surplus > 0).slice(0, rules.maxKeepers).forEach((r) => (r.recommended = true));
  return rows;
}
