import { sleeper } from "../sleeper/client";
import { keeperPlan, type KeeperRules } from "../engine/keepers";
import type { DraftPick, League } from "../sleeper/types";
import type { AppSettings } from "../settings";
import type { LeagueContext } from "./league";
import { keeperRulesFor } from "./keeperRules";

/**
 * Keeper plan for a league: rules (saved → Sleeper → defaults), this season's draft board from Sleeper
 * (round, pick, who drafted him, whether he was a keeper), the draft's size, and how many seasons in a row
 * each player has been kept (walking back through previous seasons' drafts).
 */
export async function loadKeeperPlan(settings: AppSettings, league: League, ctx: LeagueContext) {
  const sleeperMax = Number((league.settings as Record<string, unknown>).max_keepers) || 0;
  const rules: KeeperRules = keeperRulesFor(settings, league);
  let rounds = league.settings.draft_rounds || 15;
  let teams = ctx.teamsCount;
  let draftType: string | null = null;
  let picks: DraftPick[] = [];
  let note: string | null = null;
  try {
    const drafts = (await sleeper.drafts(league.league_id)).data;
    const d = drafts.find((x) => x.draft_id === league.draft_id) ?? drafts[0];
    if (d) {
      const st = (d.settings ?? {}) as Record<string, unknown>;
      rounds = Number(st.rounds) || rounds;
      teams = Number(st.teams) || teams;
      draftType = d.type ?? null;
      picks = (await sleeper.draftPicks(d.draft_id)).data;
    } else note = "No draft found for this season on Sleeper.";
  } catch {
    note = "Couldn't load this season's draft from Sleeper, so every player is treated as undrafted until it loads.";
  }
  // Seasons in a row kept: this season's draft, then previous seasons' drafts while he keeps showing up as a keeper.
  const yearsKept = new Map<string, number>();
  for (const p of picks) if (p.is_keeper) yearsKept.set(p.player_id, 1);
  let prev = league.previous_league_id ?? null;
  let alive = new Set(yearsKept.keys());
  for (let i = 0; i < 4 && prev && alive.size; i++) {
    try {
      const pl = await sleeper.league(prev);
      const ds = (await sleeper.drafts(prev)).data;
      const keptThen = new Set<string>();
      for (const d of ds) for (const p of (await sleeper.draftPicks(d.draft_id)).data) if (p.is_keeper) keptThen.add(p.player_id);
      alive = new Set([...alive].filter((id) => keptThen.has(id)));
      for (const id of alive) yearsKept.set(id, (yearsKept.get(id) ?? 0) + 1);
      prev = pl.data.previous_league_id ?? null;
    } catch { break; }
  }
  const teamName = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)?.name ?? `Team ${rid}`;
  const rows = ctx.myRosterId !== null ? keeperPlan(ctx, ctx.myRosterId, picks, rules, rounds, { yearsKept, teams, teamName }) : [];
  return { rules, rounds, teams, draftType, sleeperMax, rows, note };
}
