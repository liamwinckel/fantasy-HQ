import type { KeeperRules } from "../engine/keepers";
import type { League } from "../sleeper/types";
import type { AppSettings } from "../settings";

/** Keeper rules for a league: saved settings → Sleeper's max_keepers → defaults. */
export function keeperRulesFor(settings: AppSettings, league: League): KeeperRules {
  const rounds = league.settings.draft_rounds || 15;
  const saved = settings.keeperRules[league.league_id] ?? {};
  const sleeperMax = Number((league.settings as Record<string, unknown>).max_keepers) || 0;
  return {
    maxKeepers: saved.maxKeepers ?? (sleeperMax || 2),
    modifier: saved.modifier ?? "+1",
    undraftedRound: saved.undraftedRound ?? rounds,
    direction: saved.direction ?? "earlier",
    overrides: saved.overrides ?? {},
  };
}
