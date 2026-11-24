import { sleeper } from "../sleeper/client";
import { keeperPlan, type KeeperRules } from "../engine/keepers";
import type { DraftPick, League } from "../sleeper/types";
import type { AppSettings } from "../settings";
import type { LeagueContext } from "./league";
import { keeperRulesFor } from "./keeperRules";

/** Keeper rules for a league (saved settings → Sleeper's max_keepers → defaults) and this season's draft. */
export async function loadKeeperPlan(settings: AppSettings, league: League, ctx: LeagueContext) {
  const rounds = league.settings.draft_rounds || 15;
  const sleeperMax = Number((league.settings as Record<string, unknown>).max_keepers) || 0;
  const rules: KeeperRules = keeperRulesFor(settings, league);
  let picks: DraftPick[] = [];
  let note: string | null = null;
  if (league.draft_id) {
    try { picks = (await sleeper.draftPicks(league.draft_id)).data; } catch { note = "Couldn't load this season's draft from Sleeper, so every player is treated as undrafted until it loads."; }
  } else note = "No draft found for this season on Sleeper.";
  const rows = ctx.myRosterId !== null ? keeperPlan(ctx, ctx.myRosterId, picks, rules, rounds) : [];
  return { rules, rounds, sleeperMax, rows, note };
}
