import { z } from "zod";

// Lenient schemas: Sleeper adds/omits fields freely, so everything not essential is optional.
const num = z.number().nullish().transform((v) => v ?? 0);

export const NflState = z.object({
  week: z.number(),
  display_week: z.number().nullish(),
  season: z.string(),
  season_type: z.string(),
  leg: z.number().nullish(),
});
export type NflState = z.infer<typeof NflState>;

export const SleeperUser = z.object({
  user_id: z.string(),
  username: z.string().nullish(),
  display_name: z.string().nullish(),
  avatar: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});
export type SleeperUser = z.infer<typeof SleeperUser>;

export const League = z.object({
  league_id: z.string(),
  name: z.string(),
  season: z.string(),
  status: z.string(),
  total_rosters: z.number(),
  avatar: z.string().nullish(),
  previous_league_id: z.string().nullish(),
  draft_id: z.string().nullish(),
  roster_positions: z.array(z.string()),
  scoring_settings: z.record(z.string(), z.number().nullish()).transform((r) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) if (typeof v === "number") out[k] = v;
    return out;
  }),
  settings: z
    .object({
      type: num, // 0 redraft, 1 keeper, 2 dynasty
      playoff_week_start: num,
      playoff_teams: num,
      draft_rounds: num,
      num_teams: num,
      last_scored_leg: num,
      taxi_slots: num,
      reserve_slots: num,
      playoff_round_type: num,
    })
    .passthrough(),
});
export type League = z.infer<typeof League>;

export const Roster = z.object({
  roster_id: z.number(),
  owner_id: z.string().nullish(),
  co_owners: z.array(z.string()).nullish(),
  players: z.array(z.string()).nullish().transform((v) => v ?? []),
  starters: z.array(z.string()).nullish().transform((v) => v ?? []),
  reserve: z.array(z.string()).nullish().transform((v) => v ?? []),
  taxi: z.array(z.string()).nullish().transform((v) => v ?? []),
  settings: z
    .object({
      wins: num,
      losses: num,
      ties: num,
      fpts: num,
      fpts_decimal: num,
      fpts_against: num,
      fpts_against_decimal: num,
    })
    .passthrough(),
});
export type Roster = z.infer<typeof Roster>;

export const Matchup = z.object({
  roster_id: z.number(),
  matchup_id: z.number().nullish(),
  points: num,
  starters: z.array(z.string()).nullish().transform((v) => v ?? []),
  players: z.array(z.string()).nullish().transform((v) => v ?? []),
  players_points: z.record(z.string(), z.number()).nullish().transform((v) => v ?? {}),
});
export type Matchup = z.infer<typeof Matchup>;

export const TradedPick = z.object({
  season: z.string(),
  round: z.number(),
  roster_id: z.number(), // original owner
  previous_owner_id: z.number().nullish(),
  owner_id: z.number(), // current owner
});
export type TradedPick = z.infer<typeof TradedPick>;

export const Transaction = z.object({
  transaction_id: z.string(),
  type: z.string(), // trade | waiver | free_agent | commissioner
  status: z.string(),
  leg: z.number().nullish(),
  created: z.number().nullish(),
  roster_ids: z.array(z.number()).nullish().transform((v) => v ?? []),
  adds: z.record(z.string(), z.number()).nullish().transform((v) => v ?? {}),
  drops: z.record(z.string(), z.number()).nullish().transform((v) => v ?? {}),
  draft_picks: z.array(TradedPick.partial().extend({ season: z.string(), round: z.number() })).nullish().transform((v) => v ?? []),
  settings: z.record(z.string(), z.unknown()).nullish(),
});
export type Transaction = z.infer<typeof Transaction>;

export const BracketGame = z.object({
  r: z.number(),
  m: z.number(),
  t1: z.number().nullish(),
  t2: z.number().nullish(),
  w: z.number().nullish(),
  l: z.number().nullish(),
});
export type BracketGame = z.infer<typeof BracketGame>;

export const Draft = z.object({
  draft_id: z.string(),
  season: z.string(),
  status: z.string(),
  type: z.string().nullish(),
  draft_order: z.record(z.string(), z.number()).nullish(),
  settings: z.record(z.string(), z.unknown()).nullish(),
});
export type Draft = z.infer<typeof Draft>;

export const Player = z.object({
  player_id: z.string(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  full_name: z.string().nullish(),
  position: z.string().nullish(),
  fantasy_positions: z.array(z.string()).nullish(),
  team: z.string().nullish(),
  age: z.number().nullish(),
  birth_date: z.string().nullish(),
  years_exp: z.number().nullish(),
  injury_status: z.string().nullish(),
  injury_body_part: z.string().nullish(),
  status: z.string().nullish(),
  gsis_id: z.string().nullish(),
  search_rank: z.number().nullish(),
  depth_chart_order: z.number().nullish(),
  number: z.number().nullish(),
  height: z.union([z.string(), z.number()]).nullish(),
  weight: z.union([z.string(), z.number()]).nullish(),
  college: z.string().nullish(),
});
export type Player = z.infer<typeof Player>;

export const DraftPick = z.object({
  player_id: z.string(),
  round: z.number(),
  pick_no: z.number(),
  roster_id: z.number().nullish(),
  picked_by: z.string().nullish(),
  is_keeper: z.boolean().nullish(),
});
export type DraftPick = z.infer<typeof DraftPick>;
