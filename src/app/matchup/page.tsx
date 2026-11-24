"use client";

import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { WeekSwipe } from "@/components/WeekSwipe";
import { useState } from "react";
import { MyLineup } from "@/components/MyLineup";
import { TeamLink } from "@/components/TeamPeek";
import { PlayerImg } from "@/components/client";
import Link from "next/link";
import { parseWeek } from "@/lib/services/selected";
import { formatLabel } from "@/lib/services/portfolio";
import { gameView, teamWeek, weekGames, weekKind, type TeamWeek } from "@/lib/services/views";
import { winProbability } from "@/lib/engine/simulate";
import { powerRankings } from "@/lib/engine/power";
import { InjuryChip, NflLogo, Bar, Card, Logo, Notice, PageHeader, Tag, cx, Info, WinBar } from "@/components/ui";
import { WeekNav } from "@/components/client";
import { MatchupBoard } from "@/components/matchup";
import { PlayerLink } from "@/components/PlayerCard";

const groupOf = (pos: string) => (["DL", "LB", "DB"].includes(pos) ? "IDP" : pos);

export default function MatchupPage() {
  return <LeaguePage>{(d) => <MatchupPageBody {...d} />}</LeaguePage>;
}

function MatchupPageBody({ setup, league, ctx, sp }: LeagueData) {
  const week = parseWeek(sp.week, ctx);
  const kind = weekKind(ctx, week);
  const focus = Number(sp.team) && ctx.teams.some((t) => t.rosterId === Number(sp.team)) ? Number(sp.team) : ctx.myRosterId ?? ctx.teams[0].rosterId;
  const g = gameView(ctx, focus, week);
  const started = kind === "current" && ctx.matchupsThisWeek.some((m) => m.points > 0);
  const label = kind === "past" ? "Final" : started ? "Live" : kind === "current" ? "This week · projected" : week >= ctx.playoffStart ? "Playoffs · projected" : "Projected";
  const power = powerRankings(ctx);
  const rankOf = (rid: number) => power.find((p) => p.rosterId === rid)?.rank;
  const name = (rid: number | null) => (rid === null ? "—" : ctx.teams.find((t) => t.rosterId === rid)?.name ?? "—");
  const av = (rid: number | null) => (rid === null ? null : ctx.teams.find((t) => t.rosterId === rid)?.avatar ?? null);
  const games = weekGames(ctx, week);
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  const myGame = !!me && g.a.rosterId === me.rosterId && kind !== "past";
  const [myTotal, setMyTotal] = useState<number | null>(null);
  const { set } = useQuery();
  const oppStrength = g.b ? (kind === "current" ? ctx.liveScore.get(g.b.rosterId)?.projected : ctx.weekStrength.get(g.b.rosterId)?.get(week)) ?? null : null;
  const myStrength = kind === "current" ? ctx.liveScore.get(g.a.rosterId)?.projected ?? null : ctx.weekStrength.get(g.a.rosterId)?.get(week) ?? null;

  // Head-to-head by position: points (actual for past weeks, projected otherwise)
  const byPos = (t: TeamWeek | null) => {
    const m: Record<string, number> = {};
    for (const l of t?.starters ?? []) {
      if (!l.playerId) continue;
      const v = kind === "past" ? l.actual ?? 0 : l.proj ?? 0;
      const gpos = groupOf(l.pos);
      m[gpos] = (m[gpos] ?? 0) + v;
    }
    return m;
  };
  const pa = byPos(g.a);
  const pb = byPos(g.b);
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF", "IDP"].filter((p) => pa[p] || pb[p]);
  // Swing players: widest projected range among both lineups (upcoming weeks)
  const swing = kind === "past" ? [] : [...(g.a.starters ?? []), ...(g.b?.starters ?? [])]
    .filter((l) => l.playerId && l.high !== null && l.low !== null)
    .map((l) => ({ ...l, spread: (l.high ?? 0) - (l.low ?? 0), team: g.a.starters.includes(l) ? g.a.name : g.b?.name }))
    .sort((x, y) => y.spread - x.spread).slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Matchup">
        <WeekNav week={week} current={Math.min(ctx.currentWeek, ctx.lastWeek)} last={ctx.lastWeek} label={label} />
      </PageHeader>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Games this week">
        {games.map(({ a, b }) => {
          const on = a === focus || b === focus;
          return (
            <Link key={a} href={`/matchup/?week=${week}&team=${a}`} className={cx("shrink-0 rounded-xl border px-3 py-2 text-xs transition-colors", on ? "border-acc bg-acc-soft" : "border-line bg-panel hover:bg-panel2")}>
              <div className={cx("flex items-center gap-1.5 font-semibold", a === ctx.myRosterId && "text-acc-ink")}><Logo src={av(a)} name={name(a)} size={18} />{name(a)}</div>
              <div className={cx("mt-1 flex items-center gap-1.5 text-muted", b === ctx.myRosterId && "font-semibold text-acc-ink")}><Logo src={av(b)} name={name(b)} size={18} />vs {name(b)}</div>
            </Link>
          );
        })}
      </div>

      <WeekSwipe week={week} min={1} max={ctx.lastWeek} onWeek={(w) => set({ week: String(w) }, true)}>
      <p className="-mb-2 text-center text-[11px] text-muted md:hidden">Swipe left or right to change week</p>
      <Preview g={g} kind={kind} started={started} myTotal={myGame ? myTotal : null} oppStrength={oppStrength} myStrength={myStrength} rank={rankOf} />
      {!g.b && kind !== "past" && week >= ctx.playoffStart && ctx.sim.playoffOpp?.[week] && <PlayoffEstimate ctx={ctx} rid={focus} week={week} />}

      {myGame && me && <MyLineup ctx={ctx} me={me} week={week} onTotal={setMyTotal} opponent={g.b} />}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {!myGame && <Card title="Lineups" pad={false} className="xl:flex-[3]"><MatchupBoard g={g} /></Card>}
        <div className="flex min-w-0 flex-col gap-4 xl:flex-[2]">
          <Card title="Head to head by position" right={<span className="text-[11px] text-muted">{kind === "past" ? "actual pts" : "projected pts"}</span>}>
            <div className="flex flex-col gap-3">
              {positions.map((pos) => {
                const a = pa[pos] ?? 0, b = pb[pos] ?? 0;
                const tot = Math.max(1, a + b);
                return (
                  <div key={pos}>
                    <div className="mb-1 flex justify-between text-xs"><span className={cx("num", a >= b ? "font-bold text-fg" : "text-muted")}>{a.toFixed(1)}</span><span className="font-bold text-muted">{pos}</span><span className={cx("num", b > a ? "font-bold text-fg" : "text-muted")}>{b.toFixed(1)}</span></div>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-panel2">
                      <div className="h-full bg-acc transition-[width] duration-500" style={{ width: `${(100 * a) / tot}%` }} />
                      <div className="h-full bg-fg/70 transition-[width] duration-500" style={{ width: `${(100 * b) / tot}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between text-[11px] text-muted"><span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-acc" />{g.a.name}</span><span className="flex items-center gap-1.5">{g.b?.name}<span className="h-2 w-3 rounded bg-fg/70" /></span></div>
            </div>
          </Card>
          {swing.length > 0 && (
            <Card title="Swing players" right={<span className="text-[11px] text-muted">widest range</span>}>
              <ul className="flex flex-col gap-2.5 text-sm">
                {swing.map((l) => (
                  <li key={l.playerId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0"><PlayerLink id={l.playerId!} name={l.name} className="font-semibold" /><div className="flex items-center gap-1 truncate text-xs text-muted"><NflLogo team={l.team} size={13} />{l.team} · {l.pos}</div></div>
                    <span className="num shrink-0 text-xs text-muted">{l.low?.toFixed(1)} – <b className="text-fg">{l.proj?.toFixed(1)}</b> – {l.high?.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
              <Info className="mt-3">These players have the biggest gap between a bad week and a good week, so they&apos;re most likely to decide the result.</Info>
            </Card>
          )}
        </div>
      </div>

      <Card title={`Week ${week} scoreboard`} pad={false}>
        <ul className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0">
          {games.map(({ a, b }) => {
            const ta = teamWeek(ctx, a, week);
            const tb = b !== null ? teamWeek(ctx, b, week) : null;
            const useProj = kind === "future" || (kind === "current" && !started);
            const sa = useProj ? ta.projected : ta.actual;
            const sb = tb ? (useProj ? tb.projected : tb.actual) : null;
            const wa = kind === "current" ? ctx.liveScore.get(a)?.projected : ctx.weekStrength.get(a)?.get(week);
            const wb = b === null ? undefined : kind === "current" ? ctx.liveScore.get(b)?.projected : ctx.weekStrength.get(b)?.get(week);
            const wp = kind !== "past" && wa && wb ? winProbability(wa, wb) : null;
            return (
              <li key={a} className={cx("border-line md:border-b md:odd:border-r", (a === focus || b === focus) && "bg-acc-soft")}>
                <Link href={`/matchup/?week=${week}&team=${a}`} className="flex items-center gap-3 px-5 py-3 hover:bg-panel2">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex justify-between gap-2"><span className={cx("flex min-w-0 items-center gap-1.5", sa !== null && sb !== null && sa > sb && "font-bold")}><Logo src={av(a)} name={name(a)} size={18} /><span className="truncate">{name(a)}</span></span><span className="num">{sa?.toFixed(1) ?? "—"}</span></div>
                    <div className="flex justify-between gap-2"><span className={cx("flex min-w-0 items-center gap-1.5", sa !== null && sb !== null && sb > sa && "font-bold")}><Logo src={av(b)} name={name(b)} size={18} /><span className="truncate">{name(b)}</span></span><span className="num">{sb?.toFixed(1) ?? "—"}</span></div>
                  </div>
                  {wp !== null && <div className="w-20 text-right text-[11px] text-muted" title="Win chance: left team / right team"><WinBar pct={wp} className="h-2" />{wp.toFixed(0)}% / {(100 - wp).toFixed(0)}%<div className="text-[9px]">win chance</div></div>}
                </Link>
              </li>
            );
          })}
          {games.length === 0 && (ctx.sim.playoffPairs?.[week]?.length ? (
            <li className="px-5 py-3 md:col-span-2">
              <div className="mb-2 flex items-center gap-2 text-xs"><span className="rounded border border-dashed border-acc-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-acc-ink">Estimate</span><span className="text-muted">Most likely matchups, from {ctx.sim.runs.toLocaleString()} simulated seasons</span></div>
              <ul className="flex flex-col gap-1.5">
                {ctx.sim.playoffPairs[week].slice(0, 6).map((pr) => (
                  <li key={`${pr.a}-${pr.b}`} className={cx("flex items-center gap-2 text-sm", (pr.a === ctx.myRosterId || pr.b === ctx.myRosterId) && "font-semibold text-acc-ink")}>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5"><Logo src={av(pr.a)} name={name(pr.a)} size={18} /><span className="truncate">{name(pr.a)}</span><span className="text-muted">vs</span><Logo src={av(pr.b)} name={name(pr.b)} size={18} /><span className="truncate">{name(pr.b)}</span></span>
                    <span className="num shrink-0 text-xs text-muted">{pr.pct.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">Real matchups appear once the bracket is set.</p>
            </li>
          ) : <li className="px-5 py-4 text-sm text-muted">Playoff matchups are set by the bracket. Check back once seeds are final.</li>)}
        </ul>
      </Card>
      </WeekSwipe>
    </div>
  );
}

/** Score preview: both teams, scores and win chance. On your own game the score follows your lineup edits. */
function Preview({ g, kind, started, myTotal, oppStrength, myStrength, rank }: {
  g: ReturnType<typeof gameView>; kind: string; started: boolean; myTotal: number | null;
  oppStrength: { mean: number; sd: number } | null; myStrength: { mean: number; sd: number } | null; rank: (rid: number) => number | undefined;
}) {
  const live = kind === "past" || started;
  const aScore = live ? g.a.actual : myTotal ?? g.a.projected;
  const bScore = g.b ? (live ? g.b.actual : g.b.projected) : null;
  const wp = kind === "past" ? null : myTotal !== null && !started && myStrength && oppStrength
    ? winProbability({ mean: myTotal, sd: myStrength.sd }, oppStrength)
    : g.winProbA;
  const head = (t: typeof g.a | null, score: number | null, right: boolean) => t ? (
    <div data-team={t.rosterId} className={cx("flex min-w-0 flex-1 cursor-pointer flex-col gap-1", right ? "items-end text-right" : "items-start")}>
      <TeamLink rosterId={t.rosterId} name={t.name} avatar={t.avatar} size={28} className="max-w-full text-sm font-semibold" />
      <div className="num font-[family-name:var(--font-display)] text-4xl font-bold leading-none">{score !== null ? score.toFixed(1) : "—"}</div>
      <div className="text-[11px] text-muted">{live ? (kind === "past" ? "Final" : "Live") : "Projected"} · power #{rank(t.rosterId)}</div>
    </div>
  ) : <div className="flex-1 text-center text-sm text-muted">No opponent</div>;
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">{head(g.a, aScore, false)}<span className="pt-8 text-xs font-bold text-muted">VS</span>{head(g.b, bScore, true)}</div>
      {kind === "past" ? (
        <div className="mt-3 text-center text-sm font-semibold">{g.result === "W" ? `${g.a.name} won` : g.result === "L" ? `${g.b?.name} won` : g.result === "T" ? "Tie" : ""}{g.a.actual !== null && g.b?.actual != null ? ` by ${Math.abs(g.a.actual - g.b.actual).toFixed(1)}` : ""}</div>
      ) : wp !== null && (
        <div className="mt-4 flex items-center gap-3"><span className="shrink-0 text-xs text-muted">Win chance</span><WinBar pct={wp} /><span className="num w-12 text-right text-xl font-bold">{wp.toFixed(0)}%</span></div>
      )}
    </section>
  );
}

/** Playoff week with no bracket yet: who this team most likely plays, from the season simulations. Clearly an estimate. */
function PlayoffEstimate({ ctx, rid, week }: { ctx: LeagueData["ctx"]; rid: number; week: number }) {
  const m = ctx.sim.playoffOpp[week]?.[rid] ?? {};
  const out = m.out ?? 0, bye = m.bye ?? 0;
  const opps = Object.entries(m).filter(([k]) => k !== "out" && k !== "bye").map(([k, v]) => ({ id: Number(k), pct: v })).sort((a, b) => b.pct - a.pct);
  const playing = opps.reduce((a, o) => a + o.pct, 0);
  const team = (id: number) => ctx.teams.find((t) => t.rosterId === id);
  const round = week - ctx.playoffStart + 1;
  const me = team(rid);
  const mine = rid === ctx.myRosterId;
  const ws = (id: number) => ctx.weekStrength.get(id)?.get(week);
  return (
    <Card title={`Playoff round ${round} · likely opponent`} right={<span className="rounded border border-dashed border-acc-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-acc-ink">Estimate</span>}
      info={<>The bracket isn&apos;t set yet, so this comes from {ctx.sim.runs.toLocaleString()} simulated finishes to the season: every remaining game is played out from each team&apos;s projected lineups, seeds are set by record then points, and the bracket is played round by round{(ctx.league.settings as Record<string, unknown>).playoff_seed_type === 1 ? " (re-seeded each round, like your league)" : " (fixed bracket, like Sleeper's default)"}. Percentages are how often each pairing came up.</>}>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-panel2 p-2"><div className="num text-lg font-bold">{playing.toFixed(0)}%</div><div className="text-[10px] text-muted">{mine ? "you" : me?.name ?? "team"} play this week</div></div>
        <div className="rounded-lg bg-panel2 p-2"><div className="num text-lg font-bold">{bye.toFixed(0)}%</div><div className="text-[10px] text-muted">on a bye</div></div>
        <div className="rounded-lg bg-panel2 p-2"><div className="num text-lg font-bold">{out.toFixed(0)}%</div><div className="text-[10px] text-muted">{round === 1 ? "miss the playoffs" : "already out"}</div></div>
      </div>
      {opps.length ? (
        <ul className="flex flex-col gap-2">
          {opps.slice(0, 5).map((o) => { const t = team(o.id); const a = ws(rid), b = ws(o.id); const wp = a && b ? winProbability(a, b) : null; const share = playing ? (100 * o.pct) / playing : 0; return (
            <li key={o.id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <TeamLink rosterId={o.id} name={t?.name ?? "—"} avatar={t?.avatar ?? null} size={20} className="min-w-0 truncate font-semibold" />
                <span className="num shrink-0 text-xs"><b>{share.toFixed(0)}%</b><span className="text-muted"> if {mine ? "you play" : "they play"}</span></span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-panel2"><div className="h-1.5 rounded-full bg-acc" style={{ width: `${share}%` }} /></div>
              {wp !== null && <div className="mt-0.5 text-[11px] text-muted">{mine ? "Your" : "Their"} win chance vs them: {wp.toFixed(0)}% (projected lineups)</div>}
            </li>); })}
        </ul>
      ) : <p className="text-sm text-muted">{out >= 99 ? "Doesn't reach this round in any simulation." : "Has a bye in every simulation that reaches this round."}</p>}
    </Card>
  );
}
