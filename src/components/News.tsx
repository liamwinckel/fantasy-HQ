"use client";

/** News feed card for the dashboard: your players first, then your league, then the NFL. Tap "All news" for more. */
import { useMemo, useState } from "react";
import { useAsync } from "./AppData";
import { Card, cx } from "./ui";
import { Sheet } from "./Sheet";
import { PlayerImg } from "./client";
import { ago, KIND_LABEL, leagueFeed, loadNews, type FeedItem } from "@/lib/news";
import type { LeagueContext } from "@/lib/services/league";

const TONE: Record<string, string> = {
  injury: "text-warn", ir: "text-neg", return: "text-pos", healthy: "text-pos", team: "text-acc-ink", depth: "text-acc-ink", trending: "text-acc-ink", trade: "text-fg", add: "text-muted", drop: "text-muted",
};
type Filter = "all" | "mine" | "league";

function Row({ n, ctx }: { n: FeedItem; ctx: LeagueContext }) {
  const p = ctx.players.get(n.id);
  return (
    <li className="flex items-start gap-3 py-2.5">
      {p ? <PlayerImg id={n.id} name={p.name} pos={p.pos} size={32} /> : <span className="h-8 w-8 shrink-0 rounded-full bg-panel2" />}
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug">{n.text}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
          <span className={cx("font-bold uppercase tracking-wider", TONE[n.kind])}>{KIND_LABEL[n.kind] ?? n.kind}</span>
          <span>{ago(n.at)}</span>
          {n.scope === "mine" && n.kind !== "add" && n.kind !== "trade" && <span className="rounded bg-acc px-1 font-bold text-on-acc">YOUR PLAYER</span>}
          {n.scope === "league" && n.owner && <span>{n.owner}</span>}
        </div>
      </div>
    </li>
  );
}

export function NewsCard({ ctx }: { ctx: LeagueContext }) {
  const news = useAsync(() => loadNews(), []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Filter>("all");
  const feed = useMemo(() => leagueFeed(ctx, news.data?.data.items ?? []), [ctx, news.data]);
  // Dashboard: your news first, then league, then the biggest NFL items.
  const top = useMemo(() => [...feed.filter((x) => x.scope === "mine"), ...feed.filter((x) => x.scope === "league"), ...feed.filter((x) => x.scope === "nfl" && x.kind !== "trending")].slice(0, 6), [feed]);
  const list = feed.filter((x) => f === "all" || x.scope === f);
  return (
    <Card title="News" onOpen={() => setOpen(true)} info={<>Built every refresh from Sleeper&apos;s player database (injury designations, IR moves, signings and releases, depth-chart starters, most-added players) and your league&apos;s own trades and pickups. Your players first.</>}>
      {news.loading && !feed.length && <p className="text-sm text-muted">Loading news…</p>}
      {!news.loading && !feed.length && <p className="text-sm text-muted">No news yet. The feed starts filling from the next data refresh.</p>}
      <ul className="divide-y divide-line">{top.map((n, i) => <Row key={`${n.at}-${n.id}-${i}`} n={n} ctx={ctx} />)}</ul>
      {feed.length > top.length && <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-acc-ink">All news ({feed.length})</button>}
      <Sheet open={open} onClose={() => setOpen(false)} title="News" sub="Last 10 days" full>
        <div className="mb-2 flex gap-2">
          {(["all", "mine", "league"] as Filter[]).map((k) => (
            <button key={k} type="button" onClick={() => setF(k)} className={cx("rounded-full border px-3 py-1.5 text-xs font-semibold", f === k ? "border-acc bg-acc text-on-acc" : "border-line text-muted")}>{k === "all" ? "Everything" : k === "mine" ? "My team" : "My league"}</button>
          ))}
        </div>
        <ul className="divide-y divide-line pb-6">{list.slice(0, 200).map((n, i) => <Row key={`${n.at}-${n.id}-${i}`} n={n} ctx={ctx} />)}</ul>
        {!list.length && <p className="text-sm text-muted">Nothing here yet.</p>}
      </Sheet>
    </Card>
  );
}
