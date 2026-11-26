/**
 * League history: every season of a Sleeper league (following previous_league_id), its trades, waiver claims (with
 * losing bids), drafts and weekly scores. Everything here is computed from Sleeper's free API: no paid data.
 *
 *   Trade grades     starter points each side has gained from the trade since it happened, plus (dynasty) what the
 *                    assets are worth today. Picks already used count as the player they became.
 *   Managers         trades, pickups, FAAB spent and how each manager bids.
 *   FAAB market      the league's own winning bids as a share of the budget, how much the winner beat the runner-up by.
 *   Draft grades     hindsight: each pick against where that player actually finished among everyone drafted.
 */
import { sleeper } from "../sleeper/client";
import { loadNames } from "../news";
import type { BracketGame, Draft, DraftPick, League, Matchup, Player, Roster, SleeperUser, Transaction } from "../sleeper/types";
import type { LeagueContext } from "./league";
import { scoreSleeperStats } from "../engine/scoring";
import { valuesHistory } from "../nflverse";

export interface SeasonHist {
  leagueId: string;
  season: string;
  league: League;
  users: SleeperUser[];
  rosters: Roster[];
  tx: Transaction[];
  current: boolean;
}
export interface History {
  seasons: SeasonHist[]; // newest first
  owners: Map<string, { name: string; avatar: string | null }>; // owner_id → latest display
  players: Record<string, Player>;
  /** Names of players no longer in Sleeper's slim player list (retired / released), for old trades and bids. */
  names?: Record<string, string>;
}

const MAX_SEASONS = 5;

/** Owner of a roster in a given season (managers are tracked by Sleeper user, so roster numbers can change). */
export const ownerOf = (s: SeasonHist, rid: number) => s.rosters.find((r) => r.roster_id === rid)?.owner_id ?? `r${rid}`;

export async function loadHistory(ctx: LeagueContext): Promise<History> {
  const seasons: SeasonHist[] = [];
  let league: League | null = ctx.league;
  for (let i = 0; i < MAX_SEASONS && league; i++) {
    const cur = i === 0;
    const id = league.league_id;
    const weeks = cur ? Math.min(ctx.currentWeek, 18) : 18;
    const [users, rosters, txw] = await Promise.all([
      cur ? Promise.resolve(null) : sleeper.users(id).then((r) => r.data).catch(() => [] as SleeperUser[]),
      cur ? Promise.resolve(null) : sleeper.rosters(id).then((r) => r.data).catch(() => [] as Roster[]),
      Promise.all(Array.from({ length: weeks + 1 }, (_, w) => w).map((w) =>
        (cur ? sleeper.transactions(id, w, ctx.currentWeek) : sleeper.pastTransactions(id, w)).then((r) => r.data).catch(() => [] as Transaction[]))),
    ]);
    seasons.push({
      leagueId: id, season: league.season, league, current: cur,
      users: users ?? [...ctx.teams].map((t) => ({ user_id: t.ownerId ?? "", display_name: t.manager, metadata: { team_name: t.name } }) as unknown as SleeperUser),
      rosters: rosters ?? ctx.teams.map((t) => ({ roster_id: t.rosterId, owner_id: t.ownerId, players: t.players, starters: [], reserve: t.reserve, taxi: t.taxi, settings: {} }) as unknown as Roster),
      tx: dedupe(txw.flat()),
    });
    const prev: string | null = league.previous_league_id ?? null;
    league = prev && prev !== "0" ? await sleeper.league(prev).then((r) => r.data).catch(() => null) : null;
  }
  const owners = new Map<string, { name: string; avatar: string | null }>();
  for (const s of [...seasons].reverse()) for (const u of s.users) {
    const tn = (u as unknown as { metadata?: { team_name?: string } }).metadata?.team_name;
    owners.set(u.user_id, { name: tn || u.display_name || "Manager", avatar: u.avatar ?? null });
  }
  for (const t of ctx.teams) if (t.ownerId) owners.set(t.ownerId, { name: t.name, avatar: t.avatar });
  const [players, names] = await Promise.all([
    sleeper.players().then((r) => r.data as Record<string, Player>).catch(() => ({} as Record<string, Player>)),
    loadNames().then((r) => r.data).catch(() => ({} as Record<string, string>)),
  ]);
  return { seasons, owners, players, names };
}
const dedupe = (t: Transaction[]) => [...new Map(t.map((x) => [x.transaction_id, x])).values()];

export const playerName = (h: History, ctx: LeagueContext, pid: string) =>
  ctx.players.get(pid)?.name ?? ctx.txNames[pid] ?? h.players[pid]?.full_name ?? h.names?.[pid] ?? (/^[A-Z]{2,3}$/.test(pid) ? `${pid} defense` : `Player ${pid}`);
