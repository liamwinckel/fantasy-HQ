"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { rosterSpace, waiverReport, type WaiverPlayer } from "@/lib/services/waivers";
import { WaiverBoard } from "./WaiverBoard";
import { cx } from "@/components/ui";
import { useMemo } from "react";
import { waiverPlan } from "@/lib/services/waiverPlan";
import { Card, InjuryChip, NflLogo, Notice, PageHeader, Tag, signed, Info } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { AiChip, useShsAiMap } from "@/components/ShsAiParts";
import type { ShsAi } from "@/lib/services/shsai";
import { useAsync } from "@/components/AppData";
import { sleeper } from "@/lib/sleeper/client";
import { budgetOf, faabMarket, isFaab, loadHistory, suggestBid, type FaabSuggestion } from "@/lib/services/history";
import type { LeagueContext } from "@/lib/services/league";

export default function WaiverPage() {
  return <LeaguePage>{(d) => <WaiverPageBody {...d} />}</LeaguePage>;
}

function WaiverPageBody({ setup, league, ctx, sp }: LeagueData) {
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  const dyn = ctx.valuationMode === "dynasty";
  const aiWeek = useShsAiMap(ctx, "week");
  const aiRos = useShsAiMap(ctx, dyn ? "dynasty" : "ros");
  const faab = useFaab(ctx);
  if (!me) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;
  const r = waiverReport(ctx, me.rosterId);
  const topGain = Math.max(1, ...r.topAdds.map((w) => w.rosGain));
  const bids = faab ? new Map(r.topAdds.map((w, i) => [w.player.id, faab.suggest(w.player.id, i + 1, w.player.pos, Math.max(0, w.rosGain) / topGain)])) : null;
  const valueLabel = ctx.valuationMode === "dynasty" ? "Dynasty trade value" : "Trade value";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Waiver Assistant" />
      <Info className="-mt-2 self-center" label="About this tool">
        The league&apos;s top projected free agents (Sleeper projections in your scoring), ranked by what they&apos;d add to <b className="text-fg">your</b> best lineup this week and for the rest of the season.
        Injured, suspended and players not projected to play are left out. If your roster is full, the suggested drop is taken off first, so the gain is net of losing him.
      </Info>

      <Card title="Your needs" info={<>Positions where your best lineup is weakest compared with the rest of the league, and how thin your bench is there.</>} right={<Tag kind="MODEL" />}>
        <div className="flex flex-wrap gap-2 text-sm">
          {r.needs.map((n) => <span key={n.pos} className="rounded-lg bg-neg/15 px-2.5 py-1.5 font-semibold text-neg">{n.pos} · {n.reason}</span>)}
          {r.holes.map((h) => <span key={h.id} className="rounded-lg bg-warn/15 px-2.5 py-1.5 font-semibold text-warn">This week: {h.name} ({h.pos}) {h.why}</span>)}
          {r.needs.length === 0 && r.holes.length === 0 && <span className="text-muted">No weak spots: every position is top half and your lineup is full this week. Adds below are upgrades or depth.</span>}
        </div>
      </Card>

      {faab && bids && <BidSheet faab={faab} rows={r.topAdds.map((w) => ({ w, s: bids.get(w.player.id)! }))} />}

      <Card title="Best adds for your team" info={<>Free agents ranked by how much they improve your best lineup (this week and rest of season, in projected points), not by how good they are in general. Drop = the player SHS would release to make room.</>} right={<Tag kind="SLEEPER" />} pad={false}>
        <WaiverBoard
          leagueId={league.league_id}
          lastWeek={ctx.lastWeek}
          valueLabel={valueLabel}
          {...rosterSpace(ctx, me.rosterId)}
          roster={me.players.filter((id) => ctx.players.has(id) && !me.reserve.includes(id) && !me.taxi.includes(id))
            .map((id) => ({ id, name: ctx.players.get(id)!.name, pos: ctx.players.get(id)!.pos, value: ctx.values.get(id)?.[ctx.valuationMode === "dynasty" ? "dynasty" : "redraft"] ?? 0 }))
            .sort((a, b) => a.value - b.value)}
          rows={r.topAdds.map((w) => ({
            id: w.player.id, name: w.player.name, pos: w.player.pos, team: w.player.team, age: w.player.age, injury: w.player.injury,
            median: w.proj.median, base: w.proj.base, weekGain: w.weekGain, rosGain: w.rosGain, value: w.value, reasons: w.reasons, dropId: w.drop?.id ?? null, dropName: w.drop?.name ?? null, fills: w.fills,
            aiWeek: aiWeek.get(w.player.id)?.pct ?? null, aiRos: aiRos.get(w.player.id)?.pct ?? null, aiRosLabel: dyn ? "dyn" : "ROS", faab: bids?.get(w.player.id) ?? null,
          }))}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Streamers this week" hint="Biggest boost to this week's lineup only." items={r.streamers} stat={(w) => signed(w.weekGain)} statLabel="pts this week" ai={aiWeek} />
        <ListCard title="Rising usage" hint="Healthy free agents whose opportunity or snap share is trending up over the last 3 games." items={r.rising} stat={(w) => w.proj.base.toFixed(1)} statLabel="proj pts/g" ai={aiRos} />
        <ListCard title="Handcuffs" hint="Free-agent RBs who are next up on their NFL depth chart. Backups to your own RBs first." items={r.handcuffs} stat={(w) => w.proj.base.toFixed(1)} statLabel="pts/game" ai={aiRos} />
      </div>

      <WaiverPlanner ctx={ctx} rosterId={ctx.myRosterId} />

      <Card title="Drop candidates" info={<>Bench players (not in any of your best lineups) who are worse than the best free agent at the same position right now{" "}— in redraft by rest-of-season points per game, in dynasty by trade value. Players out long-term (IR, PUP, suspended) are flagged too.</>} right={<Tag kind="MODEL" />} pad={false}>
        <ul className="divide-y divide-line">
          {r.drops.map((d) => (
            <li key={d.player.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <PlayerImg id={d.player.id} name={d.player.name} pos={d.player.pos} size={30} />
              <div className="min-w-0 flex-1"><PlayerLink id={d.player.id} name={d.player.name} className="font-bold" /> <span className="text-muted">{d.player.pos}{d.player.team ? ` · ${d.player.team}` : ""}</span><div className="text-xs text-muted">{d.reason}</div></div>
              <InjuryChip status={d.player.injury} /><AiChip v={aiRos.get(d.player.id)?.pct} ai={aiRos.get(d.player.id)} name={d.player.name} />
              <div className="w-20 text-right"><div className="num font-bold">{d.value.toFixed(1)}</div><div className="text-[10px] text-muted">{ctx.valuationMode === "dynasty" ? "dynasty value" : "value"}</div></div>
            </li>
          ))}
          {r.drops.length === 0 && <li className="px-5 py-4 text-sm text-muted">Nobody outside your best lineups is worse than the best free agent at his position.</li>}
        </ul>
      </Card>
      <Info className="">{isFaab(league) ? "FAAB bids are suggestions from your league's own bidding history and Sleeper's trending adds." : "This league doesn't use FAAB."} Waiver claims are made in Sleeper.</Info>
    </div>
  );
}

