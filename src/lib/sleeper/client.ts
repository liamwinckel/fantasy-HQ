import { z } from "zod";
import { cached, type CachedResult } from "../cache";
import { dataUrl, fetchText as netFetch } from "../net";
import {
  BracketGame, Draft, DraftPick, League, Matchup, NflState, Player, Roster, SleeperUser, TradedPick, Transaction,
} from "./types";

const BASE = "https://api.sleeper.app/v1";
const MIN = 60_000;
const HOUR = 60 * MIN;

// Sleeper asks clients to stay well under 1000 calls/minute. We cap concurrency and pace requests.
const MAX_CONCURRENT = 4;
let active = 0;
const queue: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

async function fetchText(pathname: string): Promise<string> {
  return limited(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const text = await netFetch(BASE + pathname, 20_000);
        if (text === "null" || text === "") throw new Error(`Sleeper returned nothing for ${pathname}`);
        return text;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr;
  });
}

function get<T>(pathname: string, schema: z.ZodType<T>, ttlMs: number, force = false): Promise<CachedResult<T>> {
  return cached(`sleeper:${pathname}`, "sleeper", ttlMs, () => fetchText(pathname), (b) => schema.parse(JSON.parse(b)), { force });
}

export const sleeper = {
  state: (force = false) => get("/state/nfl", NflState, 15 * MIN, force),
  user: (usernameOrId: string, force = false) => get(`/user/${encodeURIComponent(usernameOrId)}`, SleeperUser, 24 * HOUR, force),
  leagues: (userId: string, season: string, force = false) =>
    get(`/user/${userId}/leagues/nfl/${season}`, z.array(League), 6 * HOUR, force),
  league: (id: string, force = false) => get(`/league/${id}`, League, HOUR, force),
  users: (id: string, force = false) => get(`/league/${id}/users`, z.array(SleeperUser), 6 * HOUR, force),
  rosters: (id: string, force = false) => get(`/league/${id}/rosters`, z.array(Roster), 10 * MIN, force),
  /** Past weeks rarely change after Tuesday; the live week refreshes every few minutes. */
  matchups: (id: string, week: number, currentWeek: number, force = false) =>
    get(`/league/${id}/matchups/${week}`, z.array(Matchup), week < currentWeek - 1 ? 24 * HOUR : 5 * MIN, force),
  transactions: (id: string, week: number, currentWeek: number, force = false) =>
    get(`/league/${id}/transactions/${week}`, z.array(Transaction), week < currentWeek - 1 ? 24 * HOUR : 15 * MIN, force),
  /** A finished season never changes: cache its weeks for a month. */
  pastTransactions: (id: string, week: number) => get(`/league/${id}/transactions/${week}`, z.array(Transaction), 30 * 24 * HOUR),
  pastMatchups: (id: string, week: number) => get(`/league/${id}/matchups/${week}`, z.array(Matchup), 30 * 24 * HOUR),
  /** Most-added players across all of Sleeper (public, free): how in-demand a free agent is right now. */
  trending: (force = false) => get(`/players/nfl/trending/add?lookback_hours=48&limit=200`, z.array(z.object({ player_id: z.string(), count: z.number() })), 30 * MIN, force),
  /** Season stat totals for every player (Sleeper's public stats). Slimmed to raw stat lines before caching. */
  seasonStats: (season: string) =>
    cached(`sleeper:stats:${season}`, "sleeper", 7 * 24 * HOUR,
      async () => {
        const raw = JSON.parse(await fetchText(`/stats/nfl/regular/${season}`)) as Record<string, Record<string, unknown>>;
        const out: Record<string, Record<string, number>> = {};
        for (const [pid, st] of Object.entries(raw)) {
          if (!st || !/^\d+$/.test(pid)) continue;
          const o: Record<string, number> = {};
          for (const [k, v] of Object.entries(st)) if (typeof v === "number" && v !== 0 && !/^(rank_|pos_rank_|tm_|adp_)|_snp$/.test(k)) o[k] = v;
          if (Object.keys(o).length) out[pid] = o;
        }
        return JSON.stringify(out);
      },
      (b) => JSON.parse(b) as Record<string, Record<string, number>>),
  tradedPicks: (id: string, force = false) => get(`/league/${id}/traded_picks`, z.array(TradedPick), HOUR, force),
  winnersBracket: (id: string, force = false) => get(`/league/${id}/winners_bracket`, z.array(BracketGame), HOUR, force),
  drafts: (id: string, force = false) => get(`/league/${id}/drafts`, z.array(Draft), 6 * HOUR, force),
  draftPicks: (draftId: string, force = false) => get(`/draft/${draftId}/picks`, z.array(DraftPick), 24 * HOUR, force),
  /**
   * Sleeper's player list (~5 MB) is slimmed and refreshed every few hours by the site's data job,
   * so phones download a much smaller copy. Live injury news comes from the projections feed.
   */
  players: (force = false) =>
    cached("data:players", "sleeper", 6 * HOUR,
      // Fall back to Sleeper's full list (~5 MB) if the site's slim copy is missing.
      () => netFetch(dataUrl("sleeper-players.json"), 60_000).catch(() => fetchText("/players/nfl")),
      (b) => z.record(z.string(), Player).parse(JSON.parse(b)), { force }),
  /** Sleeper's own weekly projections (raw stat lines, scored per league). Slimmed before caching. */
  projections: (season: string, week: number, positions: string[], force = false) =>
    cached(
      `sleeper:proj:${season}:${week}:${positions.join(",")}`, "sleeper", 2 * HOUR,
      () => limited(async () => {
        // Retry: a missing week would otherwise skew rest-of-season totals.
        let err: unknown;
        for (let a = 0; a < 4; a++) {
          try {
            return slimProjections(await netFetch(`https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&${positions.map((p) => `position[]=${p}`).join("&")}`, 30_000));
          } catch (e) { err = e; await new Promise((r) => setTimeout(r, 600 * (a + 1))); }
        }
        throw err;
      }),
      (b) => JSON.parse(b) as SleeperProjection[],
      { force },
    ),
};

export const sleeperImages = {
  headshot: (playerId: string) => `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
  teamLogo: (team: string) => `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`,
  avatar: (avatar: string) => `https://sleepercdn.com/avatars/thumbs/${avatar}`,
};

export interface SleeperProjection {
  id: string;
  team: string | null;
  opp: string | null;
  injury: string | null;
  stats: Record<string, number>;
}

const SKIP = /^(adp_|pos_adp|pts_|rank_|gp$|gs$|cmp_pct)/;
/** Keep only what scoring needs: non-zero stat lines for players with a projection. */
export function slimProjections(body: string): string {
  const raw = JSON.parse(body) as { player_id: string; team?: string | null; opponent?: string | null; stats?: Record<string, number> | null; player?: { injury_status?: string | null } | null }[];
  const out: SleeperProjection[] = [];
  for (const r of raw) {
    if (!r.stats || !r.player_id) continue;
    const stats: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.stats)) if (typeof v === "number" && v !== 0 && !SKIP.test(k)) stats[k] = Math.round(v * 100) / 100;
    if (r.stats.pts_ppr !== undefined) stats._ppr = r.stats.pts_ppr;
    if (Object.keys(stats).length === 0) continue;
    out.push({ id: r.player_id, team: r.team ?? null, opp: r.opponent ?? null, injury: r.player?.injury_status ?? null, stats });
  }
  return JSON.stringify(out);
}
