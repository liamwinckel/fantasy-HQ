"use client";

import Link from "next/link";
import { LeaguePage, type LeagueData } from "@/components/AppData";
import { TeamLink } from "@/components/TeamPeek";
import { formatLabel } from "@/lib/services/portfolio";
import { powerRankings, POS_ORDER } from "@/lib/engine/power";
import { ord } from "@/lib/engine/classify";
import { Bar, Card, ClassBadge, PageHeader, Stat, cx } from "@/components/ui";

export default function LeagueAnalyzer() {
  return <LeaguePage>{(d) => <LeagueBody {...d} />}</LeaguePage>;
}

function LeagueBody({ league, ctx }: LeagueData) {
  const power = powerRankings(ctx);
  const n = ctx.teamsCount;
  const fmt = ctx.format;
  const mine = power.find((p) => p.rosterId === ctx.myRosterId);
  const team = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)!;
  const mainPos = POS_ORDER.filter((p) => ["QB", "RB", "WR", "TE"].includes(p) && power.some((t) => t.positions[p]));
  const extraPos = POS_ORDER.filter((p) => !["QB", "RB", "WR", "TE"].includes(p) && power.some((t) => t.positions[p]));
  const tone = (rank: number) => (rank <= Math.ceil(n / 3) ? "bg-pos/20 text-pos" : rank > n / 2 ? "bg-neg/15 text-neg" : "bg-panel2 text-muted");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring} · ${n} teams`} title="League"
        info={<>Power score = 45% best-lineup strength + 35% rest-of-season strength + 20% points per game, each relative to the best team. Position ranks count each starter at his own position (flex included). Depth = best three bench players. Tap any team for its roster.</>} />

      {mine && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Your power rank" value={`#${mine.rank}`} sub={`score ${mine.score.toFixed(0)}`} tag="MODEL" />
          <Stat label="Playoff odds" value={`${(ctx.sim.playoffOdds[mine.rosterId] ?? 0).toFixed(0)}%`} sub={`avg finish ${ord(Math.round(ctx.sim.avgSeed[mine.rosterId] ?? 0))}`} tag="MODEL" />
          <Stat label="Title odds" value={`${(ctx.sim.titleOdds[mine.rosterId] ?? 0).toFixed(0)}%`} sub="simulated" tag="MODEL" />
          {fmt === "dynasty"
            ? <Stat label="Roster value" value={`#${mine.dynastyRank}`} sub="players + picks" tag="MODEL" />
            : <Stat label="Strong · weak" value={<span className="text-lg"><span className="text-pos">{mine.strengths.join(" ") || "—"}</span> · <span className="text-neg">{mine.weaknesses.join(" ") || "—"}</span></span>} />}
        </div>
      )}

      <Card title="Power rankings" pad={false}>
        <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_3rem_4.5rem] items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid-cols-[2rem_minmax(0,1fr)_3.5rem_8rem_4rem_4rem] sm:px-5">
          <span>#</span><span>Team</span><span>Record</span><span className="text-right sm:text-left">Power</span><span className="hidden text-right sm:block">Playoffs</span><span className="hidden text-right sm:block">Title</span>
        </div>
        <ul className="divide-y divide-line">
          {power.map((p) => {
            const t = team(p.rosterId);
            const c = ctx.showClasses ? ctx.classifications.get(p.rosterId) : undefined;
            return (
              <li key={p.rosterId} data-team={p.rosterId} className={cx("cursor-pointer active:bg-panel2", "grid grid-cols-[1.75rem_minmax(0,1fr)_3rem_4.5rem] items-center gap-2 px-3 py-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_3.5rem_8rem_4rem_4rem] sm:px-5", p.rosterId === ctx.myRosterId && "bg-acc-soft")}>
                <span className="num font-bold">{p.rank}</span>
                <div className="min-w-0">
                  <TeamLink rosterId={t.rosterId} name={t.name} avatar={t.avatar} size={28} className="max-w-full text-sm font-semibold" />
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 pl-9 text-[10px] text-muted">
                    {c && <ClassBadge cls={c.override ?? c.primary} className="!px-1 !py-0 !text-[9px]" />}
                    <span>{ord(t.rank)} in standings</span>
                    <span className="sm:hidden">· {(ctx.sim.playoffOdds[p.rosterId] ?? 0).toFixed(0)}% playoffs</span>
                  </div>
                </div>
                <span className="num text-xs">{t.wins}–{t.losses}{t.ties ? `–${t.ties}` : ""}</span>
                <div className="flex items-center justify-end gap-2 sm:justify-start"><Bar value={p.score} className="hidden sm:block" /><span className="num text-sm font-bold">{p.score.toFixed(0)}</span></div>
                <span className="num hidden text-right text-sm sm:block">{(ctx.sim.playoffOdds[p.rosterId] ?? 0).toFixed(0)}%</span>
                <span className="num hidden text-right text-sm sm:block">{(ctx.sim.titleOdds[p.rosterId] ?? 0).toFixed(0)}%</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Positional ranks" pad={false} info={<>Rank 1 = strongest. <span className="text-pos">Green</span> = top third, <span className="text-neg">red</span> = bottom half. Based on the projected points each position contributes to the best lineup.</>}>
        <div className={cx("grid items-center gap-1 border-b border-line px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-5")}
          style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${mainPos.length + 1}, 2.4rem)` }}>
          <span className="text-left">Team</span>{mainPos.map((p) => <span key={p}>{p}</span>)}<span>Depth</span>
        </div>
        <ul className="divide-y divide-line">
          {power.map((p) => (
            <li key={p.rosterId} data-team={p.rosterId} className={cx("cursor-pointer active:bg-panel2", "grid items-center gap-1 px-3 py-1.5 sm:px-5", p.rosterId === ctx.myRosterId && "bg-acc-soft")} style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${mainPos.length + 1}, 2.4rem)` }}>
              <TeamLink rosterId={p.rosterId} name={team(p.rosterId).name} avatar={team(p.rosterId).avatar} size={22} className="max-w-full text-xs font-semibold sm:text-sm" />
              {mainPos.map((pos) => { const r = p.positions[pos]?.rank ?? 0; return <span key={pos} title={`${p.positions[pos]?.pts.toFixed(1) ?? 0} projected pts`} className={cx("num rounded py-1 text-center text-xs font-bold", tone(r))}>{r || "—"}</span>; })}
              <span className={cx("num rounded py-1 text-center text-xs font-bold", tone(p.depthRank))}>{p.depthRank}</span>
            </li>
          ))}
        </ul>
        {extraPos.length > 0 && mine && (
          <div className="border-t border-line px-5 py-2.5 text-xs text-muted">Your other ranks: {extraPos.map((pos) => `${pos} ${mine.positions[pos] ? ord(mine.positions[pos].rank) : "—"}`).join(" · ")}</div>
        )}
      </Card>

      {fmt === "redraft" && <PlayoffPicture ctx={ctx} power={power} />}
      {fmt === "keeper" && (
        <Card title="Keepers">
          <p className="text-sm text-muted">Plan next year&apos;s keepers and what they&apos;ll cost.</p>
          <Link href="/keepers" className="mt-3 inline-block rounded-lg bg-acc px-4 py-2 text-sm font-bold text-on-acc">Open Keeper Planner</Link>
        </Card>
      )}
      {fmt === "dynasty" && <DynastyOutlook ctx={ctx} power={power} />}
    </div>
  );
}