function ListCard({ title, hint, items, stat, statLabel, ai }: { title: string; hint: string; items: WaiverPlayer[]; stat: (w: WaiverPlayer) => string; statLabel: string; ai: Map<string, ShsAi> }) {
  return (
    <Card title={title}>
      <Info className="-mt-1 mb-3">{hint}</Info>
      {items.length === 0 && <p className="text-sm text-muted">None right now.</p>}
      <ul className="flex flex-col gap-3">
        {items.map((w) => (
          <li key={w.player.id} className="flex items-center gap-3">
            <PlayerImg id={w.player.id} name={w.player.name} pos={w.player.pos} size={32} />
            <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><span className="truncate"><PlayerLink id={w.player.id} name={w.player.name} /></span><AiChip v={ai.get(w.player.id)?.pct} ai={ai.get(w.player.id)} name={w.player.name} /></div><div className="flex items-center gap-1 truncate text-xs text-muted"><NflLogo team={w.player.team} size={13} />{w.player.pos} · {w.player.team}{w.proj.opponent ? ` · vs ${w.proj.opponent}` : ""}</div></div>
            <div className="text-right"><div className="num text-sm font-bold text-acc-ink">{stat(w)}</div><div className="text-[10px] text-muted">{statLabel}</div></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The next four weeks: where your lineup has holes, and who fills them (add early) or is worth stashing. */
function WaiverPlanner({ ctx, rosterId }: { ctx: LeagueData["ctx"]; rosterId: number | null }) {
  const plan = useMemo(() => (rosterId === null || ctx.seasonOver ? null : waiverPlan(ctx, rosterId)), [ctx, rosterId]);
  if (!plan) return null;
  const KIND = { fill: ["Bye/hole fill", "bg-acc text-on-acc"], upgrade: ["Upgrade", "bg-pos/20 text-pos"], stash: ["Stash", "border border-line text-muted"] } as const;
  return (
    <Card title="Waiver planner · next 4 weeks" info={<>Looks ahead, not just at this week. Each week we build your best lineup from projections (byes, injuries and matchups included) and flag the spots that will be empty or weak. Then every free agent is tried in your lineup for each week: the bars show how many points he adds each week. Grab bye-week fills a week early, before other teams do; stash injured players who&apos;ll start for you when they&apos;re back.</>}>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {plan.weeks.map((w) => (
          <div key={w.week} className={cx("rounded-xl border p-2.5", w.holes.length ? "border-warn/60 bg-warn/5" : "border-line bg-panel2/40")}>
            <div className="flex items-center justify-between text-xs"><b>Week {w.week}</b><span className="num text-muted">{w.total.toFixed(0)} pts</span></div>
            {w.holes.length ? <ul className="mt-1 flex flex-col gap-0.5 text-[11px]">{w.holes.slice(0, 3).map((h, i) => <li key={i} className="truncate"><b className="text-warn">{h.slot}</b> {h.name} · {h.why}</li>)}</ul>
              : <div className="mt-1 text-[11px] text-pos">Lineup set</div>}
          </div>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {plan.targets.map((t) => {
          const mx = Math.max(1, ...plan.targets.flatMap((x) => Object.values(x.gains)));
          return (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <PlayerImg id={t.id} name={t.name} pos={t.pos} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><PlayerLink id={t.id} name={t.name} className="truncate text-sm font-semibold" /><span className="text-xs text-muted">{t.pos} · {t.team}</span><InjuryChip status={t.injury} /><span className={cx("ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", KIND[t.kind][1])}>{KIND[t.kind][0]}</span></div>
                <div className="truncate text-xs text-muted">{t.why}</div>
              </div>
              <div className="flex h-8 shrink-0 items-end gap-1" aria-label="Points added each week">
                {plan.weeks.map((w) => <div key={w.week} title={`Week ${w.week}: +${t.gains[w.week]}`} className="flex w-3 flex-col items-center"><div className="w-3 rounded-sm bg-acc" style={{ height: `${Math.max(2, (t.gains[w.week] / mx) * 26)}px`, opacity: t.gains[w.week] > 0 ? 1 : 0.2 }} /></div>)}
              </div>
            </li>
          );
        })}
        {!plan.targets.length && <li className="py-3 text-sm text-muted">No free agent improves your lineup over the next four weeks.</li>}
      </ul>
      {plan.drop && plan.targets.length > 0 && <p className="mt-2 text-xs text-muted">Roster full? Your least valuable bench player is <b className="text-fg">{plan.drop.name}</b>.</p>}
      <p className="mt-1 text-[11px] text-muted">Bars = points added to your best lineup, weeks {plan.weeks[0]?.week}–{plan.weeks.at(-1)?.week}.</p>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------
// FAAB: the league's own bidding history + Sleeper's trending adds → a suggested bid for each free agent.
interface FaabState { budget: number; myLeft: number; rivalsLeft: number[]; richest: { name: string; left: number } | null; seasons: number; fromLeague: boolean; trendTop: Map<string, number>; suggest: (pid: string, fitRank: number, pos: string, gainShare: number) => FaabSuggestion }
function useFaab(ctx: LeagueContext): FaabState | null {
  const on = isFaab(ctx.league);
  const q = useAsync(async () => {
    if (!on) return null;
    const [h, rosters, trending] = await Promise.all([
      loadHistory(ctx),
      sleeper.rosters(ctx.league.league_id).then((r) => r.data),
      sleeper.trending().then((r) => r.data).catch(() => [] as { player_id: string; count: number }[]),
    ]);
    return { market: faabMarket(h), rosters, trending };
  }, [ctx, on]);
  return useMemo(() => {
    if (!on || !q.data) return null;
    const { market, rosters, trending } = q.data;
    const B = budgetOf(ctx.league);
    const leftOf = (rid: number) => B - Number((rosters.find((r) => r.roster_id === rid)?.settings as Record<string, unknown> | undefined)?.waiver_budget_used ?? 0);
    const rostered = new Set(rosters.flatMap((r) => r.players ?? []));
    // Rank only players available in this league: "the #3 most-added free agent here".
    const trendTop = new Map<string, number>();
    for (const t of trending) if (!rostered.has(t.player_id) && ctx.players.has(t.player_id)) trendTop.set(t.player_id, trendTop.size + 1);
    const myLeft = ctx.myRosterId !== null ? leftOf(ctx.myRosterId) : B;
    const rivals = ctx.teams.filter((t) => t.rosterId !== ctx.myRosterId).map((t) => ({ name: t.name, left: leftOf(t.rosterId) }));
    const richest = rivals.sort((a, b) => b.left - a.left)[0] ?? null;
    const seasonWeeks = Math.max(1, ctx.lastWeek);
    const weeksLeft = Math.max(0, ctx.lastWeek - ctx.currentWeek + 1);
    const minBid = Number((ctx.league.settings as Record<string, unknown>).waiver_bid_min ?? 0) || 0;
    return {
      budget: B, myLeft, rivalsLeft: rivals.map((r) => r.left), richest, seasons: market.seasons, fromLeague: market.fromLeague, trendTop,
      suggest: (pid: string, fitRank: number, pos: string, gainShare: number) => suggestBid({ market, myLeft, rivalsLeft: rivals.map((r) => r.left), fitRank, trendRank: trendTop.get(pid) ?? null, weeksLeft, seasonWeeks, minBid, pos, gainShare }),
    };
  }, [on, q.data, ctx]);
}

function BidSheet({ faab, rows }: { faab: FaabState; rows: { w: WaiverPlayer; s: FaabSuggestion }[] }) {
  const list = [...rows].sort((a, b) => b.s.bid - a.s.bid || (a.s.trendRank ?? 99) - (b.s.trendRank ?? 99)).slice(0, 8);
  const tone = (t: string) => (t === "Must-add" ? "bg-pos/20 text-pos" : t === "Strong add" ? "bg-pos/10 text-pos" : t === "Solid add" ? "bg-acc-soft text-acc-ink" : "bg-panel2 text-muted");
  return (
    <Card title="FAAB bid sheet" right={<span className="num text-sm font-bold">${faab.myLeft} <span className="font-normal text-muted">of ${faab.budget} left</span></span>}
      info={<>Waiver rankings combine how much a player helps <b>your</b> lineup with how hot he is across Sleeper (most-added in the last 48 hours, free agents in this league only).
        Bids come from what your league has actually paid{faab.seasons ? ` over ${faab.seasons} season${faab.seasons > 1 ? "s" : ""}` : ""}{faab.fromLeague ? "" : ", with typical FAAB prices filling in until there's more history"}, rise late in the season (unspent FAAB is worth nothing) and never exceed what you have left.</>} pad={false}>
      <ul className="divide-y divide-line">
        {list.map(({ w, s }) => (
          <li key={w.player.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <PlayerImg id={w.player.id} name={w.player.name} pos={w.player.pos} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5"><PlayerLink id={w.player.id} name={w.player.name} className="truncate font-bold" /><span className="shrink-0 text-xs text-muted">{w.player.pos}</span></div>
              <div className="truncate text-xs text-muted">{s.trendRank ? `#${s.trendRank} most-added FA · ` : ""}{s.why.find((x) => x.startsWith("Your")) ?? ""}</div>
            </div>
            <span className={cx("hidden shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:inline", tone(s.tier))}>{s.tier}</span>
            <div className="w-16 shrink-0 text-right"><div className="num text-base font-extrabold">${s.bid}</div><div className="num text-[10px] text-muted">${s.low}–${s.high}</div></div>
          </li>
        ))}
      </ul>
      {faab.richest && <p className="border-t border-line px-4 py-2 text-xs text-muted">Richest rival: <b className="text-fg">{faab.richest.name}</b> with ${faab.richest.left} left.</p>}
    </Card>
  );
}