export const playerPos = (h: History, ctx: LeagueContext, pid: string) => ctx.players.get(pid)?.pos ?? h.players[pid]?.position ?? (/^[A-Z]{2,3}$/.test(pid) ? "DEF" : "?");

// =====================================================================================================
// FAAB
// =====================================================================================================
export interface Bid { season: string; week: number; pid: string; owner: string; bid: number; pct: number; won: boolean; bidders: number; runnerUp: number | null }
export interface FaabMarket {
  budget: number;
  bids: Bid[]; // every bid (winning and losing) as a share of that season's budget
  wins: Bid[];
  /** Winning bid percentiles (share of budget), from the league's own history. */
  q: (p: number) => number;
  contestedMedian: number | null; // median winning bid when 2+ managers bid
  overbidMedian: number | null; // median amount the winner beat the runner-up by (share of budget)
  seasons: number;
  fromLeague: boolean; // false when the league has too little history and defaults fill in
}
export const isFaab = (l: League) => Number((l.settings as Record<string, unknown>).waiver_type) === 2 && Number((l.settings as Record<string, unknown>).waiver_budget) > 0;
export const budgetOf = (l: League) => Number((l.settings as Record<string, unknown>).waiver_budget) || 100;

/** Generic winning-bid shares, used to fill in until a league has enough of its own history. */
const DEFAULT_Q: [number, number][] = [[0.1, 0], [0.25, 0.01], [0.5, 0.03], [0.75, 0.08], [0.9, 0.16], [0.97, 0.3], [1, 0.5]];
const interp = (pts: [number, number][], p: number) => {
  if (p <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (p <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (p - x0)) / (x1 - x0 || 1); }
  return pts.at(-1)![1];
};
const median = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function faabMarket(h: History): FaabMarket {
  const bids: Bid[] = [];
  for (const s of h.seasons) {
    if (!isFaab(s.league)) continue;
    const B = budgetOf(s.league);
    const claims = s.tx.filter((t) => t.type === "waiver" && (t.status === "complete" || t.status === "failed"));
    const byPlayerWeek = new Map<string, Transaction[]>();
    for (const t of claims) for (const pid of Object.keys(t.adds)) { const k = `${t.leg}:${pid}`; (byPlayerWeek.get(k) ?? byPlayerWeek.set(k, []).get(k)!).push(t); }
    for (const [k, list] of byPlayerWeek) {
      const pid = k.split(":")[1];
      const amounts = list.map((t) => ({ t, bid: Number((t.settings as Record<string, unknown> | null)?.waiver_bid ?? 0) })).sort((a, b) => b.bid - a.bid);
      amounts.forEach((a) => {
        const won = a.t.status === "complete";
        const others = amounts.filter((x) => x !== a).map((x) => x.bid);
        bids.push({ season: s.season, week: a.t.leg ?? 0, pid, owner: ownerOf(s, a.t.roster_ids[0]), bid: a.bid, pct: a.bid / B, won, bidders: amounts.length, runnerUp: won && others.length ? Math.max(...others) / B : null });
      });
    }
  }
  const wins = bids.filter((b) => b.won);
  const enough = wins.length >= 12;
  const own = wins.map((b) => b.pct).sort((a, b) => a - b);
  const ownQ = (p: number) => own[Math.min(own.length - 1, Math.max(0, Math.round(p * (own.length - 1))))];
  // Blend the league's own curve with the generic one, trusting the league more as its history grows.
  const w = Math.min(1, own.length / 40);
  const q = (p: number) => (own.length ? w * ownQ(p) + (1 - w) * interp(DEFAULT_Q, p) : interp(DEFAULT_Q, p));
  const contested = wins.filter((b) => b.bidders >= 2);
  return {
    budget: budgetOf(h.seasons[0].league), bids, wins, q,
    contestedMedian: median(contested.map((b) => b.pct)), overbidMedian: median(contested.filter((b) => b.runnerUp !== null).map((b) => b.pct - b.runnerUp!)),
    seasons: new Set(wins.map((b) => b.season)).size, fromLeague: enough,
  };
}

export interface FaabSuggestion { bid: number; low: number; high: number; tier: "Must-add" | "Strong add" | "Solid add" | "Speculative" | "Depth"; why: string[]; trendRank: number | null }
/**
 * Bid for one free agent. Demand comes from Sleeper's trending adds (how many managers everywhere are grabbing him) and
 * how much he helps you (his rank among your best adds). The price comes from your league's own winning bids, pushed up
 * late in the season (unspent FAAB is worth nothing) and capped by what you have left.
 */
