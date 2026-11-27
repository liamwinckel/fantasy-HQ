"use client";
import { HScroll } from "@/components/useHPan";

import Link from "next/link";
import { LeaguePage, type LeagueData } from "@/components/AppData";
import { TeamLink } from "@/components/TeamPeek";
import { formatLabel } from "@/lib/services/portfolio";
import { powerRankings, POS_ORDER } from "@/lib/engine/power";
import { ord } from "@/lib/engine/classify";
import { Bar, Card, ClassBadge, Logo, PageHeader, Stat, cx } from "@/components/ui";
import { Segmented } from "@/components/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInView } from "@/components/motion";
import { Sheet } from "@/components/Sheet";
import { DashDetail, type DashKey } from "../DashDetails";
import { HBars } from "@/components/charts";
import { PlayerLink } from "@/components/PlayerCard";

/** Which detail is open: a dashboard-style panel for one team, or one team's position group. */
type Detail = { k: DashKey; rid: number } | { k: "sched"; rid: number } | { k: "pos"; rid: number; pos: string } | { k: "depth"; rid: number } | { k: "picks"; rid: number } | null;
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
  const [posView, setPosView] = useState<"table" | "chart">("table");
  const team = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)!;
  const mainPos = POS_ORDER.filter((p) => ["QB", "RB", "WR", "TE"].includes(p) && power.some((t) => t.positions[p]));
  const extraPos = POS_ORDER.filter((p) => !["QB", "RB", "WR", "TE"].includes(p) && power.some((t) => t.positions[p]));
  const [detail, setDetail] = useState<Detail>(null);
  const open = (d: Detail) => setDetail(d);
  const games = Math.max(1, ctx.playoffStart - 1);
  const proj = (rid: number) => { const w = Math.round(ctx.sim.projectedWins[rid] ?? 0); return `${w}–${Math.max(0, games - w)}`; };
  const capital = new Map(ctx.teams.map((t) => [t.rosterId, ctx.picks.filter((k) => k.ownerRosterId === t.rosterId).reduce((a, k) => a + k.value, 0)]));
  const capSorted = [...capital.values()].sort((a, b) => b - a);
  const pickRank = (rid: number) => capSorted.indexOf(capital.get(rid) ?? 0) + 1;
  const showPicks = fmt === "dynasty" && ctx.picks.length > 0;
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

      {fmt === "keeper" && (
        <Card title="Keepers">
          <p className="text-sm text-muted">Plan next year&apos;s keepers and what they&apos;ll cost.</p>
          <Link href="/keepers" className="mt-3 inline-block rounded-lg bg-acc px-4 py-2 text-sm font-bold text-on-acc">Open Keeper Planner</Link>
        </Card>
      )}
      <Card title="Power rankings" pad={false} info={<><b>Power</b> = overall team strength (0–100): 45% best-lineup strength now, 35% rest-of-season strength, 20% points per game, scaled so the best team ≈ 100. <b>Proj.</b> = projected final regular-season record: current wins plus the average of the remaining games across the simulated seasons. <b>Playoff % / Title %</b> = how often the team makes the playoffs / wins it all in thousands of simulated seasons. Tap any number for the detail.</>}>
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_2.75rem_2.75rem_3rem] items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid-cols-[2rem_minmax(0,1fr)_3.5rem_3.5rem_8rem_4rem_4rem] sm:px-5">
          <span>#</span><span>Team</span><span>Record</span><span title="Projected final regular-season record">Proj.</span><span className="text-right sm:text-left" title="Power score, 0–100 (best team ≈ 100)">Power</span><span className="hidden text-right sm:block">Playoff %</span><span className="hidden text-right sm:block">Title %</span>
        </div>
        <ul className="divide-y divide-line">
          {power.map((p) => {
            const t = team(p.rosterId);
            const c = ctx.showClasses ? ctx.classifications.get(p.rosterId) : undefined;
            return (
              <li key={p.rosterId} data-team={p.rosterId} className={cx("cursor-pointer active:bg-panel2", "grid grid-cols-[1.5rem_minmax(0,1fr)_2.75rem_2.75rem_3rem] items-center gap-2 px-3 py-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_3.5rem_3.5rem_8rem_4rem_4rem] sm:px-5", p.rosterId === ctx.myRosterId && "bg-acc-soft")}>
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
                <CellBtn onClick={() => open({ k: "playoff", rid: p.rosterId })} title="Projected final record (simulated)" className="num text-left text-xs text-muted underline decoration-line underline-offset-4">{proj(p.rosterId)}</CellBtn>
                <CellBtn onClick={() => open({ k: "power", rid: p.rosterId })} className="flex items-center justify-end gap-2 sm:justify-start"><Bar value={p.score} className="hidden sm:block" /><span className="num rounded bg-panel2 px-1.5 py-0.5 text-sm font-bold">{p.score.toFixed(0)}</span></CellBtn>
                <CellBtn onClick={() => open({ k: "playoff", rid: p.rosterId })} className="num hidden text-right text-sm underline decoration-line underline-offset-4 sm:block">{(ctx.sim.playoffOdds[p.rosterId] ?? 0).toFixed(0)}%</CellBtn>
                <CellBtn onClick={() => open({ k: "title", rid: p.rosterId })} className="num hidden text-right text-sm underline decoration-line underline-offset-4 sm:block">{(ctx.sim.titleOdds[p.rosterId] ?? 0).toFixed(0)}%</CellBtn>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Positional ranks" pad={false} right={<Segmented label="Positional view" value={posView} onChange={(v) => setPosView(v)} options={[{ value: "table", label: "Table" }, { value: "chart", label: "Chart" }]} />} info={<>Each number is that team&apos;s league rank at the position (1 = strongest), based on the projected points its starters there score in the best lineup. <span className="text-pos">Green</span> = top third, <span className="text-neg">red</span> = bottom half. <b>Depth</b> = quality of the best bench players.{showPicks && <> <b>Picks</b> = draft pick capital: total market value of the picks each team owns.</>} Tap any number for the players behind it.</>}>
        {posView === "chart" ? <PosPlot ctx={ctx} power={power} positions={[...mainPos, ...extraPos]} onOpen={(rid, pos) => open({ k: "pos", rid, pos })} /> : <>
        {/* Team names stay put; the coloured blocks scroll sideways when there are more positions than fit. */}
        <div className="flex">
          <div className="w-[42%] shrink-0 border-r border-line sm:w-56">
            <div className="flex h-9 items-center border-b border-line px-3 text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-5">Team</div>
            <ul className="divide-y divide-line">
              {power.map((p) => (
                <li key={p.rosterId} data-team={p.rosterId} className={cx("flex h-11 cursor-pointer items-center px-3 active:bg-panel2 sm:px-5", p.rosterId === ctx.myRosterId && "bg-acc-soft")}>
                  <TeamLink rosterId={p.rosterId} name={team(p.rosterId).name} avatar={team(p.rosterId).avatar} size={22} className="max-w-full text-xs font-semibold sm:text-sm" />
                </li>
              ))}
            </ul>
          </div>
          <HScroll className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain" data-no-swipe>
            <div className="min-w-max lg:min-w-0">
              <div className="flex h-9 items-center gap-1 border-b border-line px-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">
                {[...mainPos, ...extraPos].map((pos) => <span key={pos} className="w-11 lg:w-auto lg:flex-1">{pos}</span>)}<span className="w-12 lg:w-auto lg:flex-1">Depth</span>{showPicks && <span className="w-12 lg:w-auto lg:flex-1">Picks</span>}
              </div>
              <ul className="divide-y divide-line">
                {power.map((p) => (
                  <li key={p.rosterId} className={cx("flex h-11 items-center gap-1 px-2", p.rosterId === ctx.myRosterId && "bg-acc-soft")}>
                    {[...mainPos, ...extraPos].map((pos) => { const r = p.positions[pos]?.rank ?? 0; return <CellBtn key={pos} onClick={() => open({ k: "pos", rid: p.rosterId, pos })} title={`${p.positions[pos]?.pts.toFixed(1) ?? 0} projected pts`} className={cx("num w-11 rounded py-1.5 text-center text-xs font-bold lg:w-auto lg:flex-1 lg:text-sm", tone(r))}>{r || "—"}</CellBtn>; })}
                    <CellBtn onClick={() => open({ k: "depth", rid: p.rosterId })} className={cx("num w-12 rounded py-1.5 text-center text-xs font-bold lg:w-auto lg:flex-1 lg:text-sm", tone(p.depthRank))}>{p.depthRank}</CellBtn>
                    {showPicks && <CellBtn onClick={() => open({ k: "picks", rid: p.rosterId })} title={`${(capital.get(p.rosterId) ?? 0).toFixed(0)} pick value`} className={cx("num w-12 rounded py-1.5 text-center text-xs font-bold lg:w-auto lg:flex-1 lg:text-sm", tone(pickRank(p.rosterId)))}>{pickRank(p.rosterId)}</CellBtn>}
                  </li>
                ))}
              </ul>
            </div>
          </HScroll>
        </div>
        </>}
      </Card>

      {fmt === "redraft" && <PlayoffPicture ctx={ctx} power={power} onOpen={open} />}
      {fmt === "dynasty" && <DynastyOutlook ctx={ctx} power={power} onOpen={open} />}
      <Sheet open={detail !== null} onClose={() => setDetail(null)} full={detail?.k === "record"}
        title={detail ? (detail.k === "pos" ? `${detail.pos} group` : detail.k === "depth" ? "Bench depth" : detail.k === "picks" ? "Draft picks" : detail.k === "sched" ? "Schedule left" : TITLES[detail.k] ?? "") : ""} sub={detail ? team(detail.rid).name : ""}>
        {detail && (detail.k === "picks" ? <PicksDetail ctx={ctx} rid={detail.rid} rank={pickRank(detail.rid)} total={capital.get(detail.rid) ?? 0} /> : detail.k === "sched" ? <SchedDetail ctx={ctx} power={power} rid={detail.rid} /> : detail.k === "pos" || detail.k === "depth" ? <GroupDetail ctx={ctx} power={power} rid={detail.rid} pos={detail.k === "pos" ? detail.pos : null} /> : <DashDetail k={detail.k} ctx={ctx} me={detail.rid} power={power} />)}
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
  // Remaining schedule as a rank among the league (1 = hardest), shown as a word + 5-step difficulty meter.
  const hard = [...rows].filter((r) => r.s !== null).sort((a, b) => b.s! - a.s!).map((r) => r.t.rosterId);
  const n = hard.length;
  const level = (rid: number) => { const i = hard.indexOf(rid); if (i < 0) return null; const q = n > 1 ? i / (n - 1) : 0.5; const step = q < 0.2 ? 5 : q < 0.4 ? 4 : q < 0.6 ? 3 : q < 0.8 ? 2 : 1; return { step, word: ["", "Easiest", "Easy", "Average", "Tough", "Toughest"][step], rank: i + 1 }; };
  const spots = ctx.league.settings.playoff_teams || 6;
  return (
    <Card title="Playoff picture" info={<>Playoff odds from 4,000 simulated seasons. <b>Schedule left</b> = how strong each team&apos;s remaining fantasy opponents are (by power score), ranked against the rest of the league: 5 bars = toughest run-in, 1 bar = easiest. Tap it for the opponents.</>} pad={false}>
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_3.5rem_5.5rem] gap-2 border-b border-line px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-5"><span>#</span><span>Team</span><span className="text-right">Playoffs</span><span className="text-right">Schedule left</span></div>
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.t.rosterId} data-team={r.t.rosterId} className={cx("cursor-pointer active:bg-panel2", "grid grid-cols-[1.75rem_minmax(0,1fr)_3.5rem_5.5rem] items-center gap-2 px-3 py-2 sm:px-5", r.t.rosterId === ctx.myRosterId && "bg-acc-soft", i === spots - 1 && "border-b-2 border-b-acc")}>
            <span className="num text-xs font-bold text-muted">{i + 1}</span>
            <TeamLink rosterId={r.t.rosterId} name={r.t.name} avatar={r.t.avatar} size={22} className="max-w-full text-sm font-semibold" />
            <CellBtn onClick={() => onOpen({ k: "playoff", rid: r.t.rosterId })} className="num text-right text-sm font-bold underline decoration-line underline-offset-4">{r.po.toFixed(0)}%</CellBtn>
            {(() => { const lv = level(r.t.rosterId); return (
              <CellBtn onClick={() => onOpen({ k: "sched", rid: r.t.rosterId })} className="flex flex-col items-end gap-0.5" aria-label={lv ? `${lv.word} remaining schedule, ${lv.rank} of ${n}` : "No games left"}>
                {lv ? <>
                  <span className={cx("text-[11px] font-semibold", lv.step >= 4 ? "text-neg" : lv.step <= 2 ? "text-pos" : "text-muted")}>{lv.word}</span>
                  <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((k) => <span key={k} className={cx("h-1.5 w-2.5 rounded-sm", k <= lv.step ? (lv.step >= 4 ? "bg-neg" : lv.step <= 2 ? "bg-pos" : "bg-muted") : "bg-panel2")} />)}</span>
                </> : <span className="text-xs text-muted">—</span>}
              </CellBtn>); })()}
          </li>
        ))}
      </ul>
      <p className="px-5 py-2 text-[11px] text-muted">Yellow line = playoff cut ({spots} teams).</p>
    </Card>
  );
}

