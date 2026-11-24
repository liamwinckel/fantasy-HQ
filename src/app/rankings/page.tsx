"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { PlayerImg, TabSwitch } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { InfoButton, InjuryChip, NflLogo, PageHeader, cx } from "@/components/ui";
import { AiChip, label, ShsExplainer, shsVerdict, useCollege, useShsWeights } from "@/components/ShsAiParts";
import { accuracy, snapshotWeek } from "@/lib/services/accuracy";
import { BacktestCard } from "@/components/Backtest";
import { playerDist } from "@/lib/engine/ranges";
import { useEffect } from "react";
import { formatLabel } from "@/lib/services/portfolio";
import { rankings, type RankRow, type RankScope } from "@/lib/services/rankings";
import { shsAi, type ShsAi } from "@/lib/services/shsai";
import { weekWeather } from "@/lib/weather";
import { useAsync } from "@/components/AppData";
import { Fragment } from "react";

export default function RankingsPage() {
  return <LeaguePage>{(d) => <RankingsBody {...d} />}</LeaguePage>;
}

const n0 = (x: number) => (x ? String(Math.round(x)) : "–");
const n1 = (x: number) => (x ? x.toFixed(1) : "–");

function statLine(r: RankRow, scope: RankScope) {
  if (scope === "dynasty") return [r.age ? `age ${Math.floor(r.age)}` : null, r.yearsExp !== null ? (r.yearsExp === 0 ? "rookie" : `${r.yearsExp} yrs exp`) : null].filter(Boolean).join(" · ");
  const parts: string[] = [];
  if (r.pos === "QB") parts.push(`${n0(r.passYd)} pass yds`, `${n1(r.passTd)} pass TD`);
  if (["QB", "RB", "WR", "TE"].includes(r.pos) && r.rushYd) parts.push(`${n0(r.rushYd)} rush yds`);
  if (["RB", "WR", "TE"].includes(r.pos)) parts.push(`${n1(r.rec)} rec`, `${n0(r.recYd)} rec yds`);
  if (["QB", "RB", "WR", "TE"].includes(r.pos) && r.td) parts.push(`${n1(r.td)} TD`);
  if (r.pos === "K") parts.push(`${n1(r.fg)} FG`);
  if (r.pos === "DEF" || ["DL", "LB", "DB"].includes(r.pos)) { if (r.sacks) parts.push(`${n1(r.sacks)} sacks`); if (r.tackles) parts.push(`${n1(r.tackles)} tackles`); }
  return parts.join(" · ");
}

function SortHead({ k, by, desc, onSort, children, className }: { k: "experts" | "ai" | "name" | "pts"; by: string; desc: boolean; onSort: (k: "experts" | "ai" | "name" | "pts") => void; children: React.ReactNode; className?: string }) {
  const on = by === k;
  return (
    <button type="button" onClick={() => onSort(k)} aria-label={`Sort by ${String(children)}`}
      className={cx("flex items-center justify-center gap-0.5 uppercase tracking-wider", on ? "text-fg" : "text-muted hover:text-fg", className)}>
      {children}<span className={cx("text-[8px]", !on && "opacity-0")}>{desc ? "▲" : "▼"}</span>
    </button>
  );
}

/** SHS AI column: "=" or up/down ticks; tap for the exact number and why. */
function Shs({ a, name }: { a: ShsAi | undefined; name: string }) {
  if (!a || a.pct === null) return <span className="text-[10px] text-muted">—</span>;
  return <AiChip v={a.pct} ai={a} name={name} />;
}