export function suggestBid(opts: { market: FaabMarket; myLeft: number; rivalsLeft: number[]; fitRank: number; trendRank: number | null; weeksLeft: number; seasonWeeks: number; minBid: number; pos?: string; gainShare?: number }): FaabSuggestion {
  const { market: m, fitRank, trendRank } = opts;
  const hot = trendRank !== null && trendRank <= 10;
  // Where this player sits in the league's price curve (0–1): how much he helps you, plus how hot he is everywhere.
  const fit = opts.gainShare !== undefined ? 0.25 + 0.55 * Math.max(0, Math.min(1, opts.gainShare)) : Math.max(0.15, 0.8 - 0.06 * (fitRank - 1));
  const demand = trendRank !== null ? 0.18 * Math.max(0, 1 - (trendRank - 1) / 30) : 0;
  let pTier = Math.min(0.97, fit + demand);
  if (opts.pos === "K" || opts.pos === "DEF") pTier = Math.min(pTier, 0.3); // leagues rarely pay up for kickers or defenses
  const tier: FaabSuggestion["tier"] = pTier >= 0.88 ? "Must-add" : pTier >= 0.74 ? "Strong add" : pTier >= 0.55 ? "Solid add" : pTier >= 0.35 ? "Speculative" : "Depth";
  // Late season: money left is worth less, so bid a little more of it.
  const late = 1 + 0.6 * Math.max(0, 1 - opts.weeksLeft / Math.max(1, opts.seasonWeeks));
  const toDollars = (pct: number) => Math.round(pct * m.budget * late);
  const cap = (v: number) => Math.max(opts.minBid, Math.min(opts.myLeft, v));
  const bid = cap(toDollars(m.q(pTier)));
  const low = cap(toDollars(m.q(Math.max(0.05, pTier - 0.15)))), high = cap(toDollars(m.q(Math.min(0.99, pTier + 0.06))));
  const why: string[] = [];
  if (trendRank !== null) why.push(`#${trendRank} most-added on Sleeper right now`);
  why.push(fitRank === 1 ? "Your best add" : `Your #${fitRank} add`);
  why.push(m.fromLeague ? `Your league pays ${Math.round(m.q(pTier) * 100)}% of budget for this tier` : "Little league history yet: typical FAAB prices fill in");
  const richest = Math.max(0, ...opts.rivalsLeft);
  if (hot && richest > bid) why.push(`A rival has $${richest} left`);
  if (opts.pos === "K" || opts.pos === "DEF") why.push("Kickers and defenses rarely draw big bids");
  if (late > 1.15) why.push("Late season: unspent FAAB is worth nothing");
  return { bid, low: Math.min(low, bid), high: Math.max(high, bid), tier, why, trendRank };
}

// =====================================================================================================
// Trades
// =====================================================================================================
export interface TradeAsset { id: string; name: string; pos: string; pts: number; value: number; then: number; note?: string }
export interface TradeSide {
  owner: string; rosterId: number; got: TradeAsset[];
  /** Hindsight: starter points the acquired assets produced for this manager, and what they are worth now (or fetched when moved on). */
  pts: number; value: number; grade: string; share: number;
  /** At the time: what the assets were worth the day of the trade. */
  then: number; atGrade: string | null; atShare: number | null;
  /** Seasons this manager won the title with help from what they got. */
  titles: string[];
}
export interface TradeGrade { id: string; season: string; week: number; at: number; sides: TradeSide[]; verdict: string; basis: string; atBasis: string | null; story: string | null }

/** Champion (Sleeper user) of a finished season, from the winners bracket. */
async function championOf(s: SeasonHist): Promise<string | null> {
  const b = await sleeper.winnersBracket(s.leagueId).then((r) => r.data).catch(() => [] as BracketGame[]);
  const final = b.find((g) => g.p === 1) ?? [...b].sort((a, c) => c.r - a.r || a.m - c.m)[0];
  return final?.w ? ownerOf(s, final.w) : null;
}

