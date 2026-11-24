"use client";

/** Your lineup for a week: the interactive lineup tool used on the Matchup screen. */
import { useMemo } from "react";
import type { LeagueContext, TeamInfo } from "@/lib/services/league";
import { lineupSwaps, projectionFor, weekKind, type TeamWeek } from "@/lib/services/views";
import { canFill } from "@/lib/engine/positions";
import { optimizeLineup } from "@/lib/engine/lineup";
import { LineupLab, type LabPlayer } from "./LineupLab";
import { useShsAiMap } from "./ShsAiParts";

export function MyLineup({ ctx, me, week, onTotal, opponent }: { ctx: LeagueContext; me: TeamInfo; week: number; onTotal?: (t: number) => void; opponent?: TeamWeek | null }) {
  const ai = useShsAiMap(ctx, "week");
  const thisWeek = week === Math.min(ctx.currentWeek, ctx.lastWeek);
  const data = useMemo(() => {
    const kind = weekKind(ctx, week);
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
        id: pid, name: p.name, pos: p.pos, team: p.team, injury: p.injury, ai: thisWeek ? ai.get(pid)?.pct ?? null : null,
        eligible: slots.map((s) => canFill(s, p.positions)),
        unavailable: me.reserve.includes(pid) ? "IR slot" : me.taxi.includes(pid) ? "Taxi" : null,
        locked: kind === "current" && lu.locked.includes(pid), median: pw.median, low: pw.low, high: pw.high, base: pr.base, seasonAvg: pr.seasonAvg, last4: pr.last4Avg,
        games: pr.games, confidence: pr.confidence, opp, onBye: !!p.team && ctx.nflOpponents.has(p.team) && !opp,
        matchup: kind === "current" ? pr.matchupFactor : 1, usage: pr.usageFactor, notes: kind === "current" ? pr.notes : pr.notes.filter((n) => !n.includes("this week") && !n.includes("matchup")),
        snapL3: snaps.length ? snaps.map((x) => Math.round(x * 100)) : null, recent: log.slice(-4).map((g) => ({ week: g.week, pts: g.pts })),
          actual: kind === "current" ? ctx.matchupsByWeek[week - 1]?.find((m) => m.roster_id === me.rosterId)?.players_points[pid] ?? null : null,
      };
    });
    let current = lu.current.map((s) => s.playerId);
    let optimal = lu.optimal.map((s) => s.playerId);
    let swaps = lineupSwaps(ctx, me.rosterId);
    if (kind === "future") {
      // Future weeks assume every team starts its best lineup for that week.
      const usable = players.filter((p) => !p.unavailable);
      optimal = optimizeLineup(ctx.league.roster_positions, usable.map((p) => ({ id: p.id, positions: ctx.players.get(p.id)!.positions, points: p.median })), current).map((s) => s.playerId);
      current = [...optimal];
      swaps = [];
    }

    return { slots, players, current, optimal, swaps };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, me, week, ai, thisWeek]);
  return (
    <LineupLab key={`${week}:${me.rosterId}`} {...data} rosterSlots={ctx.league.roster_positions.filter((s) => s !== "BN").join(" · ")} week={week} onTotal={onTotal} opponent={opponent} myName={me.name} live={weekKind(ctx, week) === "current"} />
  );
}