/** Why SHS AI agrees or disagrees: each factor from −1 (worse than his rank) to +1 (better). */
export function Factors({ a }: { a: ShsAi }) {
  if (!a.factors.length && !a.market) return <p className="text-xs text-muted">Not enough data on this player for SHS AI factors.</p>;
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  const rowsF = [
    ...(a.market ? [{ key: "market", label: "Betting markets", value: a.market.value, weight: 1, detail: `Markets imply ${a.market.pts.toFixed(1)} pts in your scoring (${a.market.covered.map((c) => MKT[c] ?? c).join(", ")})` }] : []),
    ...a.factors,
  ];
  return (
    <>
    {a.mode === "custom"
      ? <p className="mb-2 text-[11px] text-muted">Custom mix: {pc(a.blend.expert)} expert rank{a.blend.sleeper ? ` · ${pc(a.blend.sleeper)} projection` : ""}{a.blend.market ? ` · ${pc(a.blend.market)} betting lines` : ""} · {pc(a.blend.factors)} SHS factors</p>
      : <p className="mb-2 text-[11px] text-muted">SHS formula: his expert-rank value, moved only by what has beaten the experts in past seasons{a.blend.market ? `, with ${pc(a.blend.market)} from betting lines` : ""}. {a.parts.filter((x) => Math.abs(x.effect) >= 0.005).map((x) => `${label(x.key)} ${x.effect > 0 ? "+" : "−"}${Math.abs(Math.round(x.effect * 1000) / 10)}%`).join(" · ") || "Nothing moved him."} Dim rows are tracked but have no proven edge.</p>}
    <ul className="flex flex-col gap-1.5">
      {rowsF.map((f) => (
        <li key={f.key} className={cx("text-[11px]", a.mode !== "custom" && f.key !== "market" && !a.parts.some((x) => x.key === f.key) && "opacity-50")}>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-center gap-2">
            <span className="font-semibold">{f.label}{a.mode === "custom" && f.key !== "market" && f.weight !== 1 ? ` ×${f.weight}` : ""}</span>
            <span className="relative h-2 rounded-full bg-panel2">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <span className={cx("absolute inset-y-0 rounded-full", f.value >= 0 ? "left-1/2 bg-pos" : "right-1/2 bg-neg")} style={{ width: `${Math.abs(f.value) * 50}%` }} />
            </span>
            <span className={cx("num text-right font-bold", f.value > 0.05 ? "text-pos" : f.value < -0.05 ? "text-neg" : "text-muted")}>{f.value > 0 ? "+" : ""}{f.value.toFixed(2)}</span>
          </div>
          <div className="text-muted">{f.detail}</div>
        </li>
      ))}
    </ul>
    </>
  );
}
const MKT: Record<string, string> = { pass_yd: "pass yds", rush_yd: "rush yds", rec_yd: "rec yds", rr_yd: "rush+rec yds", rec: "receptions", td: "anytime TD", pass_td: "pass TDs", rush_td: "rush TDs", rec_td: "rec TDs", pass_int: "INTs" };