/** Call after loadDrafts, so picks that have been used are valued as the player they became. */
export async function tradeGrades(h: History, ctx: LeagueContext): Promise<TradeGrade[]> {
  const dyn = ctx.valuationMode === "dynasty";
  const keeper = ctx.format === "keeper";
  const multi = dyn || keeper; // judged across seasons
  const out: TradeGrade[] = [];
  const hist = await valuesHistory().then((r) => r.data).catch(() => null);
  const vh = hist ? (ctx.superflex ? hist.v2 : hist.v1) : null, ph = hist ? (ctx.superflex ? hist.p2 : hist.p1) : null;
  const monthIdx = (ms: number) => {
    if (!hist || !ms) return -1;
    const m = new Date(ms).toISOString().slice(0, 7);
    let i = hist.months.findIndex((x) => x > m);
    i = i < 0 ? hist.months.length - 1 : i - 1;
    return Math.max(0, i);
  };
  const marketAt = (pid: string, i: number) => (vh && i >= 0 ? vh[pid]?.[i] ?? 0 : 0);
  const pickAt = (season: string, round: number, i: number) => {
    if (!ph || i < 0) return 0;
    const row = ph[`${season} ${round}`];
    if (row?.[i]) return row[i];
    // Far-future picks are listed as next year's: use the latest year that has this round.
    const keys = Object.keys(ph).filter((k) => k.endsWith(` ${round}`) && ph[k][i] > 0).sort();
    return keys.length ? ph[keys[keys.length - 1]][i] : 0;
  };
  // Today's values in this league's scoring, on the same scale as the market history (so "now" and "then" compare).
  const nowIdx = hist ? hist.months.length - 1 : -1;
  const topNow = vh ? Math.max(1, ...Object.values(vh).map((r) => r[nowIdx] ?? 0)) : 100;
  const ctxTop = Math.max(1e-9, ...[...ctx.values.values()].map((v) => (dyn ? v.dynasty : v.redraft)));
  const valueNow = (pid: string) => ((dyn ? ctx.values.get(pid)?.dynasty : ctx.values.get(pid)?.redraft) ?? 0) * (topNow / ctxTop);

  // Weekly lineups per season (cached), champions, and who owns which roster each season.
  const weeksCache = new Map<string, Promise<Matchup[][]>>();
  const weeksOf = (s: SeasonHist) => {
    if (!weeksCache.has(s.leagueId)) weeksCache.set(s.leagueId, s.current ? Promise.resolve(ctx.matchupsByWeek)
      : Promise.all(Array.from({ length: 18 }, (_, i) => sleeper.pastMatchups(s.leagueId, i + 1).then((r) => r.data).catch(() => [] as Matchup[]))));
    return weeksCache.get(s.leagueId)!;
  };
  const champs = new Map<string, string | null>();
  await Promise.all(h.seasons.filter((s) => !s.current || ctx.seasonOver).map(async (s) => champs.set(s.season, await championOf(s))));
  const rosterOf = (s: SeasonHist, owner: string) => s.rosters.find((r) => r.owner_id === owner)?.roster_id ?? null;
  const allTrades = h.seasons.flatMap((s) => s.tx.filter((t) => t.type === "trade" && t.status === "complete").map((t) => ({ s, t })));
  const curOwnerHas = (owner: string, pid: string) => !!h.seasons[0]?.rosters.find((r) => r.owner_id === owner)?.players?.includes(pid);

  // Starter points a player scored for one manager from (season, week) on — one season for redraft, every later one otherwise.
  const startedFor = async (si: number, owner: string, pid: string, fromWeek: number, until?: { si: number; week: number }) => {
    let pts = 0;
    const per: Record<string, number> = {};
    for (let k = si; k >= (multi ? 0 : si); k--) {
      const s = h.seasons[k];
      const rid = rosterOf(s, owner);
      if (rid == null) continue;
      const weeks = await weeksOf(s);
      weeks.forEach((ms, i) => {
        const w = i + 1;
        if (k === si && w < fromWeek) return;
        if (until && (k < until.si || (k === until.si && w >= until.week))) return;
        const m = ms.find((x) => x.roster_id === rid);
        if (m?.starters?.includes(pid)) { const p = m.players_points?.[pid] ?? 0; pts += p; per[s.season] = (per[s.season] ?? 0) + p; }
      });
    }
    return { pts, per };
  };
  // When (if ever) a manager traded the player on, and what he was worth then.
  const movedOn = (owner: string, pid: string, after: number) => {
    const later = allTrades.filter(({ s, t }) => (t.created ?? 0) > after && t.drops?.[pid] != null && ownerOf(s, t.drops[pid]) === owner)
      .sort((a, b) => (a.t.created ?? 0) - (b.t.created ?? 0))[0];
    if (!later) return null;
    return { si: h.seasons.indexOf(later.s), week: later.t.leg ?? 0, value: marketAt(pid, monthIdx(later.t.created ?? 0)), season: later.s.season };
  };

  // Redraft/keeper "at the time": recent points per game × games left. Picks = a player taken at that spot last season.
  const seasonTotals = new Map<string, number[]>();
  const totalsFor = async (s: SeasonHist) => {
    if (!seasonTotals.has(s.leagueId)) {
      const tot = new Map<string, number>();
      for (const ms of await weeksOf(s)) for (const m of ms) for (const [pid, p] of Object.entries(m.players_points ?? {})) tot.set(pid, (tot.get(pid) ?? 0) + p);
      seasonTotals.set(s.leagueId, [...tot.values()].sort((a, b) => b - a));
    }
    return seasonTotals.get(s.leagueId)!;
  };
  const ppgBefore = async (si: number, pid: string, week: number) => {
    const s = h.seasons[si];
    const weeks = await weeksOf(s);
    const pts: number[] = [];
    for (let w = week - 1; w >= 1 && pts.length < 4; w--) for (const m of weeks[w - 1] ?? []) if (m.players_points?.[pid] != null && m.players?.includes(pid)) { pts.push(m.players_points[pid]); break; }
    if (pts.length >= 2) return pts.reduce((a, b) => a + b, 0) / pts.length;
    // Early-season or offseason trade: last season's average.
    const prev = h.seasons[si + 1];
    if (!prev) return pts.length ? pts[0] : 0;
    const pw = await weeksOf(prev);
    let tot = 0, n = 0;
    for (const ms of pw) for (const m of ms) if (m.players?.includes(pid) && m.players_points?.[pid] != null) { tot += m.players_points[pid]; n++; break; }
    return n ? tot / n : 0;
  };

  for (let si = 0; si < h.seasons.length; si++) {
    const s = h.seasons[si];
    const trades = s.tx.filter((t) => t.type === "trade" && t.status === "complete");
    if (!trades.length) continue;
    const byValue = [...ctx.values.values()].map((v) => v.redraft).sort((a, b) => b - a);
    const slotValue = (round: number, slot: number | null) => byValue[Math.min(byValue.length - 1, Math.max(0, (round - 1) * ctx.teamsCount + (slot ?? Math.ceil(ctx.teamsCount / 2)) - 1))] ?? 0;
    const lastWeek = Number((s.league.settings as Record<string, unknown>).last_scored_leg) || ctx.lastWeek || 17;
    const refTotals = await totalsFor(h.seasons[si + 1] ?? s);
    const pickPts = (round: number) => (refTotals[Math.min(refTotals.length - 1, (round - 1) * ctx.teamsCount + Math.ceil(ctx.teamsCount / 2) - 1)] ?? 0) * 0.85;

    for (const t of trades) {
      const week = t.leg ?? 0;
      const created = t.created ?? 0;
      const mi = monthIdx(created);
      const gamesLeft = Math.max(1, lastWeek - Math.max(1, week) + 1);
      const sides: TradeSide[] = await Promise.all(t.roster_ids.map(async (rid) => {
        const owner = ownerOf(s, rid);
        const got: TradeAsset[] = [];
        const per: Record<string, number> = {};
        const addPlayer = async (pid: string, name: string, pos: string, fromSi: number, fromWeek: number, then: number, note?: string) => {
          const moved = movedOn(owner, pid, created); // redraft too: points stop if he's flipped later that season
          const r = await startedFor(fromSi, owner, pid, fromWeek, moved ?? undefined);
          for (const [k, v] of Object.entries(r.per)) per[k] = (per[k] ?? 0) + v;
          const value = dyn ? (moved ? moved.value : curOwnerHas(owner, pid) ? valueNow(pid) : 0)
            : keeper ? (curOwnerHas(owner, pid) ? valueNow(pid) : 0)
            : 0; // redraft: judged on production only, never on today's projections
          got.push({ id: pid, name, pos, pts: r.pts, value, then, note: note ?? (moved ? `traded on in ${moved.season}` : undefined) });
        };
        for (const [pid] of Object.entries(t.adds ?? {}).filter(([, r]) => r === rid)) {
          const then = dyn ? marketAt(pid, mi) : (await ppgBefore(si, pid, Math.max(1, week))) * gamesLeft;
          await addPlayer(pid, playerName(h, ctx, pid), playerPos(h, ctx, pid), si, week, then);
        }
        for (const pk of (t.draft_picks ?? []).filter((p) => p.owner_id === rid)) {
          const became = draftedFrom(pk.season, pk.round, pk.roster_id ?? 0);
          const future = ctx.picks.find((p) => p.season === pk.season && p.round === pk.round && p.originalRosterId === pk.roster_id);
          const then = dyn ? pickAt(pk.season, pk.round, mi) : pickPts(pk.round);
          const label = `${pk.season} R${pk.round}`;
          if (became) {
            const dsi = h.seasons.findIndex((x) => x.season === pk.season);
            if (multi && dsi >= 0) await addPlayer(became, `${label} → ${playerName(h, ctx, became)}`, "PICK", dsi, 1, then, "pick used");
            else got.push({ id: became, name: `${label} → ${playerName(h, ctx, became)}`, pos: "PICK", pts: 0, value: valueNow(became), then, note: "pick used" });
          } else {
            const value = dyn ? (future?.value ?? 0) * (topNow / ctxTop) : s.current || Number(pk.season) > Number(s.season) ? slotValue(pk.round, future?.estimatedSlot ?? null) : 0;
            got.push({ id: `${pk.season}-${pk.round}-${pk.roster_id}`, name: future?.label ?? `${pk.season} round ${pk.round}`, pos: "PICK", pts: 0, value, then, note: dyn ? undefined : "valued as a player taken at that pick" });
          }
        }
        const titles = Object.keys(per).filter((season) => per[season] > 0 && champs.get(season) === owner);
        return { owner, rosterId: rid, got, pts: got.reduce((a, g) => a + g.pts, 0), value: got.reduce((a, g) => a + g.value, 0), then: got.reduce((a, g) => a + g.then, 0), grade: "C", share: 0.5, atGrade: null, atShare: null, titles };
      }));

      const n = sides.length;
      const P = sides.reduce((a, x) => a + x.pts, 0), V = sides.reduce((a, x) => a + x.value, 0), T = sides.reduce((a, x) => a + x.then, 0);
      const years = Math.max(0, (Date.now() - created) / (365 * 86_400_000));
      // Points matter more the longer ago the trade was; value today matters more for recent ones.
      const wP = dyn ? Math.min(0.7, 0.2 + 0.2 * years) : keeper ? 0.75 : 1;
      // Redraft, this season: graded on what the trade has produced so far; too early until there's a game or two of it.
      const tooEarly = !multi && s.current && P < 15;
      for (const x of sides) {
        const pShare = P > 0 ? x.pts / P : 1 / n, vShare = V > 0 ? x.value / V : 1 / n;
        let share = P > 0 ? wP * pShare + (1 - wP) * vShare : vShare;
        if (!multi) share = pShare;
        if (tooEarly) share = 0.5;
        // A trade that helped win the title was worth it, whatever it cost.
        if (x.titles.length) share = Math.max(share + 0.1, 0.55);
        x.share = share;
        x.grade = tooEarly ? "—" : gradeOf(share * n / 2);
        if (T > 0) { x.atShare = x.then / T; x.atGrade = gradeOf(x.atShare * n / 2); }
      }
      const best = [...sides].sort((a, b) => b.share - a.share);
      const margin = best[0].share - (best[1]?.share ?? 0);
      const nm = (o: string) => h.owners.get(o)?.name ?? "Team";
      const champ = sides.find((x) => x.titles.length);
      const atBest = T > 0 ? [...sides].sort((a, b) => (b.atShare ?? 0) - (a.atShare ?? 0)) : null;
      const atMargin = atBest ? (atBest[0].atShare ?? 0) - (atBest[1]?.atShare ?? 0) : 0;
      let story: string | null = null;
      if (champ) story = `${nm(champ.owner)} won the ${champ.titles.join(" & ")} title with it — worth it.`;
      else if (atBest && atMargin >= 0.1 && margin >= 0.08 && atBest[0].owner !== best[0].owner) story = `Looked like a win for ${nm(atBest[0].owner)}, but ${nm(best[0].owner)} came out ahead.`;
      else if (atBest && atMargin < 0.08 && margin >= 0.15) story = `Looked even at the time; ${nm(best[0].owner)} got the better of it.`;
      out.push({
        id: t.transaction_id, season: s.season, week, at: created, sides, story,
        verdict: champ ? `Worth it for ${nm(champ.owner)}` : tooEarly ? "Too early to tell" : margin < 0.08 ? (s.current ? "Even so far" : "Even") : `${nm(best[0].owner)} ${margin > 0.3 ? "won big" : s.current && !multi ? "is winning" : "won"}`,
        basis: dyn ? "Starter points the assets scored for each team (every season since), plus what they're worth now in your scoring — or what they were worth when traded on. Titles count."
          : keeper ? "Starter points for each team across every season since, plus keeper value now in your scoring. Titles count."
          : s.current ? "Starter points each side has got from the trade so far this season (only while on that roster)" : "Starter points each side got over the rest of that season, while the players were on their roster. A title counts.",
        atBasis: T > 0 ? (dyn ? "Dynasty market value the month of the trade (DynastyProcess)" : "Each player's recent points per game in your scoring × games left; picks as a player taken there") : null,
      });
    }
  }
  return out.sort((a, b) => Number(b.season) - Number(a.season) || b.week - a.week || b.at - a.at);
}
/** share (0.5 = even) → letter. */
export function gradeOf(share: number) {
  const g: [number, string][] = [[0.68, "A+"], [0.62, "A"], [0.58, "A-"], [0.55, "B+"], [0.52, "B"], [0.48, "C"], [0.45, "C-"], [0.42, "D+"], [0.38, "D"], [0.32, "D-"]];
  for (const [t, l] of g) if (share >= t) return l;
  return "F";
}

