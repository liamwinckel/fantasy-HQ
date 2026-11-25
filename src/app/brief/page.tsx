"use client";

/** Weekly brief: last week's recap (including how SHS AI, the experts and projections did) and this week's preview. */
import { useMemo } from "react";
import { LeaguePage, type LeagueData } from "@/components/AppData";
import { formatLabel } from "@/lib/services/portfolio";
import { gameView, lineupSwaps, teamWeek, weekGames } from "@/lib/services/views";
import { waiverReport } from "@/lib/services/waivers";
import { seasonSummary } from "@/lib/services/teamSeason";
import { ord } from "@/lib/engine/classify";
import { playerDist, simulateMatchup } from "@/lib/engine/ranges";
import { Card, InjuryChip, Notice, PageHeader, WinBar, cx, signed } from "@/components/ui";
import { PlayerLink } from "@/components/PlayerCard";
import { TeamLink } from "@/components/TeamPeek";
import { AiChip, useShsAiMap } from "@/components/ShsAiParts";
import { useBacktest, verdict } from "@/components/Backtest";
import type { Grade } from "@/lib/services/backtest";

export default function BriefPage() {
  return <LeaguePage>{(d) => <Brief {...d} />}</LeaguePage>;
}

function Line({ children }: { children: React.ReactNode }) {
  return <li className="flex gap-2 text-sm leading-relaxed"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-acc" />{<span className="min-w-0">{children}</span>}</li>;
}

