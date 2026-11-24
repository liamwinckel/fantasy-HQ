"use client";

import Link from "next/link";
import { LeaguePage, type LeagueData } from "@/components/AppData";
import { TeamLink } from "@/components/TeamPeek";
import { formatLabel } from "@/lib/services/portfolio";
import { powerRankings, POS_ORDER } from "@/lib/engine/power";
import { ord } from "@/lib/engine/classify";
import { Bar, Card, ClassBadge, PageHeader, Stat, cx } from "@/components/ui";
import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/Sheet";
import { DashDetail, type DashKey } from "../DashDetails";
import { HBars } from "@/components/charts";
import { PlayerLink } from "@/components/PlayerCard";

/** Which detail is open: a dashboard-style panel for one team, or one team's position group. */
type Detail = { k: DashKey; rid: number } | { k: "pos"; rid: number; pos: string } | { k: "depth"; rid: number } | null;
const CellBtn = ({ onClick, className, children, title }: { onClick: () => void; className?: string; children: ReactNode; title?: string }) => (
  <button type="button" title={title} onClick={onClick} className={cx("transition-transform active:scale-90", className)}>{children}</button>
);

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
  const [detail, setDetail] = useState<Detail>(null);
  const open = (d: Detail) => setDetail(d);
  const tone = (rank: number) => (rank <= Math.ceil(n / 3) ? "bg-pos/20 text-pos" : rank > n / 2 ? "bg-neg/15 text-neg" : "bg-panel2 text-muted");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring} · ${n} teams`} title="League"
        info={<>Power score = 45% best-lineup strength + 35% rest-of-season strength + 20% points per game, each relative to the best team. Position ranks count each starter at his own position (flex included). Depth = best three bench players. Tap any team for its roster.</>} />

      {mine && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat onClick={() => open({ k: "power", rid: mine.rosterId })} label="Your power rank" value={`#${mine.rank}`} sub={`score ${mine.score.toFixed(0)}`} tag="MODEL" />
          <Stat onClick={() => open({ k: "playoff", rid: mine.rosterId })} label="Playoff odds" value={`${(ctx.sim.playoffOdds[mine.rosterId] ?? 0).toFixed(0)}%`} sub={`avg finish ${ord(Math.round(ctx.sim.avgSeed[mine.rosterId] ?? 0))}`} tag="MODEL" />
          <Stat onClick={() => open({ k: "title", rid: mine.rosterId })} label="Title odds" value={`${(ctx.sim.titleOdds[mine.rosterId] ?? 0).toFixed(0)}%`} sub="simulated" tag="MODEL" />
          {fmt === "dynasty"
            ? <Stat onClick={() => open({ k: "value", rid: mine.rosterId })} label="Roster value" value={`#${mine.dynastyRank}`} sub="players + picks" tag="MODEL" />
            : <Stat onClick={() => open({ k: "power", rid: mine.rosterId })} label="Strong · weak" value={<span className="text-lg"><span className="text-pos">{mine.strengths.join(" ") || "—"}</span> · <span className="text-neg">{mine.weaknesses.join(" ") || "—"}</span></span>} />}
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
                    <button type="button" onClick={() => open({ k: "playoff", rid: p.rosterId })} className="underline decoration-line underline-offset-2 sm:hidden">· {(ctx.sim.playoffOdds[p.rosterId] ?? 0).toFixed(0)}% playoffs</button>
                  </div>
                </div>
                <CellBtn onClick={() => open({ k: "record", rid: p.rosterId })} className="num text-left text-xs underline decoration-line underline-offset-4">{t.wins}–{t.losses}{t.ties ? `–${t.ties}` : ""}</CellBtn>
                <CellBtn onClick={() => open({ k: "power", rid: p.rosterId })} className="flex items-center justify-end gap-2 sm:justify-start"><Bar value={p.score} className="hidden sm:block" /><span className="num rounded bg-panel2 px-1.5 py-0.5 text-sm font-bold">{p.score.toFixed(0)}</span></CellBtn>
                <CellBtn onClick={() => open({ k: "playoff", rid: p.rosterId })} className="num hidden text-right text-sm underline decoration-line underline-offset-4 sm:block">{(ctx.sim.playoffOdds[p.rosterId] ?? 0).toFixed(0)}%</CellBtn>
                <CellBtn onClick={() => open({ k: "title", rid: p.rosterId })} className="num hidden text-right text-sm underline decoration-line underline-offset-4 sm:block">{(ctx.sim.titleOdds[p.rosterId] ?? 0).toFixed(0)}%</CellBtn>
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
              {mainPos.map((pos) => { const r = p.positions[pos]?.rank ?? 0; return <CellBtn key={pos} onClick={() => open({ k: "pos", rid: p.rosterId, pos })} title={`${p.positions[pos]?.pts.toFixed(1) ?? 0} projected pts`} className={cx("num rounded py-1 text-center text-xs font-bold", tone(r))}>{r || "—"}</CellBtn>; })}
              <CellBtn onClick={() => open({ k: "depth", rid: p.rosterId })} className={cx("num rounded py-1 text-center text-xs font-bold", tone(p.depthRank))}>{p.depthRank}</CellBtn>
            </li>
          ))}
        </ul>
        {extraPos.length > 0 && mine && (
          <div className="flex flex-wrap gap-x-2 border-t border-line px-5 py-2.5 text-xs text-muted">Your other ranks: {extraPos.map((pos) => <button key={pos} type="button" onClick={() => open({ k: "pos", rid: mine.rosterId, pos })} className="underline decoration-line underline-offset-2">{pos} {mine.positions[pos] ? ord(mine.positions[pos].rank) : "—"}</button>)}</div>
        )}
      </Card>

      {fmt === "redraft" && <PlayoffPicture ctx={ctx} power={power} onOpen={open} />}
      {fmt === "keeper" && (
        <Card title="Keepers">
          <p className="text-sm text-muted">Plan next year&apos;s keepers and what they&apos;ll cost.</p>
          <Link href="/keepers" className="mt-3 inline-block rounded-lg bg-acc px-4 py-2 text-sm font-bold text-on-acc">Open Keeper Planner</Link>
        </Card>
      )}
      {fmt === "dynasty" && <DynastyOutlook ctx={ctx} power={power} onOpen={open} />}
      <Sheet open={detail !== null} onClose={() => setDetail(null)} full={detail?.k === "record"}
        title={detail ? (detail.k === "pos" ? `${detail.pos} group` : detail.k === "depth" ? "Bench depth" : TITLES[detail.k] ?? "") : ""} sub={detail ? team(detail.rid).name : ""}>
        {detail && (detail.k === "pos" || detail.k === "depth" ? <GroupDetail ctx={ctx} power={power} rid={detail.rid} pos={detail.k === "pos" ? detail.pos : null} /> : <DashDetail k={detail.k} ctx={ctx} me={detail.rid} power={power} />)}
      </Sheet>
    </div>
  );
}

