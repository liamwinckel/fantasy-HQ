"use client";

import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { TeamLink } from "@/components/TeamPeek";
import type { LeagueContext } from "@/lib/services/league";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { gameView, lineupSwaps, opponentOf } from "@/lib/services/views";
import { waiverReport } from "@/lib/services/waivers";
import { breakouts } from "@/lib/services/breakouts";
import { loadKeeperPlan } from "@/lib/services/keeperData";
import { powerRankings } from "@/lib/engine/power";
import { winProbability } from "@/lib/engine/simulate";
import { ord } from "@/lib/engine/classify";
import { Logo, Bar, Card, ClassBadge, InjuryChip, Notice, PageHeader, Stat, Tag, cx, signed, Info, WinBar } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { SeasonChart } from "@/components/charts";

const FORMAT_NOTE: Record<string, string> = {
  redraft: "Redraft league: built around this season: playoff odds, schedule and weekly lineup gains.",
  keeper: "Keeper league: this season plus next year's keepers and what they'll cost.",
  dynasty: "Dynasty league: this season plus long-term roster value, age, picks and team strategy.",
};

export default function Dashboard() {
  return <LeaguePage>{(d) => <DashboardBody {...d} />}</LeaguePage>;
}

function DashboardBody({ setup, league, ctx, sp }: LeagueData) {
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  const keeperQ = useAsync(() => (ctx.format === "keeper" ? loadKeeperPlan(setup.settings, league, ctx) : Promise.resolve(null)), [ctx, league, setup]);
  if (!me) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;

  const fmt = ctx.format;
  const week = Math.min(ctx.currentWeek, ctx.lastWeek);
  const g = gameView(ctx, me.rosterId, week);
  const started = !ctx.seasonOver && ctx.matchupsThisWeek.some((m) => m.points > 0);
  const power = powerRankings(ctx);
  const myPower = power.find((p) => p.rosterId === me.rosterId)!;
  const avgPf = ctx.teams.reduce((a, t) => a + t.pointsFor, 0) / ctx.teams.length;
  const avgPa = ctx.teams.reduce((a, t) => a + t.pointsAgainst, 0) / ctx.teams.length;
  const cls = ctx.showClasses ? ctx.classifications.get(me.rosterId) : undefined;
  const swaps = ctx.seasonOver ? [] : lineupSwaps(ctx, me.rosterId);
  const waivers = ctx.seasonOver ? [] : waiverReport(ctx, me.rosterId).topAdds.slice(0, 3);
  const breaks = breakouts(ctx).filter((b) => b.owner === "Free agent" || b.mine).slice(0, 4);
  const injured = me.players.map((id) => ctx.players.get(id)).filter((p) => p?.injury) as NonNullable<ReturnType<typeof ctx.players.get>>[];
  const keeper = keeperQ.data;
  const myPicks = ctx.picks.filter((p) => p.ownerRosterId === me.rosterId);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring} · ${ctx.teamsCount} teams`} title="Dashboard">
        <span className={cx("rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider", fmt === "dynasty" ? "bg-fg text-bg" : fmt === "keeper" ? "border border-acc text-acc-ink" : "bg-acc text-on-acc")}>{formatLabel(league)} league</span>
      </PageHeader>
      <Info className="-mt-2 self-center" label="About this tool">{FORMAT_NOTE[fmt]}</Info>
      {ctx.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Record" value={`${me.wins}–${me.losses}${me.ties ? `–${me.ties}` : ""}`} sub={`${ord(me.rank)} in standings`} tag="ACTUAL" />
        <Stat label="Power rank" value={`#${myPower.rank}`} sub={`of ${ctx.teamsCount} · score ${myPower.score.toFixed(0)}`} tag="MODEL" />
        <Stat label="Points for" value={me.pointsFor.toFixed(0)} sub={`${signed(me.pointsFor - avgPf)} vs avg`} tone={me.pointsFor >= avgPf ? "pos" : "neg"} tag="ACTUAL" />
        <Stat label="Points against" value={me.pointsAgainst.toFixed(0)} sub={`${signed(me.pointsAgainst - avgPa)} vs avg`} tone={me.pointsAgainst <= avgPa ? "pos" : "neg"} tag="ACTUAL" />
        <Stat label="Playoff odds" value={`${(ctx.sim.playoffOdds[me.rosterId] ?? 0).toFixed(0)}%`} sub={`Projected ${ctx.sim.projectedWins[me.rosterId] ?? "—"} wins`} tag="MODEL" />
        <Stat label="Title odds" value={`${(ctx.sim.titleOdds[me.rosterId] ?? 0).toFixed(0)}%`} sub="Simulated" tag="MODEL" />
        {fmt === "redraft" && <Stat label="Projected finish" value={ord(Math.round(ctx.sim.avgSeed[me.rosterId] ?? 0))} sub="Average simulated seed" tag="MODEL" />}
        {fmt === "dynasty" && <Stat label="Roster value" value={`#${myPower.dynastyRank}`} sub={`of ${ctx.teamsCount} · players + picks`} tag="MODEL" />}
        {fmt === "dynasty" && cls && <Stat label="Strategy" value={<ClassBadge cls={cls.override ?? cls.primary} className="text-sm" />} sub={`${cls.confidence}% confidence`} tag="MODEL" />}
        {fmt === "keeper" && keeper && <Stat label="Keepers lined up" value={`${keeper.rows.filter((r) => r.recommended).length} / ${keeper.rules.maxKeepers}`} sub="Positive-surplus keepers" tag="MODEL" />}
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card title={`Week ${week} · this week`} right={<Link href="/matchup" className="text-xs font-semibold text-acc-ink">Full matchup →</Link>}>
          {g.b ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="flex items-center gap-2 font-semibold"><Logo src={g.a.avatar} name={g.a.name} size={26} /><span className="truncate">{g.a.name}</span></div><div className="num font-[family-name:var(--font-display)] text-4xl font-bold">{(started ? g.a.actual : g.a.projected)?.toFixed(1)}</div></div>
                <span className="text-xs font-bold uppercase text-muted">{started ? "Live" : "Projected"}</span>
                <div className="min-w-0 text-right"><div className="flex flex-row-reverse items-center gap-2 font-semibold"><TeamLink rosterId={g.b.rosterId} name={g.b.name} avatar={g.b.avatar} size={26} /></div><div className="num font-[family-name:var(--font-display)] text-4xl font-bold">{(started ? g.b.actual : g.b.projected)?.toFixed(1)}</div></div>
              </div>
              {g.winProbA !== null && <div className="flex items-center gap-3 text-sm"><span className="w-28 shrink-0 text-xs text-muted">Your win chance</span><WinBar pct={g.winProbA} /><span className="num w-12 text-right font-bold">{g.winProbA.toFixed(0)}%</span></div>}
            </div>
          ) : <p className="text-sm text-muted">No opponent this week.</p>}
        </Card>
        <Card title="Action queue" right={<Link href="/matchup" className="text-xs font-semibold text-acc-ink">Set lineup →</Link>} pad={false}>
          {swaps.length === 0 && <p className="px-5 py-4 text-sm text-muted">Your lineup matches the best projected lineup.</p>}
          {swaps.slice(0, 4).map((s, i) => (
            <div key={i} className="flex items-start justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
              <div className="text-sm leading-snug"><b>Start <PlayerLink id={s.inId} name={s.inName} /></b>{s.outId ? `, bench ${s.outName}` : ""}<div className="text-xs text-muted">{s.reason}</div></div>
              <span className="num shrink-0 text-xs font-bold text-pos">{signed(s.gain)} pts</span>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Season at a glance" right={<Tag kind="ACTUAL" />}><SeasonChart ctx={ctx} rosterId={me.rosterId} selectedWeek={week} /></Card>

      {/* Format-specific section */}
      {fmt === "redraft" && <PlayoffPath ctx={ctx} me={me.rosterId} power={power} />}
      {fmt === "keeper" && keeper && (
        <Card title="Keeper preview" right={<Link href="/keepers" className="text-xs font-semibold text-acc-ink">Keeper Planner →</Link>}>
          {keeper.note && <p className="mb-2 text-xs text-warn">{keeper.note}</p>}
          <div className="grid gap-2 md:grid-cols-3">
            {keeper.rows.filter((r) => r.recommended).map((r) => (
              <div key={r.playerId} className="rounded-xl border border-acc bg-acc-soft p-3">
                <PlayerLink id={r.playerId} name={r.name} className="font-bold" />
                <div className="text-xs text-muted">{r.pos} · costs R{r.costRound} ({r.costSource === "drafted" ? `drafted R${r.draftedRound}` : r.costSource})</div>
                <div className="num mt-1 text-sm">Surplus <b className="text-pos">{signed(r.surplus)}</b> pts/g</div>
              </div>
            ))}
            {keeper.rows.filter((r) => r.recommended).length === 0 && <p className="text-sm text-muted">No keeper beats the value of its draft round right now.</p>}
          </div>
          <Info className="mt-3">Rules: keep {keeper.rules.maxKeepers}, cost = this year&apos;s round {keeper.rules.modifier === "same" ? "(same round)" : `${keeper.rules.modifier} (${keeper.rules.direction})`}. Undrafted players cost R{keeper.rules.undraftedRound}.</Info>
        </Card>
      )}
      {fmt === "dynasty" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Dynasty outlook" right={<Tag kind="MODEL" />}>
            {cls && <div className="mb-3 flex items-center gap-2"><ClassBadge cls={cls.override ?? cls.primary} /><span className="text-sm text-muted">{cls.strategy}</span></div>}
            <AgeProfile ctx={ctx} rosterId={me.rosterId} />
          </Card>
          <Card title="Your draft picks" right={<Tag kind="SLEEPER" />}>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {myPicks.slice(0, 12).map((p) => (
                <li key={p.key} className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2">
                  <span><b>{p.season} R{p.round}</b> <span className="text-xs text-muted">{p.originalRosterId === me.rosterId ? "own" : `via ${ctx.teams.find((t) => t.rosterId === p.originalRosterId)?.name}`}</span></span>
                  <span className="num text-xs text-acc-ink">{p.value.toFixed(0)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{myPicks.filter((p) => p.round === 1).length} first-round and {myPicks.filter((p) => p.round === 2).length} second-round picks over the next 3 drafts. Values are from the SHS pick model.</p>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Waiver targets" right={<Link href="/waivers" className="text-xs font-semibold text-acc-ink">Waivers →</Link>}>
          <ul className="flex flex-col gap-3">
            {waivers.map((w) => (
              <li key={w.player.id} className="flex items-center gap-3">
                <PlayerImg id={w.player.id} name={w.player.name} pos={w.player.pos} size={32} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold"><PlayerLink id={w.player.id} name={w.player.name} /> <span className="font-medium text-muted">{w.player.pos}</span></div><div className="truncate text-xs text-muted">{w.rosGain > 0 ? `${signed(w.rosGain)} pts rest of season` : "Depth / stash"}</div></div>
                <span className="num font-bold text-acc-ink">{w.value.toFixed(0)}</span>
              </li>
            ))}
            {waivers.length === 0 && <li className="text-sm text-muted">Nothing stands out.</li>}
          </ul>
        </Card>
        <Card title={fmt === "dynasty" ? "Future stars to watch" : "Breakout watch"} right={<Link href="/breakouts" className="text-xs font-semibold text-acc-ink">Breakouts →</Link>}>
          <ul className="flex flex-col gap-3">
            {breaks.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                <PlayerImg id={b.id} name={b.name} pos={b.pos} size={32} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold"><PlayerLink id={b.id} name={b.name} /> <span className="font-medium text-muted">{b.pos}</span></div><div className="truncate text-xs text-muted">{b.mine ? "On your team" : "Free agent"} · {b.evidence[0] ?? ""}</div></div>
                <span className="num font-bold text-acc-ink">{b.score}</span>
              </li>
            ))}
            {breaks.length === 0 && <li className="text-sm text-muted">No breakout candidates available to you right now.</li>}
          </ul>
        </Card>
        <Card title="Injury report" right={<Tag kind="SLEEPER" />}>
          {injured.length === 0 && <p className="text-sm text-muted">No injury designations on your roster.</p>}
          <ul className="flex flex-col gap-2.5">
            {injured.map((p) => (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <PlayerImg id={p.id} name={p.name} pos={p.pos} size={30} />
                <div className="min-w-0 flex-1"><PlayerLink id={p.id} name={p.name} className="font-bold" /> <span className="text-muted">{p.pos}{me.starters.includes(p.id) ? " · starter" : ""}</span></div>
                <InjuryChip status={p.injury} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

type Ctx = LeagueContext;

/** Redraft: remaining opponents and how strong they are, plus the fantasy-playoff schedule for your starters. */
function PlayoffPath({ ctx, me, power }: { ctx: Ctx; me: number; power: ReturnType<typeof powerRankings> }) {
  const weeks = Array.from({ length: Math.max(0, ctx.playoffStart - Math.min(ctx.currentWeek, ctx.lastWeek)) }, (_, i) => Math.min(ctx.currentWeek, ctx.lastWeek) + i);
  const starters = ctx.lineups.get(me)?.optimal.map((s) => s.playerId).filter(Boolean) as string[];
  const outlook = starters.map((id) => ({ id, name: ctx.players.get(id)!.name, pos: ctx.players.get(id)!.pos, f: ctx.extras.get(id)?.outlookPlayoffs ?? 1 })).sort((a, b) => b.f - a.f);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Path to the playoffs" right={<Tag kind="MODEL" />}>
        {weeks.length === 0 && <p className="text-sm text-muted">The regular season is over.</p>}
        <ul className="flex flex-col gap-2">
          {weeks.map((w) => {
            const opp = opponentOf(ctx, me, w);
            const a = ctx.weekStrength.get(me)?.get(w);
            const b = opp !== null ? ctx.weekStrength.get(opp)?.get(w) : undefined;
            const wp = a && b ? winProbability(a, b) : null;
            return (
              <li key={w} className="grid grid-cols-[3.5rem_1fr_6rem] items-center gap-3 text-sm">
                <span className="text-xs font-bold text-muted">Week {w}</span>
                <span className="truncate">vs <b>{ctx.teams.find((t) => t.rosterId === opp)?.name ?? "—"}</b> <span className="text-xs text-muted">(power #{power.find((p) => p.rosterId === opp)?.rank ?? "—"})</span></span>
                {wp !== null ? <span className="flex items-center gap-2"><WinBar pct={wp} className="h-2" /><span className="num w-9 text-right text-xs font-bold">{wp.toFixed(0)}%</span></span> : <span />}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title={`Fantasy playoff schedule · weeks ${ctx.playoffStart}–${ctx.lastWeek}`} right={<span className="text-[11px] text-muted">opponent difficulty for your starters</span>}>
        <ul className="flex flex-col gap-1.5 text-sm">
          {outlook.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2">
              <span className="truncate"><PlayerLink id={o.id} name={o.name} /> <span className="text-xs text-muted">{o.pos}</span></span>
              <span className={cx("num text-xs font-bold", o.f >= 1.05 ? "text-pos" : o.f <= 0.95 ? "text-neg" : "text-muted")}>{o.f >= 1.05 ? "Easy" : o.f <= 0.95 ? "Tough" : "Neutral"} {signed((o.f - 1) * 100, 0)}%</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Dynasty: value-weighted age by position for your top assets. */
function AgeProfile({ ctx, rosterId }: { ctx: Ctx; rosterId: number }) {
  const t = ctx.teams.find((x) => x.rosterId === rosterId)!;
  const rows = ["QB", "RB", "WR", "TE"].map((pos) => {
    const ps = t.players.map((id) => ctx.players.get(id)).filter((p) => p && p.pos === pos && p.age) as NonNullable<ReturnType<typeof ctx.players.get>>[];
    const vals = ps.map((p) => ({ p, v: ctx.values.get(p.id)?.dynasty ?? 0 })).sort((a, b) => b.v - a.v).slice(0, 3);
    const tv = vals.reduce((a, x) => a + x.v, 0) || 1;
    const age = vals.reduce((a, x) => a + (x.p.age ?? 0) * x.v, 0) / tv;
    return { pos, age, value: vals.reduce((a, x) => a + x.v, 0), top: vals[0]?.p.name };
  });
  const peak: Record<string, [number, number]> = { QB: [27, 33], RB: [22, 26], WR: [24, 28], TE: [25, 29] };
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const [lo, hi] = peak[r.pos];
        const tone = !r.age ? "text-muted" : r.age > hi + 1 ? "text-neg" : r.age < lo ? "text-acc-ink" : "text-pos";
        return (
          <div key={r.pos} className="grid grid-cols-[2.5rem_1fr_7rem] items-center gap-3 text-sm">
            <b>{r.pos}</b>
            <div className="relative h-2 rounded-full bg-panel2">
              <div className="absolute inset-y-0 rounded-full bg-pos/30" style={{ left: `${((lo - 20) / 16) * 100}%`, width: `${((hi - lo) / 16) * 100}%` }} title="Peak age window" />
              {r.age > 0 && <div className="absolute -top-1 h-4 w-1.5 rounded bg-acc" style={{ left: `${Math.min(100, Math.max(0, ((r.age - 20) / 16) * 100))}%` }} />}
            </div>
            <span className={cx("num text-right text-xs font-semibold", tone)}>{r.age ? `avg age ${r.age.toFixed(1)}` : "—"}</span>
          </div>
        );
      })}
      <Info className="">Value-weighted age of your top 3 at each position. The green band is the position&apos;s peak-production age window.</Info>
    </div>
  );
}