function Brief({ league, ctx }: LeagueData) {
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  const ai = useShsAiMap(ctx, "week");
  const bt = useBacktest(ctx);
  const week = Math.min(ctx.currentWeek, ctx.lastWeek);
  const last = ctx.seasonOver ? ctx.lastWeek : ctx.currentWeek - 1;
  const g = me ? gameView(ctx, me.rosterId, week) : null;
  const sim = useMemo(() => {
    if (!me || !g?.b || ctx.seasonOver) return null;
    const side = (rid: number) => teamWeek(ctx, rid, week).starters.filter((s) => s.playerId).map((s) => { const d = playerDist(ctx, s.playerId!, week); return { id: s.playerId!, team: s.team, mean: d.mean, sd: d.sd }; });
    return simulateMatchup(side(me.rosterId), side(g.b.rosterId), 8000);
  }, [ctx, me, g?.b, week]);
  if (!me) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;

  const s = seasonSummary(ctx, me.rosterId);
  const lw = s.results.find((r) => r.week === last);
  const lastTeam = last >= 1 ? teamWeek(ctx, me.rosterId, last) : null;
  const top = lastTeam?.starters.filter((l) => l.playerId).sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0))[0];
  const flop = lastTeam?.starters.filter((l) => l.playerId && l.proj !== null).sort((a, b) => (a.actual ?? 0) - (b.actual ?? 0))[0];
  const benchBest = lastTeam?.bench.filter((l) => l.playerId).sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0))[0];
  const leftOnBench = lastTeam && lastTeam.bestPossible !== null && lastTeam.actual !== null ? Math.round((lastTeam.bestPossible - lastTeam.actual) * 10) / 10 : null;
  const lastGames = last >= 1 ? weekGames(ctx, last).map(({ a, b }) => {
    const ta = teamWeek(ctx, a, last), tb = b !== null ? teamWeek(ctx, b, last) : null;
    return { a: ta, b: tb, diff: tb ? Math.abs((ta.actual ?? 0) - (tb.actual ?? 0)) : 0 };
  }).filter((x) => x.b) : [];
  const high = [...ctx.teams].map((t) => ({ t, pts: ctx.matchupsByWeek[last - 1]?.find((m) => m.roster_id === t.rosterId)?.points ?? 0 })).sort((a, b) => b.pts - a.pts)[0];
  const closest = [...lastGames].sort((a, b) => a.diff - b.diff)[0];
  const blowout = [...lastGames].sort((a, b) => b.diff - a.diff)[0];
  const btw = bt.data?.weeks.find((w) => w.week === last);

  const mine = me.players.filter((id) => ai.get(id)?.pct !== null && ai.get(id)?.pct !== undefined);
  const up = [...mine].sort((a, b) => (ai.get(b)!.pct ?? 0) - (ai.get(a)!.pct ?? 0)).filter((id) => (ai.get(id)!.pct ?? 0) >= 5).slice(0, 3);
  const down = [...mine].sort((a, b) => (ai.get(a)!.pct ?? 0) - (ai.get(b)!.pct ?? 0)).filter((id) => (ai.get(id)!.pct ?? 0) <= -5).slice(0, 3);
  const swaps = ctx.seasonOver ? [] : lineupSwaps(ctx, me.rosterId).slice(0, 3);
  const adds = ctx.seasonOver ? [] : waiverReport(ctx, me.rosterId).topAdds.slice(0, 3);
  const hurt = me.players.map((id) => ctx.players.get(id)).filter((p) => p?.injury && p.injury !== "IR") as NonNullable<ReturnType<typeof ctx.players.get>>[];
  const name = (id: string) => ctx.players.get(id)?.name ?? id;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)}`} title="Weekly Brief" />
      <p className="-mt-3 text-center text-xs text-muted">{last >= 1 ? `Week ${last} recap` : ""}{last >= 1 && !ctx.seasonOver ? " · " : ""}{!ctx.seasonOver ? `Week ${week} preview` : ""}</p>

      {lw && (
        <Card title={`Week ${last} recap`}>
          <div className={cx("mb-4 rounded-xl p-4 text-center", lw.won ? "bg-pos/10" : lw.won === false ? "bg-neg/10" : "bg-panel2")}>
            <div className={cx("text-xs font-bold uppercase tracking-widest", lw.won ? "text-pos" : lw.won === false ? "text-neg" : "text-muted")}>{lw.won ? "Win" : lw.won === false ? "Loss" : "Result"}</div>
            <div className="num mt-1 font-[family-name:var(--font-display)] text-4xl font-bold">{lw.pts.toFixed(1)}{lw.opp && <span className="text-muted"> – {lw.opp.pts.toFixed(1)}</span>}</div>
            {lw.opp && <div className="mt-1 text-xs text-muted">vs {lw.opp.name} · {ord(lw.rank)} highest score of {ctx.teamsCount} · {lw.allPlayW}–{lw.allPlayL} against the whole league</div>}
          </div>
          <ul className="flex flex-col gap-2">
            {top?.playerId && <Line><b>Best performer:</b> <PlayerLink id={top.playerId} name={top.name} /> with {top.actual?.toFixed(1)} pts.</Line>}
            {flop?.playerId && flop.playerId !== top?.playerId && <Line><b>Let you down:</b> <PlayerLink id={flop.playerId} name={flop.name} /> scored {flop.actual?.toFixed(1)}.</Line>}
            {leftOnBench !== null && <Line>{leftOnBench > 0.5 ? <>Best possible lineup would have scored <b>{signed(leftOnBench)}</b> more{benchBest?.playerId ? <> (<PlayerLink id={benchBest.playerId} name={benchBest.name} /> had {benchBest.actual?.toFixed(1)} on your bench)</> : null}.</> : <>You started your best possible lineup.</>}</Line>}
            {high && <Line><b>Top score in the league:</b> {high.t.rosterId === me.rosterId ? "you" : high.t.name}, {high.pts.toFixed(1)}.</Line>}
            {closest?.b && <Line><b>Closest game:</b> {closest.a.name} {closest.a.actual?.toFixed(1)} – {closest.b.actual?.toFixed(1)} {closest.b.name}.</Line>}
            {blowout?.b && blowout !== closest && <Line><b>Biggest blowout:</b> {blowout.a.name} {blowout.a.actual?.toFixed(1)} – {blowout.b.actual?.toFixed(1)} {blowout.b.name}.</Line>}
            <Line><b>Season:</b> {me.wins}–{me.losses}, {ord(me.rank)} place, {(ctx.sim.playoffOdds[me.rosterId] ?? 0).toFixed(0)}% playoff odds. {Math.abs(s.luck) >= 1 ? (s.luck > 0 ? `You've won ${s.luck.toFixed(1)} more games than your scoring suggests.` : `You've won ${Math.abs(s.luck).toFixed(1)} fewer games than your scoring deserves.`) : ""}</Line>
          </ul>
        </Card>
      )}

      {last >= 1 && (
        <Card title={`How the models did · week ${last}`} info={<>Every player ranked at QB, RB, WR and TE who played. <b>Picks right</b> = for every pair at a position, how often the ranking had the higher scorer first. <b>Avg miss</b> = average points off per player. SHS AI here is the replay with only pre-kickoff information (no betting lines or weather, which have no history).</>}>
          {bt.loading && <p className="text-sm text-muted">Grading week {last}…</p>}
          {!bt.loading && !btw && <p className="text-sm text-muted">No expert rankings saved for week {last} yet, so it can&apos;t be graded.</p>}
          {btw && (
            <div className="flex flex-col gap-3">
              <ModelRow label="SHS AI" g={btw.shs} best={best(btw)} />
              <ModelRow label="Experts (ECR)" g={btw.ecr} best={best(btw)} />
              <ModelRow label="Sleeper projection" g={btw.sleeper} best={best(btw)} />
              <p className="text-xs text-muted">{verdict(btw.shs, btw.ecr)} Season to date, close calls: SHS AI {bt.data!.total.shs.near.toFixed(1)}% · experts {bt.data!.total.ecr.near.toFixed(1)}% · Sleeper {bt.data!.total.sleeper.near.toFixed(1)}%.</p>
              {btw.biggestCalls.length > 0 && (
                <div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted">SHS AI&apos;s biggest disagreements with the experts</div>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {btw.biggestCalls.slice(0, 5).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate"><PlayerLink id={c.id} name={name(c.id)} /></span>
                        <span className="shrink-0 text-xs text-muted">{c.pct > 0 ? "higher" : "lower"} ({c.pct > 0 ? "+" : ""}{c.pct}%) · ranked #{c.ecrPos}, finished #{c.actualPosRank}</span>
                        <span className={cx("shrink-0 text-xs font-bold", c.right ? "text-pos" : "text-neg")}>{c.right ? "✓" : "✗"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {!ctx.seasonOver && g && (
        <Card title={`Week ${week} preview`} href="/matchup/">
          {g.b && sim && (
            <div className="mb-4">
              <div className="flex items-center justify-between gap-2 text-sm"><span>vs <TeamLink rosterId={g.b.rosterId} name={g.b.name} /></span><b className={cx("num text-lg", sim.winProb >= 50 ? "text-pos" : "text-neg")}>{sim.winProb.toFixed(0)}% to win</b></div>
              <div className="mt-2"><WinBar pct={sim.winProb} /></div>
              <p className="mt-1.5 text-xs text-muted">Projected {sim.mine.p50.toFixed(1)} – {sim.opp.p50.toFixed(1)} · your range {sim.mine.p10.toFixed(0)}–{sim.mine.p90.toFixed(0)} (10,000 simulations)</p>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {swaps.map((x, i) => <Line key={i}><b>Lineup:</b> start <PlayerLink id={x.inId} name={x.inName} />{x.slot ? ` at ${x.slot}` : ""}{x.outId ? `, bench ${x.outName}` : ""} ({signed(x.gain)} pts).</Line>)}
            {up.length > 0 && <Line><b>SHS AI likes more than the experts:</b> {up.map((id, i) => <span key={id}>{i ? ", " : ""}<PlayerLink id={id} name={name(id)} /> <AiChip v={ai.get(id)!.pct} ai={ai.get(id)} name={name(id)} /></span>)}</Line>}
            {down.length > 0 && <Line><b>SHS AI is cooler on:</b> {down.map((id, i) => <span key={id}>{i ? ", " : ""}<PlayerLink id={id} name={name(id)} /> <AiChip v={ai.get(id)!.pct} ai={ai.get(id)} name={name(id)} /></span>)}</Line>}
            {hurt.length > 0 && <Line><b>Injuries:</b> {hurt.map((p, i) => <span key={p.id}>{i ? ", " : ""}<PlayerLink id={p.id} name={p.name} /> <InjuryChip status={p.injury} /></span>)}</Line>}
            {adds.length > 0 && <Line><b>Waiver targets:</b> {adds.map((w, i) => <span key={w.player.id}>{i ? ", " : ""}<PlayerLink id={w.player.id} name={w.player.name} /></span>)}</Line>}
            {!swaps.length && <Line>Your lineup matches the best projected lineup.</Line>}
          </ul>
        </Card>
      )}
    </div>
  );
}

const best = (w: { shs: Grade; ecr: Grade; sleeper: Grade }) => Math.max(w.shs.near, w.ecr.near, w.sleeper.near);
function ModelRow({ label, g, best }: { label: string; g: Grade; best: number }) {
  const top = g.near === best;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 text-sm">
      <span className={cx("truncate", top && "font-bold")}>{label}{top && <span className="ml-1.5 rounded bg-pos/15 px-1.5 py-0.5 text-[10px] font-bold text-pos">best</span>}</span>
      <span className="num text-right"><b className={top ? "text-pos" : ""}>{g.near.toFixed(1)}%</b><span className="block text-[10px] text-muted">close calls</span></span>
      <span className="num text-right"><b>±{g.mae.toFixed(1)}</b><span className="block text-[10px] text-muted">avg miss</span></span>
    </div>
  );
}