function RankingsBody({ league, ctx, sp }: LeagueData) {
  const { set } = useQuery();
  const scope: RankScope = sp.scope === "ros" ? "ros" : sp.scope === "dynasty" ? "dynasty" : "week";
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const all = useMemo(() => rankings(ctx, scope), [ctx, scope]);
  const wx = useAsync(() => (scope === "week" ? weekWeather(ctx.games, w0) : Promise.resolve(null)), [ctx, scope, w0]);
  const college = useCollege(ctx, scope === "dynasty" ? all.slice(0, 400) : []);
  const weights = useShsWeights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ai = useMemo(() => shsAi(ctx, all, scope, wx.data, { college }), [ctx, all, scope, wx.data, college, weights]);
  // Save this week's rankings (before kickoff) so SHS AI can be graded against what actually happens.
  useEffect(() => { if (scope === "week" && !wx.loading) snapshotWeek(ctx, all, ai).catch(() => {}); }, [ctx, all, ai, scope, wx.loading]);
  const acc = useAsync(() => accuracy(ctx), [ctx]);
  const dists = useMemo(() => (scope === "week" ? new Map(all.filter((r) => r.pts > 0.5).map((r) => [r.id, playerDist(ctx, r.id, Math.min(ctx.currentWeek, ctx.lastWeek))])) : new Map<string, ReturnType<typeof playerDist>>()), [ctx, all, scope]);
  const [aiInfo, setAiInfo] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [pos, setPos] = useState("ALL");
  const [own, setOwn] = useState<"all" | "fa" | "mine">("all");
  // Tap a column title to sort by it; tap again to flip the order.
  const [by, setBy] = useState<"experts" | "ai" | "name" | "pts">("experts");
  const [desc, setDesc] = useState(false);
  const sortBy = (k: typeof by) => { if (k === by) setDesc(!desc); else { setBy(k); setDesc(false); } };
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(75);
  const positions = ["ALL", ...["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"].filter((p) => all.some((r) => r.pos === p))];
  // Ranks come from the full list, so filters (position, owner, search) never renumber players.
  const ranked = useMemo(() => {
    const ecr = [...all].sort((a, b) => a.rank - b.rank);
    const byAi = [...all].sort((a, b) => (a.ecrPos === null ? 1 : 0) - (b.ecrPos === null ? 1 : 0) || ai.get(b.id)!.rating - ai.get(a.id)!.rating);
    return { ecr, ai: byAi, ecrN: new Map(ecr.map((r, i) => [r.id, i + 1])), aiN: new Map(byAi.map((r, i) => [r.id, i + 1])) };
  }, [all, ai]);
  const base = by === "ai" ? ranked.ai : by === "name" ? [...all].sort((a, b) => a.name.localeCompare(b.name))
    : by === "pts" ? [...all].sort((a, b) => (scope === "dynasty" ? b.value - a.value : b.pts - a.pts)) : ranked.ecr;
  const rows = (desc ? [...base].reverse() : base)
    .filter((r) => (pos === "ALL" || r.pos === pos) && (own === "all" || (own === "fa" ? r.owner === "Free agent" : r.mine)) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const dates = ctx.consensusDates;
  const dyn = scope === "dynasty";
  const numLabel = dyn ? "Value" : "Pts";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Rankings"
        info={<>
          <b>ECR</b> (default order) = FantasyPros&apos; expert consensus, the average of dozens of analysts, via DynastyProcess{dates ? ` (updated ${scope === "week" ? dates.weekly : dates.ecr})` : ""}.
          {" "}<b>{dyn ? "Value" : "Pts"}</b> = {dyn ? <>dynasty trade value in this league (0–100{ctx.superflex ? ", superflex" : ""})</> : <>Sleeper&apos;s projection in your scoring, {scope === "week" ? `Week ${w0}` : `Weeks ${w0}–${ctx.lastWeek}`}</>}.
          {" "}<b>SHS</b> = SHS AI&apos;s agreement with the experts: <b className="text-pos">+</b> = better than his expert rank, <b className="text-neg">−</b> = worse. Tap the ⓘ on the SHS column for what goes into it, or a player to see each factor.
        </>}>
        <TabSwitch label="Rankings span" value={scope} onChange={(v) => { set({ scope: v === "week" ? undefined : v }, true); setLimit(75); }}
          options={[{ value: "week", label: "Week", sub: `Week ${w0}` }, { value: "ros", label: "Season", sub: `Weeks ${w0}–${ctx.lastWeek}` }, { value: "dynasty", label: "Dynasty", sub: "Long term" }]} />
      </PageHeader>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" className="w-full rounded-lg border border-line bg-panel2 py-2 pl-8 pr-2 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {positions.map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", pos === p ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}>{p === "ALL" ? "All" : p}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {([["all", "Everyone"], ["fa", "Free agents"], ["mine", "My team"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setOwn(k)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", own === k ? "bg-fg text-bg" : "bg-panel2 text-muted")}>{l}</button>)}
        </div>
      </div>

      {scope === "week" && <BacktestCard ctx={ctx} />}
      {acc.data && <TrackRecord a={acc.data} />}

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.75rem_3.5rem] items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4.5rem_4.5rem] sm:px-4">
          <SortHead k="experts" by={by} desc={desc} onSort={sortBy}>ECR</SortHead>
          <SortHead k="name" by={by} desc={desc} onSort={sortBy} className="justify-start">Player</SortHead>
          <span className="hidden sm:block">{dyn ? "Profile" : "Projected stats"}</span>
          <span className="flex items-center justify-center gap-0.5"><SortHead k="ai" by={by} desc={desc} onSort={sortBy}>SHS</SortHead><InfoButton open={aiInfo} onClick={() => setAiInfo(!aiInfo)} label="What is SHS AI?" /></span>
          <SortHead k="pts" by={by} desc={desc} onSort={sortBy} className="justify-end">{numLabel}</SortHead>
        </div>
        {aiInfo && <div className="fhq-in border-b border-line bg-panel2/40 px-3 py-3 sm:px-4"><ShsExplainer scope={scope} /></div>}
        <ul className="divide-y divide-line">
          {rows.slice(0, limit).map((r) => (
            <Fragment key={r.id}>
            <li onClick={() => setOpen(open === r.id ? null : r.id)} className={cx("cursor-pointer", "grid grid-cols-[2.5rem_minmax(0,1fr)_3.75rem_3.5rem] items-center gap-2 px-3 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4.5rem_4.5rem] sm:px-4", r.mine && "bg-acc-soft")}>
              <div className="text-center">
                <div className="num text-sm font-bold">{by === "ai" ? ranked.aiN.get(r.id) : r.ecrPos !== null ? ranked.ecrN.get(r.id) : "–"}</div>
                <div className="text-[9px] font-semibold text-muted">{r.pos}{by === "ai" ? ai.get(r.id)!.rank : r.ecrPos ?? "–"}</div>
              </div>
              <div className="flex min-w-0 items-center gap-2.5">
                <PlayerImg id={r.id} name={r.name} pos={r.pos} size={34} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><PlayerLink id={r.id} name={r.name} className="min-w-0" /><InjuryChip status={r.injury} /></div>
                  <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] text-muted"><NflLogo team={r.team} size={12} />{r.pos} · {r.team ?? "FA"}{r.opp ? ` vs ${r.opp}` : ""}<span className={cx("ml-1 truncate", r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "")}>· {r.owner}</span></div>
                  <div className="truncate text-[11px] text-muted sm:hidden">{statLine(r, scope)}</div>
                </div>
              </div>
              <div className="hidden truncate text-xs text-muted sm:block">{statLine(r, scope)}</div>
              <div className="flex justify-center"><Shs a={ai.get(r.id)} name={r.name} /></div>
              <div className="text-right">
                <div className="num font-[family-name:var(--font-display)] text-xl font-bold leading-none">{(dyn ? r.value : r.pts).toFixed(dyn ? 0 : 1)}</div>
                {scope === "ros" && r.games > 0 && <div className="text-[10px] text-muted">{(r.pts / r.games).toFixed(1)}/g</div>}
                {scope === "week" && r.pts > 0.5 && (() => { const d = dists.get(r.id); return d ? <div className="num text-[10px] text-muted" title="Floor (1 week in 10 worse) – ceiling (1 in 10 better)">{d.floor.toFixed(0)}–{d.ceiling.toFixed(0)}</div> : null; })()}
              </div>
            </li>
            {open === r.id && (
              <li className="fhq-in bg-panel2/40 px-3 py-3 sm:px-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span><b>SHS AI: {shsVerdict(ai.get(r.id)?.pct)?.word ?? "no view"}</b> <span className="text-muted">· experts {r.pos}{r.ecrPos ?? "–"} → SHS AI {r.pos}{ai.get(r.id)!.rank}. {shsVerdict(ai.get(r.id)?.pct)?.long ?? ""}</span></span>
                  <span className="text-muted">bars: − worse than his rank · + better</span>
                </div>
                <Factors a={ai.get(r.id)!} />
              </li>
            )}
            </Fragment>
          ))}
        </ul>
        {rows.length > limit && <button type="button" onClick={() => setLimit(limit + 75)} className="w-full border-t border-line py-3 text-sm font-semibold text-acc-ink">Show more ({rows.length - limit} left)</button>}
        {rows.length === 0 && <p className="p-5 text-sm text-muted">No players match.</p>}
      </section>
    </div>
  );
}