type Ctx = LeagueData["ctx"];
type Power = ReturnType<typeof powerRankings>;

/** Redraft: projected seeds and how hard each team's remaining fantasy schedule is. */
function PlayoffPicture({ ctx, power }: { ctx: Ctx; power: Power }) {
  const score = new Map(power.map((p) => [p.rosterId, p.score]));
  const sos = (rid: number) => {
    const opps = Object.values(ctx.remainingSchedule).flatMap((games) => games.filter(([a, b]) => a === rid || b === rid).map(([a, b]) => (a === rid ? b : a)));
    return opps.length ? opps.reduce((s, o) => s + (score.get(o) ?? 0), 0) / opps.length : null;
  };
  const rows = ctx.teams.map((t) => ({ t, seed: ctx.sim.avgSeed[t.rosterId] ?? 99, po: ctx.sim.playoffOdds[t.rosterId] ?? 0, s: sos(t.rosterId) })).sort((a, b) => a.seed - b.seed);
  const spots = ctx.league.settings.playoff_teams || 6;
  return (
    <Card title="Playoff picture" info={<>Average finishing seed and playoff odds from 4,000 simulated seasons. Schedule = average power score of each team&apos;s remaining fantasy opponents (higher = harder).</>} pad={false}>
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.t.rosterId} data-team={r.t.rosterId} className={cx("cursor-pointer active:bg-panel2", "grid grid-cols-[1.75rem_minmax(0,1fr)_3.5rem_4rem] items-center gap-2 px-3 py-2 sm:px-5", r.t.rosterId === ctx.myRosterId && "bg-acc-soft", i === spots - 1 && "border-b-2 border-b-acc")}>
            <span className="num text-xs font-bold text-muted">{i + 1}</span>
            <TeamLink rosterId={r.t.rosterId} name={r.t.name} avatar={r.t.avatar} size={22} className="max-w-full text-sm font-semibold" />
            <span className="num text-right text-sm font-bold">{r.po.toFixed(0)}%</span>
            <span className={cx("num text-right text-xs", r.s === null ? "text-muted" : r.s > 85 ? "text-neg" : r.s < 75 ? "text-pos" : "text-muted")}>{r.s === null ? "—" : `sched ${r.s.toFixed(0)}`}</span>
          </li>
        ))}
      </ul>
      <p className="px-5 py-2 text-[11px] text-muted">Yellow line = playoff cut ({spots} teams).</p>
    </Card>
  );
}