/** Which player a traded pick turned into, once that season's draft has happened (filled in by loadDrafts). */
const pickMap = new Map<string, Map<string, string>>();
const draftedFrom = (season: string, round: number, origRoster: number) => pickMap.get(season)?.get(`${round}:${origRoster}`) ?? null;

// =====================================================================================================
// Drafts
// =====================================================================================================
export interface DraftPickGrade { pickNo: number; round: number; id: string; name: string; pos: string; outcome: number; hindsight: number; surplus: number; keeper: boolean }
export interface DraftTeamGrade { owner: string; rosterId: number; grade: string; surplus: number; picks: DraftPickGrade[]; best: DraftPickGrade | null; worst: DraftPickGrade | null }
export interface DraftGrades { season: string; draftId: string; kind: "season" | "dynasty"; basis: string; teams: DraftTeamGrade[]; rounds: number }

export async function loadDrafts(h: History): Promise<{ season: SeasonHist; draft: Draft; picks: DraftPick[] }[]> {
  const out: { season: SeasonHist; draft: Draft; picks: DraftPick[] }[] = [];
  for (const s of h.seasons) {
    const ds = await sleeper.drafts(s.leagueId).then((r) => r.data).catch(() => [] as Draft[]);
    for (const d of ds.filter((x) => x.status === "complete")) {
      const picks = await sleeper.draftPicks(d.draft_id).then((r) => r.data).catch(() => [] as DraftPick[]);
      if (!picks.length) continue;
      out.push({ season: s, draft: d, picks });
      // Remember which player each slot's pick became, so traded picks can be valued as the player they turned into.
      const slotRoster = new Map<number, number>();
      for (const [slot, rid] of Object.entries(d.slot_to_roster_id ?? {})) slotRoster.set(Number(slot), rid);
      if (!slotRoster.size && d.draft_order) for (const [uid, slot] of Object.entries(d.draft_order)) { const r = s.rosters.find((x) => x.owner_id === uid); if (r) slotRoster.set(slot, r.roster_id); }
      const m = pickMap.get(d.season) ?? new Map<string, string>();
      for (const p of picks) { const orig = p.draft_slot ? slotRoster.get(p.draft_slot) : null; if (orig) m.set(`${p.round}:${orig}`, p.player_id); }
      pickMap.set(d.season, m);
    }
  }
  return out;
}

