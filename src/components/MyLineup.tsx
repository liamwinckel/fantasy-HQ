"use client";

/** Your lineup for a week: the interactive lineup tool used on the Matchup screen. */
import { useMemo } from "react";
import type { LeagueContext, TeamInfo } from "@/lib/services/league";
import { lineupSwaps, projectionFor, teamWeekBest, weekKind, type TeamWeek } from "@/lib/services/views";
import { canFill } from "@/lib/engine/positions";
import { optimizeLineup } from "@/lib/engine/lineup";
import { LineupLab, type LabPlayer } from "./LineupLab";
import { MatchupSim } from "./MatchupSim";
import { playerDist } from "@/lib/engine/ranges";

export function MyLineup({ ctx, me, week, onTotal, opponent }: { ctx: LeagueContext; me: TeamInfo; week: number; onTotal?: (t: number) => void; opponent?: TeamWeek | null }) {
  const data = useMemo(() => {
    const kind = weekKind(ctx, week);
    const lu = ctx.lineups.get(me.rosterId)!;
    const slots = lu.current.map((s) => s.slot);
    const proj = (pid: string) => projectionFor(ctx, pid, week);
    const players: LabPlayer[] = me.players.filter((pid) => ctx.players.has(pid)).map((pid) => {
      const p = ctx.players.get(pid)!;
      const pr = ctx.projections.get(pid)!;
      const pw = proj(pid);
      const dist = playerDist(ctx, pid, week);
      const log = ctx.logs.get(pid) ?? [];
      const snaps = log.slice(-3).map((g) => g.snapPct).filter((x): x is number => x !== null);
      const opp = p.team ? ctx.nflOpponents.get(p.team)?.get(week) ?? null : null;
      return {
        id: pid, name: p.name, pos: p.pos, team: p.team, injury: p.injury,
        eligible: slots.map((s) => canFill(s, p.positions)),
        unavailable: me.reserve.includes(pid) ? "IR slot" : me.taxi.includes(pid) ? "Taxi" : null,
        locked: kind === "current" && lu.locked.includes(pid), median: pw.median, low: dist.floor, high: dist.ceiling, boom: dist.boom, bust: dist.bust, base: pr.base, seasonAvg: pr.seasonAvg, last4: pr.last4Avg,
        games: pr.games, confidence: pr.confidence, opp, onBye: !!p.team && ctx.nflOpponents.has(p.team) && !opp,
        matchup: kind === "current" ? pr.matchupFactor : 1, usage: pr.usageFactor, notes: kind === "current" ? pr.notes : pr.notes.filter((n) => !n.includes("this week") && !n.includes("matchup")),
        snapL3: snaps.length ? snaps.map((x) => Math.round(x * 100)) : null, recent: log.slice(-4).map((g) => ({ week: g.week, pts: g.pts })),
          actual: kind === "current" ? ctx.matchupsByWeek[week - 1]?.find((m) => m.roster_id === me.rosterId)?.players_points[pid] ?? null : null,
      };
    });
    let current = lu.current.map((s) => s.playerId);
    // Optimal is always rebuilt from the same weekly projections shown on screen, keeping anyone whose game
    // has started where he is and leaving IR / taxi players out.
    const usable = players.filter((p) => !p.unavailable);
    const optimal = optimizeLineup(ctx.league.roster_positions,
      usable.map((p) => ({ id: p.id, positions: ctx.players.get(p.id)!.positions, points: p.median, locked: p.locked })), current).map((s) => s.playerId);
    let swaps = lineupSwaps(ctx, me.rosterId);
    if (kind === "future") {
      // Future weeks assume every team starts its best lineup for that week.
      current = [...optimal];
      swaps = [];
    }

    return { slots, players, current, optimal, swaps };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, me, week]);
  const oppBest = useMemo(() => (opponent && weekKind(ctx, week) === "current" ? teamWeekBest(ctx, opponent.rosterId, week) : null), [ctx, opponent, week]);
  return (
    <LineupLab key={`${week}:${me.rosterId}`} {...data} rosterSlots={ctx.league.roster_positions.filter((s) => s !== "BN").join(" · ")} week={week} onTotal={onTotal} opponent={opponent} opponentBest={oppBest} myName={me.name} live={weekKind(ctx, week) === "current"}
      sim={opponent ? (l, apply, opp) => {
        const by = new Map(data.players.map((p) => [p.id, p]));
        return <MatchupSim ctx={ctx} week={week} slots={data.slots} lineup={l} opponent={opp ?? opponent} myName={me.name} onApply={apply}
          eligible={(id, i) => !!by.get(id)?.eligible[i] && !by.get(id)?.unavailable} locked={(id) => !!by.get(id)?.locked} actual={(id) => by.get(id)?.actual ?? null} />;
      } : undefined} />
  );
}
