"use client";

/** What opens when you tap a dashboard stat or the season chart: more numbers, more charts. */
import type { ReactNode } from "react";
import type { LeagueContext } from "@/lib/services/league";
import { leaguePpg, seasonSummary } from "@/lib/services/teamSeason";
import type { TeamPower } from "@/lib/engine/power";
import { ord } from "@/lib/engine/classify";
import { HBars, LineChart, SeasonChart, StackedBars } from "@/components/charts";
import { TeamLink } from "@/components/TeamPeek";
import { cx, signed } from "@/components/ui";

export type DashKey = "record" | "power" | "pf" | "pa" | "playoff" | "title" | "finish" | "ppg" | "value" | "strategy" | "keepers" | "season";
export const POS_COLOR: Record<string, string> = { QB: "#fb7185", RB: "#4ade80", WR: "#38bdf8", TE: "#fbbf24", K: "#a78bfa", DEF: "#94a3b8" };
const SKY = "#38bdf8";

function Box({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-xl bg-panel2/70 p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cx("num mt-0.5 text-xl font-bold leading-none", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">{title}</h3>
      {children}
      {note && <p className="mt-1.5 text-[11px] text-muted">{note}</p>}
    </section>
  );
}

export function DashDetail({ k, ctx, me, power }: { k: DashKey; ctx: LeagueContext; me: number; power: TeamPower[] }) {
  const s = seasonSummary(ctx, me);
  const r = s.results;
  const labels = r.map((x) => String(x.week));
  const team = ctx.teams.find((t) => t.rosterId === me)!;
  const name = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)?.name ?? "";
  const ppg = leaguePpg(ctx);

  if (k === "record") return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="Record" value={`${team.wins}–${team.losses}${team.ties ? `–${team.ties}` : ""}`} sub={`${ord(team.rank)} in standings`} />
        <Box label="All-play record" value={`${s.allPlay.w}–${s.allPlay.l}`} sub="vs every team, every week" />
        <Box label="Luck" value={signed(Math.round(s.luck * 10) / 10)} sub={`${s.wins} wins vs ${s.expWins.toFixed(1)} expected`} tone={s.luck >= 0 ? "pos" : "neg"} />
        <Box label="Streak" value={s.streak === 0 ? "—" : `${s.streak > 0 ? "W" : "L"}${Math.abs(s.streak)}`} sub={`${s.topScores} top score${s.topScores === 1 ? "" : "s"} of the week`} />
      </div>
      <Section title="Week by week">
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {[...r].reverse().map((x) => (
            <li key={x.week} className="grid grid-cols-[2.5rem_1.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm">
              <span className="text-xs text-muted">Wk {x.week}</span>
              <span className={cx("text-center text-xs font-bold", x.won ? "text-pos" : x.won === false ? "text-neg" : "text-muted")}>{x.won ? "W" : x.won === false ? "L" : "–"}</span>
              <span className="min-w-0 truncate">{x.opp ? <>vs <TeamLink rosterId={x.opp.rosterId} name={x.opp.name} /></> : "No opponent"}</span>
              <span className="num text-right text-xs"><b>{x.pts.toFixed(1)}</b>{x.opp && <span className="text-muted"> – {x.opp.pts.toFixed(1)}</span>}<span className="block text-[10px] text-muted">{ord(x.rank)} of {ctx.teamsCount} · {x.allPlayW}–{x.allPlayL} all-play</span></span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Standings">
        <HBars highlight={me} fmt={(v) => `${v}`} rows={[...ctx.teams].sort((a, b) => a.rank - b.rank).map((t) => ({ key: t.rosterId, label: `${t.rank}. ${t.name} (${t.wins}–${t.losses})`, value: t.wins }))} />
      </Section>
    </>
  );

  if (k === "power") {
    const p = power.find((x) => x.rosterId === me)!;
    return (
      <>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Box label="Power rank" value={`#${p.rank}`} sub={`score ${p.score.toFixed(0)}`} />
          <Box label="Lineup strength now" value={p.startNow.toFixed(1)} sub="projected best lineup" />
          <Box label="Rest of season" value={p.ros.toFixed(1)} sub="avg projected per week" />
          <Box label="Depth" value={`#${p.depthRank}`} sub={`bench quality ${p.depth.toFixed(0)}`} />
        </div>
        <Section title="Positions (rank in league)">
          <HBars fmt={(v) => ord(Math.round(ctx.teamsCount + 1 - v))} max={ctx.teamsCount} rows={Object.entries(p.positions).map(([pos, v]) => ({ key: pos, label: `${pos} · ${v.pts.toFixed(1)} pts`, value: ctx.teamsCount + 1 - v.rank }))} />
        </Section>
        {(p.strengths.length > 0 || p.weaknesses.length > 0) && (
          <Section title="Strengths & weaknesses">
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <ul className="rounded-xl bg-pos/10 p-3">{p.strengths.map((x) => <li key={x}>+ {x}</li>)}{!p.strengths.length && <li className="text-muted">None stand out</li>}</ul>
              <ul className="rounded-xl bg-neg/10 p-3">{p.weaknesses.map((x) => <li key={x}>− {x}</li>)}{!p.weaknesses.length && <li className="text-muted">None stand out</li>}</ul>
            </div>
          </Section>
        )}
        <Section title="League power table" note="Score blends lineup strength now, rest-of-season projection, points per game and depth.">
          <HBars highlight={me} fmt={(v) => v.toFixed(0)} rows={power.map((t) => ({ key: t.rosterId, label: `${t.rank}. ${name(t.rosterId)}`, value: t.score }))} />
        </Section>
      </>
    );
  }

  if (k === "pf" || k === "pa" || k === "ppg") {
    const against = k === "pa";
    const myRank = 1 + ppg.filter((t) => (against ? t.papg < ppg.find((x) => x.rosterId === me)!.papg : t.ppg > ppg.find((x) => x.rosterId === me)!.ppg)).length;
    return (
      <>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {against ? <>
            <Box label="Points against" value={team.pointsAgainst.toFixed(0)} sub={`${ord(myRank)} most in league`} />
            <Box label="Per week" value={(team.pointsAgainst / Math.max(1, r.length)).toFixed(1)} />
            <Box label="Toughest opponent" value={r.length ? Math.max(...r.map((x) => x.opp?.pts ?? 0)).toFixed(1) : "—"} sub={r.length ? `wk ${[...r].sort((a, b) => (b.opp?.pts ?? 0) - (a.opp?.pts ?? 0))[0].week}` : undefined} />
            <Box label="Losses scoring above average" value={r.filter((x) => x.won === false && x.pts > x.leagueAvg).length} sub="unlucky losses" />
          </> : <>
            <Box label="Average" value={s.avg.toFixed(1)} sub={`${ord(myRank)} in league`} />
            <Box label="Last 3 weeks" value={s.last3.toFixed(1)} tone={s.last3 >= s.avg ? "pos" : "neg"} sub={`${signed(Math.round((s.last3 - s.avg) * 10) / 10)} vs season`} />
            <Box label="Best week" value={s.best?.pts.toFixed(1) ?? "—"} sub={s.best ? `week ${s.best.week}` : undefined} />
            <Box label="Consistency" value={`±${s.sd.toFixed(1)}`} sub={`worst ${s.worst?.pts.toFixed(1) ?? "—"} (wk ${s.worst?.week ?? "—"})`} />
          </>}
        </div>
        <Section title={against ? "Points against by week" : "Points by week"}>
          <LineChart labels={labels} series={against
            ? [{ name: "Scored against you", color: "#f87171", values: r.map((x) => x.opp?.pts ?? null), area: true }, { name: "League average", color: "var(--muted)", values: r.map((x) => x.leagueAvg), dash: true }, { name: "You", color: "var(--acc)", values: r.map((x) => x.pts) }]
            : [{ name: "You", color: "var(--acc)", values: r.map((x) => x.pts), area: true }, { name: "League average", color: "var(--muted)", values: r.map((x) => x.leagueAvg), dash: true }, { name: "Week's top score", color: SKY, values: r.map((x) => x.leagueHigh), dash: true }]} />
        </Section>
        {!against && <Section title="Where your points come from (starters)">
          <StackedBars labels={labels} stacks={Object.keys(POS_COLOR).filter((p) => r.some((x) => x.byPos[p])).map((p) => ({ name: p, color: POS_COLOR[p], values: r.map((x) => x.byPos[p] ?? 0) }))} />
        </Section>}
        {!against && <Section title="Weekly rank in league" note="1 = highest score that week.">
          <LineChart labels={labels} invert yMin={1} yMax={ctx.teamsCount} fmt={(v) => ord(Math.round(v))} series={[{ name: "Your rank", color: "var(--acc)", values: r.map((x) => x.rank) }]} />
        </Section>}
        <Section title={against ? "Points against per week, every team" : "Points per week, every team"}>
          <HBars highlight={me} fmt={(v) => v.toFixed(1)} rows={[...ppg].sort((a, b) => (against ? b.papg - a.papg : b.ppg - a.ppg)).map((t) => ({ key: t.rosterId, label: t.name, value: against ? t.papg : t.ppg }))} />
        </Section>
      </>
    );
  }

  if (k === "playoff" || k === "title" || k === "finish") {
    const seeds = ctx.sim.seedDist?.[me] ?? [];
    const rounds = ctx.sim.roundOdds?.[me] ?? [];
    const roundName = (i: number, n: number) => (i === 0 ? "Make playoffs" : i === n - 1 ? "Win title" : i === n - 2 ? "Reach final" : i === n - 3 ? "Reach semifinal" : `Win round ${i}`);
    return (
      <>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Box label="Playoff odds" value={`${(ctx.sim.playoffOdds[me] ?? 0).toFixed(0)}%`} />
          <Box label="Title odds" value={`${(ctx.sim.titleOdds[me] ?? 0).toFixed(0)}%`} />
          <Box label="Projected wins" value={ctx.sim.projectedWins[me] ?? "—"} sub={`now ${team.wins}`} />
          <Box label="Average finish" value={ord(Math.round(ctx.sim.avgSeed[me] ?? 0))} sub={`${ctx.sim.runs.toLocaleString()} simulations`} />
        </div>
        {rounds.length > 1 && <Section title="Your path"><HBars rows={rounds.map((v, i) => ({ key: i, label: roundName(i, rounds.length), value: v }))} max={100} /></Section>}
        {seeds.length > 0 && <Section title="Where you finish the regular season" note={`Seeds 1–${ctx.league.settings?.playoff_teams ?? "?"} make the playoffs.`}>
          <HBars rows={seeds.map((v, i) => ({ key: i, label: `${ord(i + 1)} seed`, value: v }))} max={Math.max(...seeds, 1)} />
        </Section>}
        <Section title={k === "title" ? "Title odds, every team" : "Playoff odds, every team"} note="Simulates the rest of the season thousands of times from each team's projected weekly scores.">
          <HBars highlight={me} max={100} rows={[...ctx.teams].map((t) => ({ key: t.rosterId, label: t.name, value: (k === "title" ? ctx.sim.titleOdds : ctx.sim.playoffOdds)[t.rosterId] ?? 0 })).sort((a, b) => b.value - a.value)} />
        </Section>
      </>
    );
  }

  if (k === "value") {
    const rows = [...power].sort((a, b) => a.dynastyRank - b.dynastyRank);
    return (
      <Section title="Dynasty roster value (players + picks)">
        <HBars highlight={me} fmt={(v) => v.toFixed(0)} rows={rows.map((t) => ({ key: t.rosterId, label: `${t.dynastyRank}. ${name(t.rosterId)}`, value: t.dynastyValue }))} />
      </Section>
    );
  }

  if (k === "strategy") {
    const c = ctx.classifications.get(me);
    if (!c) return null;
    return (
      <>
        <p className="mb-4 text-sm">{c.strategy}</p>
        <Section title="Evidence"><ul className="list-disc space-y-1 pl-5 text-sm">{c.evidence.map((e) => <li key={e}>{e}</li>)}</ul></Section>
        <Section title="Fit by strategy"><HBars max={100} rows={Object.entries(c.scores).sort((a, b) => b[1] - a[1]).map(([cls, v]) => ({ key: cls, label: cls, value: v }))} /></Section>
      </>
    );
  }

  if (k === "season") {
    const cumW = r.reduce<number[]>((a, x) => [...a, (a[a.length - 1] ?? 0) + (x.won ? 1 : 0)], []);
    const cumExp = r.reduce<number[]>((a, x) => [...a, (a[a.length - 1] ?? 0) + x.allPlayW / Math.max(1, x.allPlayW + x.allPlayL)], []);
    const margin = r.map((x) => (x.opp ? x.pts - x.opp.pts : null));
    return (
      <>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Box label="Average" value={s.avg.toFixed(1)} sub={`median ${s.median.toFixed(1)}`} />
          <Box label="Record" value={`${team.wins}–${team.losses}`} sub={`all-play ${s.allPlay.w}–${s.allPlay.l}`} />
          <Box label="Luck" value={signed(Math.round(s.luck * 10) / 10)} sub="wins above expected" tone={s.luck >= 0 ? "pos" : "neg"} />
          <Box label="Left on bench" value={(r.reduce((a, x) => a + x.benchPts, 0) / Math.max(1, r.length)).toFixed(1)} sub="bench points per week" />
        </div>
        <Section title="Weekly scores and what's ahead"><SeasonChart ctx={ctx} rosterId={me} selectedWeek={Math.min(ctx.currentWeek, ctx.lastWeek)} /></Section>
        <Section title="You vs opponent vs league">
          <LineChart labels={labels} series={[{ name: "You", color: "var(--acc)", values: r.map((x) => x.pts) }, { name: "Opponent", color: "#f87171", values: r.map((x) => x.opp?.pts ?? null) }, { name: "League average", color: "var(--muted)", values: r.map((x) => x.leagueAvg), dash: true }]} />
        </Section>
        <Section title="Winning margin" note="Above the line = won by that much.">
          <LineChart labels={labels} yMin={Math.min(-10, ...margin.filter((m): m is number => m !== null)) * 1.1} yMax={Math.max(10, ...margin.filter((m): m is number => m !== null)) * 1.1} series={[{ name: "Margin", color: SKY, values: margin, area: true }]} />
        </Section>
        <Section title="Wins vs expected wins" note="Expected = your chance of beating a random team each week, added up. A gap means schedule luck.">
          <LineChart labels={labels} series={[{ name: "Actual wins", color: "var(--acc)", values: cumW }, { name: "Expected wins", color: "var(--muted)", values: cumExp.map((v) => Math.round(v * 10) / 10), dash: true }]} />
        </Section>
        <Section title="Points by position (starters)">
          <StackedBars labels={labels} stacks={Object.keys(POS_COLOR).filter((p) => r.some((x) => x.byPos[p])).map((p) => ({ name: p, color: POS_COLOR[p], values: r.map((x) => x.byPos[p] ?? 0) }))} />
        </Section>
        <Section title="Weekly rank in league"><LineChart labels={labels} invert yMin={1} yMax={ctx.teamsCount} fmt={(v) => ord(Math.round(v))} series={[{ name: "Your rank", color: "var(--acc)", values: r.map((x) => x.rank) }]} /></Section>
      </>
    );
  }
  return null;
}