/**
 * Hindsight grade for one draft. Every drafted player is scored by what he became (season points for a finished
 * season, points so far + projected rest for the current one, dynasty value for dynasty drafts), re-ranked, and each
 * pick is compared with the player at the same spot in that hindsight order. Keepers are left out.
 */
export async function gradeDraft(x: { season: SeasonHist; draft: Draft; picks: DraftPick[] }, h: History, ctx: LeagueContext): Promise<DraftGrades> {
  const { season: s, draft, picks: all } = x;
  const dyn = ctx.valuationMode === "dynasty";
  const picks = all.filter((p) => !p.is_keeper);
  let outcome: (pid: string) => number;
  let basis: string;
  if (dyn) {
    outcome = (pid) => ctx.values.get(pid)?.dynasty ?? 0;
    basis = "Dynasty value today of each player drafted";
  } else if (s.current) {
    outcome = (pid) => {
      const so = (ctx.logs.get(pid) ?? []).reduce((a, g) => a + g.pts, 0);
      const pr = ctx.projections.get(pid);
      const rest = pr ? Object.entries(pr.byWeek ?? {}).filter(([w]) => Number(w) >= ctx.currentWeek && Number(w) <= ctx.lastWeek).reduce((a, [, v]) => a + (v as number), 0) : 0;
      return so + rest;
    };
    basis = "Points so far + projected rest of season, in your scoring";
  } else {
    const st = await sleeper.seasonStats(s.season).then((r) => r.data).catch(() => ({} as Record<string, Record<string, number>>));
    const sc = s.league.scoring_settings;
    outcome = (pid) => { const v = st[pid]; return v ? scoreSleeperStats(v, sc, playerPos(h, ctx, pid)) : 0; };
    basis = `${s.season} season points in your league's scoring`;
  }
  const scored = picks.map((p) => ({ p, v: outcome(p.player_id) }));
  const curve = scored.map((x) => x.v).sort((a, b) => b - a);
  const hindRank = new Map([...scored].sort((a, b) => b.v - a.v).map((x, i) => [x.p.player_id, i + 1]));
  const ownerByRoster = (rid: number | null | undefined, uid: string | null | undefined) => (uid ?? (rid ? ownerOf(s, rid) : "?"));
  const teams = new Map<string, DraftTeamGrade>();
  const allSorted = [...all].sort((a, b) => a.pick_no - b.pick_no);
  for (const p of allSorted) {
    const owner = ownerByRoster(p.roster_id, p.picked_by);
    const t = teams.get(owner) ?? { owner, rosterId: p.roster_id ?? 0, grade: "C", surplus: 0, picks: [], best: null, worst: null };
    const keeper = !!p.is_keeper;
    const v = outcome(p.player_id);
    const slot = picks.findIndex((q) => q === p) + 1; // position among non-keeper picks
    const g: DraftPickGrade = {
      pickNo: p.pick_no, round: p.round, id: p.player_id, name: playerName(h, ctx, p.player_id), pos: playerPos(h, ctx, p.player_id), outcome: Math.round(v * 10) / 10,
      hindsight: keeper ? 0 : hindRank.get(p.player_id) ?? picks.length, surplus: keeper || slot < 1 ? 0 : Math.round((v - (curve[slot - 1] ?? 0)) * 10) / 10, keeper,
    };
    t.picks.push(g);
    if (!keeper) t.surplus += g.surplus;
    teams.set(owner, t);
  }
  const list = [...teams.values()];
  const mean = list.reduce((a, t) => a + t.surplus, 0) / Math.max(1, list.length);
  const sd = Math.sqrt(list.reduce((a, t) => a + (t.surplus - mean) ** 2, 0) / Math.max(1, list.length)) || 1;
  for (const t of list) {
    const z = (t.surplus - mean) / sd;
    t.grade = z >= 1.5 ? "A+" : z >= 1 ? "A" : z >= 0.6 ? "A-" : z >= 0.3 ? "B+" : z >= 0.05 ? "B" : z >= -0.2 ? "B-" : z >= -0.5 ? "C+" : z >= -0.8 ? "C" : z >= -1.1 ? "C-" : z >= -1.5 ? "D" : "F";
    const real = t.picks.filter((p) => !p.keeper);
    t.best = real.reduce<DraftPickGrade | null>((a, p) => (!a || p.surplus > a.surplus ? p : a), null);
    t.worst = real.reduce<DraftPickGrade | null>((a, p) => (!a || p.surplus < a.surplus ? p : a), null);
  }
  list.sort((a, b) => b.surplus - a.surplus);
  return { season: s.season, draftId: draft.draft_id, kind: dyn ? "dynasty" : "season", basis, teams: list, rounds: Math.max(...all.map((p) => p.round)) };
}