/** One team's remaining fantasy opponents, week by week, with how strong each is. */
function SchedDetail({ ctx, power, rid }: { ctx: Ctx; power: Power; rid: number }) {
  const score = new Map(power.map((p) => [p.rosterId, p.score]));
  const rank = new Map([...power].sort((a, b) => b.score - a.score).map((p, i) => [p.rosterId, i + 1]));
  const games = Object.entries(ctx.remainingSchedule).flatMap(([w, gs]) => gs.filter(([a, b]) => a === rid || b === rid).map(([a, b]) => ({ week: Number(w), opp: a === rid ? b : a }))).sort((a, b) => a.week - b.week);
  const avg = games.length ? games.reduce((x, g) => x + (score.get(g.opp) ?? 0), 0) / games.length : null;
  const lg = power.reduce((x, p) => x + p.score, 0) / Math.max(1, power.length);
  if (!games.length) return <p className="text-sm text-muted">No regular-season games left.</p>;
  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="text-sm">Remaining opponents average a power score of <b>{avg!.toFixed(0)}</b>, vs <b>{lg.toFixed(0)}</b> for the league{avg! > lg + 3 ? " — a tougher run-in than most." : avg! < lg - 3 ? " — an easier run-in than most." : " — about average."}</p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {games.map((g) => { const t = ctx.teams.find((x) => x.rosterId === g.opp)!; const r = rank.get(g.opp) ?? 0; const n = power.length; return (
          <li key={g.week} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm">
            <span className="text-xs text-muted">Wk {g.week}</span>
            <span className="truncate font-semibold">{t?.name}</span>
            <span className={cx("text-xs font-semibold", r <= n / 3 ? "text-neg" : r > (2 * n) / 3 ? "text-pos" : "text-muted")}>#{r} power · {(score.get(g.opp) ?? 0).toFixed(0)}</span>
          </li>); })}
      </ul>
      <p className="text-[11px] text-muted">Power score /100 = team strength now and for the rest of the season. Red = a top-third team, green = bottom third.</p>
    </div>
  );
}

