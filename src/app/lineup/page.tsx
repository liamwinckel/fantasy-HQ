"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import type { LeagueContext } from "@/lib/services/league";
import Link from "next/link";
import { parseWeek } from "@/lib/services/selected";
import { formatLabel } from "@/lib/services/portfolio";
import { lineupSwaps, projectionFor, teamWeek, weekKind } from "@/lib/services/views";
import { canFill } from "@/lib/engine/positions";
import { optimizeLineup } from "@/lib/engine/lineup";
import { Card, Notice, PageHeader, Tag, cx } from "@/components/ui";
import { PlayerImg, WeekNav } from "@/components/client";
import { LineupLab, type LabPlayer } from "./LineupLab";

export default function LineupPage() {
  return <LeaguePage>{(d) => <LineupPageBody {...d} />}</LeaguePage>;
}

function LineupPageBody({ setup, league, ctx, sp }: LeagueData) {
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  if (!me) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;

  const week = parseWeek(sp.week, ctx);
  const kind = weekKind(ctx, week);
  const label = kind === "past" ? "Review · final" : kind === "current" ? "This week" : "Plan ahead · projected";
  const header = (
    <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Lineup Optimizer">
      <WeekNav week={week} current={Math.min(ctx.currentWeek, ctx.lastWeek)} last={ctx.lastWeek} label={label} />
    </PageHeader>
  );

  if (kind === "past") return <div className="flex flex-col gap-5">{header}<Review ctx={ctx} rosterId={me.rosterId} week={week} /></div>;

  const lu = ctx.lineups.get(me.rosterId)!;
  const slots = lu.current.map((s) => s.slot);
  const proj = (pid: string) => projectionFor(ctx, pid, week);
  const players: LabPlayer[] = me.players.filter((pid) => ctx.players.has(pid)).map((pid) => {
    const p = ctx.players.get(pid)!;
    const pr = ctx.projections.get(pid)!;
    const pw = proj(pid);
    const log = ctx.logs.get(pid) ?? [];
    const snaps = log.slice(-3).map((g) => g.snapPct).filter((x): x is number => x !== null);
    const opp = p.team ? ctx.nflOpponents.get(p.team)?.get(week) ?? null : null;
    return {
      id: pid, name: p.name, pos: p.pos, team: p.team, injury: p.injury,
      eligible: slots.map((s) => canFill(s, p.positions)),
      unavailable: me.reserve.includes(pid) ? "IR slot" : me.taxi.includes(pid) ? "Taxi" : null,
      locked: kind === "current" && lu.locked.includes(pid), median: pw.median, low: pw.low, high: pw.high, base: pr.base, seasonAvg: pr.seasonAvg, last4: pr.last4Avg,
      games: pr.games, confidence: pr.confidence, opp, onBye: !!p.team && ctx.nflOpponents.has(p.team) && !opp,
      matchup: kind === "current" ? pr.matchupFactor : 1, usage: pr.usageFactor, notes: kind === "current" ? pr.notes : pr.notes.filter((n) => !n.includes("this week") && !n.includes("matchup")),
      snapL3: snaps.length ? snaps.map((x) => Math.round(x * 100)) : null, recent: log.slice(-4).map((g) => ({ week: g.week, pts: g.pts })),
    };
  });
  let current = lu.current.map((s) => s.playerId);
  let optimal = lu.optimal.map((s) => s.playerId);
  let swaps = lineupSwaps(ctx, me.rosterId);
  if (kind === "future") {
    const usable = players.filter((p) => !p.unavailable);
    optimal = optimizeLineup(ctx.league.roster_positions, usable.map((p) => ({ id: p.id, positions: ctx.players.get(p.id)!.positions, points: p.median })), current).map((s) => s.playerId);
    // Compare with today's lineup carried forward
    const byId = new Map(players.map((p) => [p.id, p]));
    const inIds = optimal.filter((id) => id && !current.includes(id)) as string[];
    const outIds = current.filter((id) => id && !optimal.includes(id)) as string[];
    swaps = inIds.map((id, i) => {
      const o = outIds[i] ? byId.get(outIds[i]) : undefined;
      const reason = o?.onBye ? `${o.name} is on bye in Week ${week}` : o?.injury ? `${o.name} is ${o.injury}` : "Higher projection that week";
      return { inId: id, inName: byId.get(id)!.name, outId: o?.id ?? null, outName: o?.name ?? "Empty slot", gain: Math.round(((byId.get(id)?.median ?? 0) - (o?.median ?? 0)) * 10) / 10, reason };
    }).filter((s) => s.gain > 0.2);
    current = [...current];
  }

  return (
    <div className="flex flex-col gap-5">
      {header}
      {ctx.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      {kind === "future" && <Notice>Planning Week {week}: &quot;Current&quot; is your lineup as it&apos;s set today. Projections apply that week&apos;s byes and multi-week injuries.</Notice>}
      <LineupLab
        key={week}
        slots={slots}
        players={players}
        current={current}
        optimal={optimal}
        swaps={swaps}
        rosterSlots={ctx.league.roster_positions.filter((s) => s !== "BN").join(" · ")}
        week={week}
      />
    </div>
  );
}

/** Past week: what you started, what you scored, and what the best possible lineup would have scored. */
function Review({ ctx, rosterId, week }: { ctx: LeagueContext; rosterId: number; week: number }) {
  const t = teamWeek(ctx, rosterId, week);
  const m = ctx.matchupsByWeek[week - 1]?.find((x) => x.roster_id === rosterId);
  if (!m) return <Notice>No matchup data for Week {week}.</Notice>;
  const best = optimizeLineup(ctx.league.roster_positions, m.players.filter((pid) => ctx.players.has(pid)).map((pid) => ({ id: pid, positions: ctx.players.get(pid)!.positions, points: m.players_points[pid] ?? 0 })), m.starters);
  const startedSet = new Set(m.starters);
  const missed = best.filter((s) => s.playerId && !startedSet.has(s.playerId));
  const left = (t.bestPossible ?? 0) - (t.actual ?? 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-panel p-4"><div className="text-xs text-muted">You scored</div><div className="num font-[family-name:var(--font-display)] text-4xl font-bold">{(t.actual ?? 0).toFixed(1)}</div></div>
        <div className="rounded-xl border border-line bg-panel p-4"><div className="text-xs text-muted">Best possible lineup</div><div className="num font-[family-name:var(--font-display)] text-4xl font-bold">{(t.bestPossible ?? 0).toFixed(1)}</div></div>
        <div className={cx("rounded-xl p-4", left > 10 ? "bg-acc-soft" : "border border-line bg-panel")}><div className="text-xs text-muted">Points left on bench</div><div className="num font-[family-name:var(--font-display)] text-4xl font-bold">{left.toFixed(1)}</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Your starters" right={<Tag kind="ACTUAL" />} pad={false}>
          <div className="grid grid-cols-[3.5rem_1fr_4.5rem] gap-x-3 border-b border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span>Slot</span><span>Player</span><span className="text-right">Points</span>
          </div>
          {t.starters.map((l, i) => {
            const better = best[i] && best[i].playerId !== l.playerId && !startedSet.has(best[i].playerId ?? "");
            return (
              <div key={i} className="grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-x-3 border-b border-line px-5 py-2.5 last:border-0">
                <span className="rounded bg-panel2 py-1 text-center text-[11px] font-extrabold">{l.slot.replace("SUPER_FLEX", "SFLX").replace("IDP_FLEX", "IDP")}</span>
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">{l.playerId && <PlayerImg id={l.playerId} name={l.name} pos={l.pos} size={28} />}<span className="truncate">{l.name}</span>{l.note && <span className="text-xs text-warn">{l.note}</span>}{better && <span className="text-xs text-muted">(best: {ctx.players.get(best[i].playerId!)?.name})</span>}</span>
                <span className="num text-right font-bold">{(l.actual ?? 0).toFixed(1)}</span>
              </div>
            );
          })}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Missed starts">
            {missed.length === 0 ? <p className="text-sm text-muted">You started the best possible lineup. Nice.</p> : (
              <ul className="flex flex-col gap-2 text-sm">{missed.map((s) => <li key={s.playerId!}><b>{ctx.players.get(s.playerId!)?.name}</b> scored {s.points.toFixed(1)} on your bench</li>)}</ul>
            )}
            <p className="mt-3 text-xs text-muted">&quot;Best possible&quot; uses hindsight: the highest-scoring legal lineup from your roster that week.</p>
          </Card>
          <Card title="Bench" pad={false}>
            <div className="flex justify-between border-b border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted"><span>Player</span><span>Points</span></div>
            {t.bench.map((l) => (
              <div key={l.playerId} className="flex justify-between border-b border-line px-5 py-2 text-sm last:border-0"><span>{l.name} <span className="text-muted">{l.pos}</span></span><span className="num">{(l.actual ?? 0).toFixed(1)}</span></div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