// =====================================================================================================
// Managers
// =====================================================================================================
export interface ManagerHabits { owner: string; name: string; seasons: number; trades: number; partners: Map<string, number>; adds: number; claims: number; faabSpent: number; faabBids: number; avgWin: number | null; bigWins: number; label: string }

export function managerHabits(h: History, market: FaabMarket | null): ManagerHabits[] {
  const m = new Map<string, ManagerHabits>();
  const get = (o: string) => m.get(o) ?? m.set(o, { owner: o, name: h.owners.get(o)?.name ?? "Manager", seasons: 0, trades: 0, partners: new Map(), adds: 0, claims: 0, faabSpent: 0, faabBids: 0, avgWin: null, bigWins: 0, label: "" }).get(o)!;
  for (const s of h.seasons) {
    for (const r of s.rosters) if (r.owner_id) get(r.owner_id).seasons++;
    for (const t of s.tx) {
      if (t.status !== "complete") continue;
      if (t.type === "trade") {
        const os = t.roster_ids.map((rid) => ownerOf(s, rid));
        for (const o of os) { const x = get(o); x.trades++; for (const p of os) if (p !== o) x.partners.set(p, (x.partners.get(p) ?? 0) + 1); }
      } else if (t.type === "waiver" || t.type === "free_agent") {
        const x = get(ownerOf(s, t.roster_ids[0]));
        x.adds += Object.keys(t.adds).length;
        if (t.type === "waiver") x.claims++;
      }
    }
  }
  if (market) {
    for (const b of market.bids) { const x = get(b.owner); x.faabBids++; if (b.won) x.faabSpent += b.bid; }
    for (const x of m.values()) {
      const w = market.wins.filter((b) => b.owner === x.owner);
      x.avgWin = w.length ? w.reduce((a, b) => a + b.pct, 0) / w.length : null;
      x.bigWins = w.filter((b) => b.pct >= 0.15).length;
    }
  }
  const all = [...m.values()].filter((x) => h.owners.has(x.owner) || x.seasons);
  const avgTrades = all.reduce((a, x) => a + x.trades / Math.max(1, x.seasons), 0) / Math.max(1, all.length);
  const avgAdds = all.reduce((a, x) => a + x.adds / Math.max(1, x.seasons), 0) / Math.max(1, all.length);
  for (const x of all) {
    const tr = x.trades / Math.max(1, x.seasons), ad = x.adds / Math.max(1, x.seasons);
    const tags = [tr >= avgTrades * 1.5 && x.trades >= 2 ? "Trader" : tr === 0 ? "Never trades" : null, ad >= avgAdds * 1.4 ? "Waiver hawk" : ad <= avgAdds * 0.5 ? "Set and forget" : null, x.bigWins >= 2 ? "Big FAAB spender" : null].filter(Boolean);
    x.label = tags.join(" · ") || "Steady";
  }
  return all.sort((a, b) => b.trades - a.trades || b.adds - a.adds);
}
