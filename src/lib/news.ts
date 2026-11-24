/**
 * News feed: player news built every refresh from the Sleeper player database (injury designations, IR moves,
 * signings and releases, depth-chart starters, trending adds) plus this league's own moves (trades, waiver
 * claims, free-agent adds). Your players first, then players on teams in your league, then everyone else.
 */
import { cached } from "./cache";
import { dataUrl, fetchText } from "./net";
import type { LeagueContext } from "./services/league";

export interface NewsItem { at: string; id: string; kind: string; text: string; pos: string; team: string | null }
export interface FeedItem extends NewsItem { scope: "mine" | "league" | "nfl"; owner: string | null }

export const loadNews = (force = false) =>
  cached("news", "nflverse", 30 * 60_000, () => fetchText(dataUrl("news.json"), 30_000), (b) => (JSON.parse(b) as { builtAt: string; items: NewsItem[] }), { force });

/** Names of players no longer on an NFL team (for old transactions). */
export const loadNames = () =>
  cached("player-names", "nflverse", 24 * 3600_000, () => fetchText(dataUrl("player-names.json"), 30_000), (b) => JSON.parse(b) as Record<string, string>);

export const KIND_LABEL: Record<string, string> = {
  injury: "Injury", ir: "IR", return: "Returning", healthy: "Cleared", team: "Roster move", depth: "Depth chart", trending: "Most added", dropping: "Most dropped", trade: "Trade", add: "Pickup", drop: "Dropped",
};

export function leagueFeed(ctx: LeagueContext, items: NewsItem[], names: Record<string, string> = {}): FeedItem[] {
  const owner = new Map<string, { rid: number; name: string }>();
  for (const t of ctx.teams) for (const pid of t.players) owner.set(pid, { rid: t.rosterId, name: t.name });
  const nm = (id: string) => ctx.players.get(id)?.name ?? ctx.txNames?.[id] ?? names[id] ?? (/^[A-Z]{2,3}$/.test(id) ? `${id} defense` : "a player");
  const team = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)?.name ?? `Team ${rid}`;
  const out: FeedItem[] = [];
  for (const n of items) {
    const o = owner.get(n.id);
    out.push({ ...n, scope: o ? (o.rid === ctx.myRosterId ? "mine" : "league") : "nfl", owner: o ? o.name : null });
  }
  // This league's moves.
  for (const tx of ctx.transactions ?? []) {
    if (tx.status !== "complete" || !tx.created) continue;
    const at = new Date(tx.created).toISOString();
    const mine = tx.roster_ids.includes(ctx.myRosterId ?? -1);
    if (tx.type === "trade") {
      const sides = tx.roster_ids.map((rid) => `${team(rid)} gets ${Object.entries(tx.adds).filter(([, r]) => r === rid).map(([pid]) => nm(pid)).concat(tx.draft_picks.filter((p) => p.owner_id === rid).map((p) => `${p.season} R${p.round}`)).join(", ") || "nothing"}`);
      const first = Object.keys(tx.adds)[0] ?? "";
      out.push({ at, id: first, kind: "trade", text: `Trade: ${sides.join(" · ")}`, pos: ctx.players.get(first)?.pos ?? "", team: null, scope: mine ? "mine" : "league", owner: null });
    } else {
      for (const [pid, rid] of Object.entries(tx.adds)) out.push({ at, id: pid, kind: "add", text: `${team(rid)} ${tx.type === "waiver" ? "claimed" : "added"} ${nm(pid)}${Object.keys(tx.drops).length ? `, dropped ${Object.keys(tx.drops).map(nm).join(", ")}` : ""}`, pos: ctx.players.get(pid)?.pos ?? "", team: ctx.players.get(pid)?.team ?? null, scope: rid === ctx.myRosterId ? "mine" : "league", owner: team(rid) });
    }
  }
  const rank = { mine: 0, league: 1, nfl: 2 } as const;
  return out.sort((a, b) => b.at.localeCompare(a.at) || rank[a.scope] - rank[b.scope]);
}

export function ago(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}
