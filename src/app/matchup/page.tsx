"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { parseWeek } from "@/lib/services/selected";
import { formatLabel } from "@/lib/services/portfolio";
import { gameView, teamWeek, weekGames, weekKind, type TeamWeek } from "@/lib/services/views";
import { winProbability } from "@/lib/engine/simulate";
import { powerRankings } from "@/lib/engine/power";
import { NflLogo, Bar, Card, Logo, Notice, PageHeader, Tag, cx, Info, WinBar } from "@/components/ui";
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

      <div>
        <div className="rounded-xl border border-line bg-panel p-4">
          {g.kind === "past" ? (
            <><div className="text-xs text-muted">Result</div><div className="h-display mt-1 text-3xl">{g.result === "W" ? `${g.a.name} won` : g.result === "L" ? `${g.b?.name} won` : g.result === "T" ? "Tie" : "—"}</div>
              <div className="text-xs text-muted">by {g.a.actual !== null && g.b?.actual != null ? Math.abs(g.a.actual - g.b.actual).toFixed(1) : "—"} pts</div></>
          ) : (
            <><div className="flex justify-between text-xs text-muted"><span>{g.a.name} win chance · power #{rankOf(g.a.rosterId)}{g.b ? ` vs #${rankOf(g.b.rosterId)}` : ""}</span><Tag kind="MODEL" /></div>
              <div className="mt-2 flex items-center gap-3"><WinBar pct={g.winProbA ?? 50} /><span className="num w-14 text-right text-2xl font-bold">{g.winProbA?.toFixed(0) ?? "—"}%</span></div></>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <Card title="Lineups" pad={false} className="xl:flex-[3]"><MatchupBoard g={g} /></Card>
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
                  {wp !== null && <div className="w-20 text-right text-[11px] text-muted"><WinBar pct={wp} className="h-2" />{wp.toFixed(0)}% / {(100 - wp).toFixed(0)}%</div>}
                </Link>
              </li>
            );
          })}
          {games.length === 0 && <li className="px-5 py-4 text-sm text-muted">Playoff matchups are set by the bracket. Check back once seeds are final.</li>}
        </ul>
      </Card>
    </div>
  );
}
