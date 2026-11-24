"use client";

import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { TeamLink } from "@/components/TeamPeek";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { findTrades } from "@/lib/services/tradeFinder";
import { Card, ClassBadge, Logo, Notice, PageHeader, Tag, cx, signed, Info } from "@/components/ui";
import { PlayerLink } from "@/components/PlayerCard";
import { AiChip, useShsAiMap } from "@/components/ShsAiParts";
import type { ShsAi } from "@/lib/services/shsai";

export default function TradeFinderPage() {
  return <LeaguePage>{(d) => <TradeFinderPageBody {...d} />}</LeaguePage>;
}

function TradeFinderPageBody({ league, ctx, sp }: LeagueData) {
  const { set } = useQuery();
  const ai = useShsAiMap(ctx, ctx.valuationMode === "dynasty" ? "dynasty" : "ros");
  if (ctx.myRosterId === null) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;
  const partnerFilter = Number(sp.partner) && ctx.teams.some((t) => t.rosterId === Number(sp.partner) && t.rosterId !== ctx.myRosterId) ? Number(sp.partner) : null;
  const { profiles, trades } = findTrades(ctx, ctx.myRosterId, partnerFilter ? 8 : 14, partnerFilter);
  const mine = profiles.find((p) => p.rosterId === ctx.myRosterId)!;
  const shown = trades;
  const pick = (rid: number | null) => {
    set({ partner: rid ? String(rid) : undefined }, true);
    setTimeout(() => document.getElementById("deals")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const dyn = ctx.valuationMode === "dynasty";
  const POS = ["QB", "RB", "WR", "TE"].filter((p) => profiles.some((x) => x.power.positions[p]));
  const n = ctx.teamsCount;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Trade Finder" />
      <Info className="-mt-2 self-center" label="About this tool">
        Every team&apos;s strengths and needs, and trades that fill a hole on <b className="text-fg">both</b> sides. {dyn
          ? "Dynasty: deals must add value for each team's strategy (contender vs rebuilder) and stay close in value."
          : "Redraft: deals must improve your best lineups for the rest of the season without gutting theirs, and stay close in value."}
      </Info>

      <Card title="Team needs" info={<>Each team&apos;s rank at each position (1 = strongest). <span className="text-pos">Green</span> = top third, <span className="text-neg">red</span> = bottom half (a need). You need: <b className="text-neg">{mine.needs.join(", ") || "nothing urgent"}</b>; you can spare: <b className="text-pos">{mine.surplus.join(", ") || "little depth"}</b>. Tap Deals to see trades with that team.</>} pad={false}>
        <ul className="divide-y divide-line">
          {profiles.map((p) => {
            const t = ctx.teams.find((x) => x.rosterId === p.rosterId);
            const isMe = p.rosterId === ctx.myRosterId;
            return (
              <li key={p.rosterId} className={cx("flex items-center gap-2 px-3 py-2 sm:px-5", isMe && "bg-acc-soft", partnerFilter === p.rosterId && "bg-panel2")}>
                <div className="min-w-0 flex-1">
                  <TeamLink rosterId={p.rosterId} name={`${p.name}${isMe ? " (you)" : ""}`} avatar={t?.avatar ?? null} size={24} className="max-w-full text-sm font-semibold" />
                  {dyn && p.cls && <div className="mt-0.5 pl-8"><ClassBadge cls={p.cls} className="!text-[9px]" /></div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {POS.map((pos) => {
                    const r = p.power.positions[pos]?.rank ?? 0;
                    return (
                      <span key={pos} className={cx("flex w-8 flex-col items-center rounded py-0.5 sm:w-10", r && r <= Math.ceil(n / 3) ? "bg-pos/20 text-pos" : r > n / 2 ? "bg-neg/15 text-neg" : "bg-panel2 text-muted")}>
                        <span className="text-[8px] font-bold opacity-70">{pos}</span><span className="num text-xs font-bold leading-tight">{r || "—"}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="w-14 shrink-0 text-right">
                  {!isMe && <button type="button" onClick={() => pick(p.rosterId)} className={cx("rounded-md px-2 py-1.5 text-xs font-bold", partnerFilter === p.rosterId ? "bg-acc text-on-acc" : "border border-line text-acc-ink")}>Deals</button>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div id="deals" className="flex scroll-mt-20 items-center justify-between">
        <h2 className="h-display text-2xl">{partnerFilter ? `Deals with ${profiles.find((p) => p.rosterId === partnerFilter)?.name}` : "Suggested trades"}</h2>
        {partnerFilter && <button type="button" onClick={() => pick(null)} className="text-xs font-semibold text-acc-ink">Show all partners</button>}
      </div>
      {shown.length === 0 && <Card><p className="text-sm text-muted">No trades found that clearly help both teams{partnerFilter ? " with this partner" : ""}. That usually means rosters don&apos;t complement each other right now.</p></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map((t, i) => {
          
          return (
            <Card key={i} title={<span className="flex items-center gap-2"><Logo src={ctx.teams.find((x) => x.rosterId === t.partner)?.avatar} name={t.partnerName} size={28} />With {t.partnerName}</span>} right={<Tag kind="MODEL" />}>
              <div className="grid grid-cols-2 gap-3">
                <Side label="You give" items={t.give} ai={ai} />
                <Side label="You get" items={t.get} accent ai={ai} />
              </div>
              <AiEdge give={t.give} get={t.get} ai={ai} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label={dyn ? "Value to you" : "Your lineups, rest of season"} value={dyn ? signed(t.myValue) : `${signed(t.myRos)}/g`} tone={(dyn ? t.myValue : t.myRos) >= 0 ? "pos" : "neg"} />
                <Metric label={dyn ? "Value to them" : "Their lineups"} value={dyn ? signed(t.theirValue) : `${signed(t.theirRos)}/g`} tone={(dyn ? t.theirValue : t.theirRos) >= 0 ? "pos" : "neg"} />
                <Metric label="Chance they accept" value={`${Math.round(t.accept * 100)}%`} tone={t.accept >= 0.55 ? "pos" : t.accept >= 0.35 ? undefined : "neg"} />
              </div>
              <ul className="mt-3 flex flex-col gap-1 text-xs leading-relaxed text-muted">{t.why.map((w) => <li key={w}>› {w}</li>)}</ul>
              <Link href={t.link} className="mt-3 block rounded-lg bg-acc py-2.5 text-center text-sm font-bold text-on-acc">Open in Trade Analyzer</Link>
            </Card>
          );
        })}
      </div>
      <Info className="">Suggestions use real rosters and picks each team actually owns. Nothing is sent to Sleeper, and other managers&apos; preferences are unknown.</Info>
    </div>
  );
}

type Item = { id: string; name: string; pos: string; value: number };
/** How SHS AI's adjustments shift the deal: value received minus value sent, each scaled by its ±%. */
function AiEdge({ give, get, ai }: { give: Item[]; get: Item[]; ai: Map<string, ShsAi> }) {
  const adj = (xs: Item[]) => xs.reduce((a, x) => a + (x.id.startsWith("p:") ? (x.value * (ai.get(x.id.slice(2))?.pct ?? 0)) / 100 : 0), 0);
  const edge = Math.round((adj(get) - adj(give)) * 10) / 10;
  if (!get.concat(give).some((x) => x.id.startsWith("p:") && ai.get(x.id.slice(2))?.pct !== null && ai.get(x.id.slice(2))?.pct !== undefined)) return null;
  return (
    <p className={cx("mt-2 rounded-lg px-3 py-1.5 text-xs", edge > 1 ? "bg-pos/10 text-pos" : edge < -1 ? "bg-neg/10 text-neg" : "bg-panel2 text-muted")}>
      <b>SHS AI:</b> {Math.abs(edge) <= 1 ? "agrees with the experts on this deal" : edge > 0 ? `the evidence favours you (+${edge} value beyond the expert view)` : `the evidence favours them (${edge} value vs the expert view)`}
    </p>
  );
}

function Side({ label, items, accent, ai }: { label: string; items: Item[]; accent?: boolean; ai: Map<string, ShsAi> }) {
  return (
    <div className={cx("rounded-xl p-3", accent ? "bg-acc-soft" : "bg-panel2")}>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{x.id.startsWith("p:") ? <PlayerLink id={x.id.slice(2)} name={x.name} className="font-semibold" /> : <b>{x.name}</b>} <span className="text-xs text-muted">{x.pos}</span></span>
            <span className="flex items-center gap-1.5">{x.id.startsWith("p:") && <AiChip v={ai.get(x.id.slice(2))?.pct} ai={ai.get(x.id.slice(2))} name={x.name} />}<span className="num text-xs">{x.value.toFixed(0)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) => (
  <div className="rounded-lg bg-panel2 p-2"><div className="text-[10px] text-muted">{label}</div><div className={cx("num text-sm font-bold", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div></div>
);