type Ctx = LeagueData["ctx"];
type Power = ReturnType<typeof powerRankings>;

/** Redraft: projected seeds and how hard each team's remaining fantasy schedule is. */
function PlayoffPicture({ ctx, power, onOpen }: { ctx: Ctx; power: Power; onOpen: (d: Detail) => void }) {
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
            <CellBtn onClick={() => onOpen({ k: "playoff", rid: r.t.rosterId })} className="num text-right text-sm font-bold underline decoration-line underline-offset-4">{r.po.toFixed(0)}%</CellBtn>
            <CellBtn onClick={() => onOpen({ k: "power", rid: r.t.rosterId })} className={cx("num text-right text-xs", r.s === null ? "text-muted" : r.s > 85 ? "text-neg" : r.s < 75 ? "text-pos" : "text-muted")}>{r.s === null ? "—" : `sched ${r.s.toFixed(0)}`}</CellBtn>
          </li>
        ))}
      </ul>
      <p className="px-5 py-2 text-[11px] text-muted">Yellow line = playoff cut ({spots} teams).</p>
    </Card>
  );
}

/** Dynasty: roster value, strategy and draft capital for every team. */
function DynastyOutlook({ ctx, power, onOpen }: { ctx: Ctx; power: Power; onOpen: (d: Detail) => void }) {
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
              <CellBtn onClick={() => onOpen({ k: "value", rid: p.rosterId })} className="num text-sm font-bold underline decoration-line underline-offset-4">{p.dynastyRank}</CellBtn>
              <div className="min-w-0">
                <TeamLink rosterId={t.rosterId} name={t.name} avatar={t.avatar} size={22} className="max-w-full text-sm font-semibold" />
                <div className="pl-8 text-[10px] text-muted">{age ? `avg age ${age.toFixed(1)}` : ""} · {firsts} first{firsts === 1 ? "" : "s"} · {picks.length} picks</div>
              </div>
              <CellBtn onClick={() => onOpen({ k: "strategy", rid: p.rosterId })}><ClassBadge cls={c ? c.override ?? c.primary : null} /></CellBtn>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const TITLES: Partial<Record<DashKey, string>> = { record: "Record", power: "Power rank", playoff: "Playoff odds", title: "Title odds", value: "Roster value", strategy: "Strategy" };

/** One team's players at a position (or its bench), and how that group compares across the league. */
function GroupDetail({ ctx, power, rid, pos }: { ctx: Ctx; power: Power; rid: number; pos: string | null }) {
  const lu = ctx.lineups.get(rid);
  const t = ctx.teams.find((x) => x.rosterId === rid)!;
  const starters = new Set((lu?.optimal ?? []).map((s) => s.playerId).filter(Boolean) as string[]);
  const proj = (id: string) => ctx.projections.get(id)?.median ?? 0;
  const ids = t.players.filter((id) => (pos ? ctx.players.get(id)?.pos === pos : !starters.has(id))).sort((a, b) => proj(b) - proj(a));
  const me = power.find((p) => p.rosterId === rid);
  const name = (r: number) => ctx.teams.find((x) => x.rosterId === r)?.name ?? "";
  return (
    <div className="flex flex-col gap-5 pb-4">
      {me && (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-panel2/70 p-3"><div className="text-[11px] text-muted">League rank</div><div className="num text-2xl font-bold">{ord(pos ? me.positions[pos]?.rank ?? 0 : me.depthRank)}</div></div>
          <div className="rounded-xl bg-panel2/70 p-3"><div className="text-[11px] text-muted">{pos ? "Projected pts from starters" : "Bench quality"}</div><div className="num text-2xl font-bold">{pos ? (me.positions[pos]?.pts ?? 0).toFixed(1) : me.depth.toFixed(0)}</div></div>
        </div>
      )}
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">{pos ? `${pos}s on the roster` : "Bench (best first)"}</h3>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {ids.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate"><PlayerLink id={id} name={ctx.players.get(id)?.name ?? id} /></span>
              <span className="flex shrink-0 items-center gap-2 text-xs"><span className={cx("rounded px-1.5 py-0.5 font-semibold", starters.has(id) ? "bg-acc-soft text-acc-ink" : "bg-panel2 text-muted")}>{starters.has(id) ? "starts" : "bench"}</span><span className="num w-10 text-right font-bold">{proj(id).toFixed(1)}</span></span>
            </li>
          ))}
          {!ids.length && <li className="px-3 py-3 text-sm text-muted">Nobody here.</li>}
        </ul>
        <p className="mt-1 text-[11px] text-muted">Projected points this week.</p>
      </section>
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">{pos ? `${pos} strength, every team` : "Bench depth, every team"}</h3>
        <HBars highlight={rid} fmt={(v) => v.toFixed(pos ? 1 : 0)} rows={[...power].map((p) => ({ key: p.rosterId, label: name(p.rosterId), value: pos ? p.positions[pos]?.pts ?? 0 : p.depth })).sort((a, b) => b.value - a.value)} />
      </section>
    </div>
  );
}