/** Dynasty: roster value, strategy and draft capital for every team. */
function DynastyOutlook({ ctx, power }: { ctx: Ctx; power: Power }) {
  const rows = [...power].sort((a, b) => a.dynastyRank - b.dynastyRank);
  return (
    <Card title="Dynasty outlook" info={<>Roster value rank uses dynasty values (age, contracts, durability) for players and picks. Strategy is the model&apos;s read of each team; you can override it in the Trade Analyzer.</>} pad={false}>
      <ul className="divide-y divide-line">
        {rows.map((p) => {
          const t = ctx.teams.find((x) => x.rosterId === p.rosterId)!;
          const c = ctx.classifications.get(p.rosterId);
          const picks = ctx.picks.filter((k) => k.ownerRosterId === p.rosterId);
          const firsts = picks.filter((k) => k.round === 1).length;
          const ages = t.players.map((id) => ctx.players.get(id)).filter((x) => x && x.age && ["QB", "RB", "WR", "TE"].includes(x.pos)).map((x) => x!.age!);
          const age = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
          return (
            <li key={p.rosterId} data-team={p.rosterId} className={cx("cursor-pointer active:bg-panel2", "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:px-5", p.rosterId === ctx.myRosterId && "bg-acc-soft")}>
              <span className="num text-sm font-bold">{p.dynastyRank}</span>
              <div className="min-w-0">
                <TeamLink rosterId={t.rosterId} name={t.name} avatar={t.avatar} size={22} className="max-w-full text-sm font-semibold" />
                <div className="pl-8 text-[10px] text-muted">{age ? `avg age ${age.toFixed(1)}` : ""} · {firsts} first{firsts === 1 ? "" : "s"} · {picks.length} picks</div>
              </div>
              <ClassBadge cls={c ? c.override ?? c.primary : null} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
