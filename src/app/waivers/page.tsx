"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { rosterSpace, waiverReport, type WaiverPlayer } from "@/lib/services/waivers";
import { WaiverBoard } from "./WaiverBoard";
import { Card, InjuryChip, NflLogo, Notice, PageHeader, Tag, signed } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";

export default function WaiverPage() {
  return <LeaguePage>{(d) => <WaiverPageBody {...d} />}</LeaguePage>;
}

function WaiverPageBody({ setup, league, ctx, sp }: LeagueData) {
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  if (!me) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;
  const r = waiverReport(ctx, me.rosterId);
  const valueLabel = ctx.valuationMode === "dynasty" ? "Dynasty trade value" : "Trade value";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Waiver Assistant" />
      <p className="-mt-2 max-w-3xl text-sm text-muted">
        The league&apos;s top projected free agents (Sleeper projections in your scoring), ranked by what they&apos;d add to <b className="text-fg">your</b> best lineup this week and for the rest of the season.
        Injured, suspended and players not projected to play are left out. If your roster is full, the suggested drop is taken off first, so the gain is net of losing him.
      </p>

      <Card title="Your needs" right={<Tag kind="MODEL" />}>
        <div className="flex flex-wrap gap-2 text-sm">
          {r.needs.map((n) => <span key={n.pos} className="rounded-lg bg-neg/15 px-2.5 py-1.5 font-semibold text-neg">{n.pos} · {n.reason}</span>)}
          {r.holes.map((h) => <span key={h.id} className="rounded-lg bg-warn/15 px-2.5 py-1.5 font-semibold text-warn">This week: {h.name} ({h.pos}) {h.why}</span>)}
          {r.needs.length === 0 && r.holes.length === 0 && <span className="text-muted">No weak spots: every position is top half and your lineup is full this week. Adds below are upgrades or depth.</span>}
        </div>
      </Card>

      <Card title="Best adds for your team" right={<Tag kind="SLEEPER" />} pad={false}>
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
          }))}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Streamers this week" hint="Biggest boost to this week's lineup only." items={r.streamers} stat={(w) => signed(w.weekGain)} statLabel="pts this week" />
        <ListCard title="Rising usage" hint="Healthy free agents whose opportunity or snap share is trending up over the last 3 games." items={r.rising} stat={(w) => w.proj.base.toFixed(1)} statLabel="proj pts/g" />
        <ListCard title="Handcuffs" hint="Free-agent backups to your top running backs." items={r.handcuffs} stat={(w) => w.proj.base.toFixed(1)} statLabel="pts/game" />
      </div>

      <Card title="Drop candidates" right={<Tag kind="MODEL" />} pad={false}>
        <ul className="divide-y divide-line">
          {r.drops.map((d) => (
            <li key={d.player.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <PlayerImg id={d.player.id} name={d.player.name} pos={d.player.pos} size={30} />
              <div className="min-w-0 flex-1"><PlayerLink id={d.player.id} name={d.player.name} className="font-bold" /> <span className="text-muted">{d.player.pos}{d.player.team ? ` · ${d.player.team}` : ""}</span><div className="text-xs text-muted">{d.reason}</div></div>
              <InjuryChip status={d.player.injury} />
              <div className="w-20 text-right"><div className="num font-bold">{d.value.toFixed(1)}</div><div className="text-[10px] text-muted">{ctx.valuationMode === "dynasty" ? "dynasty value" : "value"}</div></div>
            </li>
          ))}
          {r.drops.length === 0 && <li className="px-5 py-4 text-sm text-muted">Every player on your roster is in at least one of your best lineups.</li>}
        </ul>
      </Card>
      <p className="text-xs text-muted">FAAB bid suggestions aren&apos;t shown: there&apos;s no reliable free data on what your league bids. Waiver claims are made in Sleeper.</p>
    </div>
  );
}

function ListCard({ title, hint, items, stat, statLabel }: { title: string; hint: string; items: WaiverPlayer[]; stat: (w: WaiverPlayer) => string; statLabel: string }) {
  return (
    <Card title={title}>
      <p className="-mt-1 mb-3 text-xs text-muted">{hint}</p>
      {items.length === 0 && <p className="text-sm text-muted">None right now.</p>}
      <ul className="flex flex-col gap-3">
        {items.map((w) => (
          <li key={w.player.id} className="flex items-center gap-3">
            <PlayerImg id={w.player.id} name={w.player.name} pos={w.player.pos} size={32} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold"><PlayerLink id={w.player.id} name={w.player.name} /></div><div className="flex items-center gap-1 truncate text-xs text-muted"><NflLogo team={w.player.team} size={13} />{w.player.pos} · {w.player.team}{w.proj.opponent ? ` · vs ${w.proj.opponent}` : ""}</div></div>
            <div className="text-right"><div className="num text-sm font-bold text-acc-ink">{stat(w)}</div><div className="text-[10px] text-muted">{statLabel}</div></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