function TrackRecord({ a }: { a: NonNullable<Awaited<ReturnType<typeof accuracy>>> }) {
  const best = Math.max(a.experts, a.shs, a.sleeper);
  const cell = (l: string, v: number) => (
    <div className={cx("rounded-lg px-2 py-1.5 text-center", v === best ? "bg-pos/15" : "bg-panel2")}>
      <div className={cx("num text-lg font-bold leading-none", v === best && "text-pos")}>{v.toFixed(1)}%</div><div className="mt-0.5 text-[10px] text-muted">{l}</div>
    </div>
  );
  return (
    <section className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted">Live track record (incl. betting lines & weather)</h2>
        <span className="text-[11px] text-muted">{a.weeks.length} week{a.weeks.length === 1 ? "" : "s"} · {a.pairs.toLocaleString()} matchups</span>
      </div>
      <div className="grid grid-cols-3 gap-2">{cell("Experts", a.experts)}{cell("SHS AI", a.shs)}{cell("Projection", a.sleeper)}</div>
      <p className="mt-2 text-[11px] text-muted">How often each ranking put the higher scorer first, comparing every pair of players at a position (saved on this device before kickoff each week).{a.weeks.length >= 3 ? " SHS AI is now tuning its factor weights from these results." : " Factor auto-tuning starts after 3 graded weeks."}</p>
    </section>
  );
}
