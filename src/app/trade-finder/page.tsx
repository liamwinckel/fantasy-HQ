"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import { TeamLink } from "@/components/TeamPeek";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { findTrades } from "@/lib/services/tradeFinder";
import { Card, ClassBadge, Logo, Notice, PageHeader, Tag, cx, signed } from "@/components/ui";
import { PlayerLink } from "@/components/PlayerCard";

export default function TradeFinderPage() {
  return <LeaguePage>{(d) => <TradeFinderPageBody {...d} />}</LeaguePage>;
}

function TradeFinderPageBody({ setup, league, ctx, sp }: LeagueData) {
  if (ctx.myRosterId === null) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;
  const { profiles, trades } = findTrades(ctx, ctx.myRosterId, 14);
  const mine = profiles.find((p) => p.rosterId === ctx.myRosterId)!;
  const partnerFilter = Number(sp.partner) || null;
  const shown = partnerFilter ? trades.filter((t) => t.partner === partnerFilter) : trades;
  const dyn = ctx.valuationMode === "dynasty";
  const POS = ["QB", "RB", "WR", "TE"].filter((p) => profiles.some((x) => x.power.positions[p]));
  const n = ctx.teamsCount;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Trade Finder" />
      <p className="-mt-2 max-w-3xl text-sm text-muted">
        Every team&apos;s strengths and needs, and trades that fill a hole on <b className="text-fg">both</b> sides. {dyn
          ? "Dynasty: deals must add value for each team's strategy (contender vs rebuilder) and stay close in value."
          : "Redraft: deals must improve your best lineups for the rest of the season without gutting theirs, and stay close in value."}
      </p>

      <Card title="Team needs map" right={<span className="text-[11px] text-muted">position rank · 1 = strongest</span>} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-5 py-2.5 font-semibold">Team</th>
              {POS.map((p) => <th key={p} className="px-2 py-2.5 text-center font-semibold">{p}</th>)}
              <th className="px-2 py-2.5 font-semibold">Needs</th><th className="px-2 py-2.5 font-semibold">Can spare</th>
              {dyn && <th className="px-2 py-2.5 font-semibold">Strategy</th>}
              <th className="px-5 py-2.5" />
            </tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.rosterId} className={cx("border-t border-line", p.rosterId === ctx.myRosterId && "bg-acc-soft")}>
                  <td className="px-5 py-2.5 font-semibold"><TeamLink rosterId={p.rosterId} name={`${p.name}${p.rosterId === ctx.myRosterId ? " (you)" : ""}`} avatar={ctx.teams.find((t) => t.rosterId === p.rosterId)?.avatar ?? null} size={26} /></td>
                  {POS.map((pos) => {
                    const r = p.power.positions[pos]?.rank ?? 0;
                    return <td key={pos} className="px-2 py-2.5 text-center"><span className={cx("num inline-block w-9 rounded py-0.5 text-xs font-bold", r && r <= Math.ceil(n / 3) ? "bg-pos/20 text-pos" : r > n / 2 ? "bg-neg/15 text-neg" : "bg-panel2 text-muted")}>{r || "—"}</span></td>;
                  })}
                  <td className="px-2 py-2.5 text-xs text-neg">{p.needs.join(", ") || "—"}</td>
                  <td className="px-2 py-2.5 text-xs text-pos">{p.surplus.join(", ") || "—"}</td>
                  {dyn && <td className="px-2 py-2.5"><ClassBadge cls={p.cls} /></td>}
                  <td className="px-5 py-2.5 text-right">{p.rosterId !== ctx.myRosterId && <Link href={`/trade-finder?partner=${p.rosterId}`} className="text-xs font-semibold text-acc-ink">Deals →</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-2.5 text-xs text-muted">You need: <b className="text-neg">{mine.needs.join(", ") || "nothing urgent"}</b> · you can spare: <b className="text-pos">{mine.surplus.join(", ") || "little depth"}</b>. Green = top third, red = bottom half.</p>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="h-display text-2xl">{partnerFilter ? `Deals with ${profiles.find((p) => p.rosterId === partnerFilter)?.name}` : "Suggested trades"}</h2>
        {partnerFilter && <Link href="/trade-finder" className="text-xs font-semibold text-acc-ink">Show all partners</Link>}
      </div>
      {shown.length === 0 && <Card><p className="text-sm text-muted">No trades found that clearly help both teams{partnerFilter ? " with this partner" : ""}. That usually means rosters don&apos;t complement each other right now.</p></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map((t, i) => {
          const fairPct = Math.round((1 - t.fairness) * 100);
          return (
            <Card key={i} title={<span className="flex items-center gap-2"><Logo src={ctx.teams.find((x) => x.rosterId === t.partner)?.avatar} name={t.partnerName} size={28} />With {t.partnerName}</span>} right={<Tag kind="MODEL" />}>
              <div className="grid grid-cols-2 gap-3">
                <Side label="You give" items={t.give} />
                <Side label="You get" items={t.get} accent />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label={dyn ? "Value to you" : "Your lineups, rest of season"} value={dyn ? signed(t.myValue) : `${signed(t.myRos)} pts`} tone={(dyn ? t.myValue : t.myRos) >= 0 ? "pos" : "neg"} />
                <Metric label={dyn ? "Value to them" : "Their lineups"} value={dyn ? signed(t.theirValue) : `${signed(t.theirRos)} pts`} tone={(dyn ? t.theirValue : t.theirRos) >= 0 ? "pos" : "neg"} />
                <Metric label="Fairness" value={`${fairPct}%`} tone={fairPct >= 75 ? "pos" : fairPct >= 60 ? undefined : "neg"} />
              </div>
              <ul className="mt-3 flex flex-col gap-1 text-xs leading-relaxed text-muted">{t.why.map((w) => <li key={w}>› {w}</li>)}</ul>
              <Link href={t.link} className="mt-3 block rounded-lg bg-acc py-2.5 text-center text-sm font-bold text-on-acc">Open in Trade Analyzer</Link>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted">Suggestions use real rosters and picks each team actually owns. Nothing is sent to Sleeper, and other managers&apos; preferences are unknown.</p>
    </div>
  );
}

function Side({ label, items, accent }: { label: string; items: { id: string; name: string; pos: string; value: number }[]; accent?: boolean }) {
  return (
    <div className={cx("rounded-xl p-3", accent ? "bg-acc-soft" : "bg-panel2")}>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{x.id.startsWith("p:") ? <PlayerLink id={x.id.slice(2)} name={x.name} className="font-semibold" /> : <b>{x.name}</b>} <span className="text-xs text-muted">{x.pos}</span></span>
            <span className="num text-xs">{x.value.toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) => (
  <div className="rounded-lg bg-panel2 p-2"><div className="text-[10px] text-muted">{label}</div><div className={cx("num text-sm font-bold", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div></div>
);