/** Dynasty: roster value, strategy and draft capital for every team. */
/** The picks one team owns, best first, with league rank of its total pick capital. */
function PicksDetail({ ctx, rid, rank, total }: { ctx: Ctx; rid: number; rank: number; total: number }) {
  const picks = ctx.picks.filter((k) => k.ownerRosterId === rid).sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round || b.value - a.value);
  const team = (id: number) => ctx.teams.find((t) => t.rosterId === id);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Pick capital <b className="text-fg">{total.toFixed(0)}</b> · {ord(rank)} of {ctx.teamsCount}</p>
      {picks.length === 0 ? <p className="text-sm text-muted">No future picks owned.</p> : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {picks.map((k) => (
            <li key={k.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-semibold">{k.label}</div>
                {k.originalRosterId !== rid && <div className="truncate text-[11px] text-muted">via {team(k.originalRosterId)?.name ?? "trade"}</div>}
              </div>
              <span className="num rounded bg-panel2 px-1.5 py-0.5 font-bold">{k.value.toFixed(0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

/**
 * Positional landscape: one row per position, every team plotted by how its starters there project against the
 * league average (centre line). Shows not just the rank but the size of the gap. Tap a dot to follow that team
 * across every row; tap the highlighted dot again for the players behind it.
 */
function PosPlot({ ctx, power, positions, onOpen }: { ctx: Ctx; power: Power; positions: string[]; onOpen: (rid: number, pos: string) => void }) {
  const [focus, setFocus] = useState<number>(ctx.myRosterId ?? power[0]?.rosterId ?? 0);
  const team = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)!;
  const rows = positions.map((pos) => {
    const pts = power.map((p) => ({ rid: p.rosterId, pts: p.positions[pos]?.pts ?? 0, rank: p.positions[pos]?.rank ?? 0 }));
    const avg = pts.reduce((a, x) => a + x.pts, 0) / Math.max(1, pts.length);
    const lo = Math.min(...pts.map((x) => x.pts)), hi = Math.max(...pts.map((x) => x.pts));
    // Each row runs from the league's weakest group at that position to its strongest.
    const at = (v: number) => (hi - lo > 0.01 ? (v - lo) / (hi - lo) : 0.5);
    return { pos, avg, avgAt: at(avg), pts: pts.map((x) => ({ ...x, rel: avg > 0 ? (x.pts - avg) / avg : 0, at: at(x.pts) })) };
  });
  // Wider screens get a wider plot instead of a blown-up one: scale is capped at 1.4×.
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(320, Math.round(boxW / 1.4)), L = 44, R = 14, rowH = 40, top = 22;
  const x = (t: number) => L + t * (W - L - R);
  const H = top + rows.length * rowH + 8;
  const f = power.find((p) => p.rosterId === focus);
  // Dots start on the league-average tick and slide out to their spots the first time the chart is on screen.
  const seen = useInView(box);
  const slide = (at: number, row: number): React.CSSProperties => ({ transform: `translateX(${x(at)}px)`, transition: `transform 750ms cubic-bezier(0.22,1,0.36,1) ${seen ? row * 60 : 0}ms` });
  const n = power.length;
  const toneOf = (rank: number) => (rank <= Math.ceil(n / 3) ? "var(--pos)" : rank > n / 2 ? "var(--neg)" : "var(--acc)");
  return (
    <div ref={box} className="px-3 pb-3 pt-2 sm:px-5">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <Logo src={team(focus).avatar} name={team(focus).name} size={24} />
        <span className="min-w-0 flex-1 truncate font-semibold">{team(focus).name}</span>
        {f && <span className="shrink-0 text-xs text-muted">Power #{f.rank}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Positional strength vs league average, ${team(focus).name} highlighted`}>
        <text x={x(0)} y={12} textAnchor="start" fontSize={9} fill="var(--neg)">weakest</text>
        <text x={x(0.5)} y={12} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.6}>| = league avg</text>
        <text x={x(1)} y={12} textAnchor="end" fontSize={9} fill="var(--pos)">strongest</text>
        {rows.map((r, i) => {
          const y = top + i * rowH + rowH / 2;
          const me = r.pts.find((p) => p.rid === focus);
          return (
            <g key={r.pos}>
              <text x={0} y={y + 4} fontSize={11} fontWeight={800} fill="currentColor">{r.pos}</text>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.12} strokeWidth={6} strokeLinecap="round" />
              <line x1={x(r.avgAt)} x2={x(r.avgAt)} y1={y - 8} y2={y + 8} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.5} />
              {r.pts.filter((p) => p.rid !== focus).map((p) => (
                <circle key={p.rid} cx={0} cy={y} r={5} fill="currentColor" fillOpacity={0.3} className="cursor-pointer" onClick={() => setFocus(p.rid)} style={slide(seen ? p.at : r.avgAt, i)}>
                  <title>{`${team(p.rid).name}: ${p.pts.toFixed(1)} pts (${ord(p.rank)})`}</title>
                </circle>
              ))}
              {me && (
                <g className="cursor-pointer" onClick={() => onOpen(focus, r.pos)}>
                  {/* keyed by row, not team: tapping another team glides this dot to its spot */}
                  <g style={slide(seen ? me.at : r.avgAt, i)}>
                    <circle cx={0} cy={y} r={9} fill={toneOf(me.rank)} stroke="var(--bg)" strokeWidth={2} style={{ transition: "fill 400ms ease" }} />
                    <text x={0} y={y + 3.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="#0a0a0a">{me.rank}</text>
                  </g>
                  <text x={Math.min(W - R + 4, Math.max(L - 4, x(me.at)))} y={y - 12} style={{ opacity: seen ? 0.8 : 0, transition: "opacity 300ms ease 600ms" }} textAnchor={me.at > 0.8 ? "end" : me.at < 0.2 ? "start" : "middle"} fontSize={9} fill="currentColor" opacity={0.8}>
                    {`${me.rel >= 0 ? "+" : ""}${Math.round(me.rel * 100)}% · ${me.pts.toFixed(1)}`}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-muted">Each dot is a team, placed between the league&apos;s weakest and strongest group at that position by its starters&apos; projected points; the label is points and % vs the league average. The big dot shows its rank (green top third, red bottom half). Tap another dot to follow that team; tap the big dot for the players.</p>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" data-no-swipe>
        {power.map((p) => (
          <button key={p.rosterId} type="button" onClick={() => setFocus(p.rosterId)} aria-pressed={p.rosterId === focus}
            className={cx("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", p.rosterId === focus ? "border-acc bg-acc-soft" : "border-line bg-panel2")}>
            <Logo src={team(p.rosterId).avatar} name={team(p.rosterId).name} size={18} />{team(p.rosterId).name}
          </button>
        ))}
      </div>
    </div>
  );
}
