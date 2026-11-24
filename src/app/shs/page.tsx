"use client";

/** SHS AI Lab: what it is, the backtest in full, and the live record. */
import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { BacktestDetail, useBacktest } from "@/components/Backtest";
import { label, ShsExplainer } from "@/components/ShsAiParts";
import { Card, cx, PageHeader } from "@/components/ui";
import { accuracy } from "@/lib/services/accuracy";
import Link from "next/link";
import RESEARCH from "@/lib/services/shsResearch.json";
import LONG from "@/lib/services/shsResearchLong.json";

type PosM = { gamma?: number; beta: Record<string, number>; gain: number; experts?: number; single?: Record<string, number> };
type Res = { generatedAt: string; projSource: string; weeks: number; rows: number; summary: Record<string, number>;
  perSeason: { season: number; weeks: number; experts: number; projection: number; mix: number; ecrSleeper: number; shs: number }[];
  model: Record<string, PosM>; factors: { key: string; byPos: Record<string, number | null>; kept: string[] }[]; calls?: { flipped: number; right: number | null } };
const R = RESEARCH as unknown as Res;
type LongScope = { note: string; seasons: number[]; rows: number; weeks?: number; model: Record<string, PosM> };
const LG = LONG as unknown as { ros: LongScope; dynasty: LongScope };
const POS = ["QB", "RB", "WR", "TE"];
const sg = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(2)}`);

/** One ranking type: per position, how the formula did vs the experts and which factors worked on their own. */
function ScopeResearch({ title, note, model, single }: { title: string; note: string; model: Record<string, PosM>; single: Record<string, Record<string, number | null>> }) {
  const keys = Object.keys(single).filter((k) => POS.some((p) => single[k][p] !== null && single[k][p] !== undefined));
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="text-xs text-muted">{note}</p>
      <div className="overflow-hidden rounded-xl border border-line text-xs">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_4rem] gap-2 border-b border-line bg-panel2/60 px-3 py-1.5 text-[10px] font-semibold uppercase text-muted"><span>Pos</span><span>What moves SHS AI</span><span className="text-right">vs experts</span></div>
        {POS.map((p) => { const m = model[p]; const parts = [...(m?.gamma ? [`Sleeper pull ${m.gamma}`] : []), ...Object.entries(m?.beta ?? {}).map(([k, v]) => `${label(k)} ${v > 0 ? "+" : ""}${v}`)]; return (
          <div key={p} className="grid grid-cols-[2.5rem_minmax(0,1fr)_4rem] gap-2 border-b border-line px-3 py-1.5 last:border-0">
            <b>{p}</b><span className={parts.length ? "" : "text-muted"}>{parts.join(" · ") || "Experts only (nothing beat them)"}</span>
            <span className={cx("num text-right font-bold", (m?.gain ?? 0) > 0 ? "text-pos" : "text-muted")}>{(m?.gain ?? 0) > 0 ? `+${m!.gain}` : "="}</span>
          </div>); })}
      </div>
      <details className="rounded-xl border border-line text-xs">
        <summary className="cursor-pointer px-3 py-2 font-semibold">Each factor on its own (points of picks right vs experts)</summary>
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,3rem)] gap-1 border-y border-line bg-panel2/60 px-3 py-1.5 text-[10px] font-semibold uppercase text-muted"><span>Factor</span>{POS.map((p) => <span key={p} className="text-right">{p}</span>)}</div>
        {keys.map((k) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_repeat(4,3rem)] gap-1 border-b border-line px-3 py-1 last:border-0">
            <span>{label(k)}</span>
            {POS.map((p) => { const v = single[k][p]; const kept = k === "gap" ? !!model[p]?.gamma : !!model[p]?.beta[k]; return <span key={p} className={cx("num text-right", kept ? "font-bold text-pos" : (v ?? 0) > 0 ? "" : "text-muted")}>{sg(v)}{kept ? "✓" : ""}</span>; })}
          </div>
        ))}
        <p className="px-3 py-2 text-[11px] text-muted">Out of sample (fitted on the other seasons, graded on the left-out one). ✓ = kept in the formula. A factor alone can look good and still be dropped if it doesn&apos;t add anything on top of the ones already kept, or only worked in some seasons.</p>
      </details>
    </div>
  );
}

const flip = (m: Record<string, PosM>) => { const o: Record<string, Record<string, number | null>> = {}; for (const p of POS) for (const [k, v] of Object.entries(m[p]?.single ?? {})) (o[k] ??= {})[p] = v; return o; };

export default function ShsPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

function Body({ ctx, league }: LeagueData) {
  const bt = useBacktest(ctx);
  const live = useAsync(() => accuracy(ctx), [ctx]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader eyebrow={league.name} title="SHS AI Lab" />
      <Card title="What SHS AI is"><ShsExplainer scope="week" /><Link href="/settings/" className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">SHS formula or your own mix: Settings</Link></Card>
      <Card title="The research" info={<>Every past season since 2021 replayed with only what was known at the time. <b>Picks right</b> = for every pair of players at the same position, how often the one ranked higher actually scored more (PPR). All SHS numbers are out of sample: the formula was fitted on the other seasons and graded on the one left out, so it can&apos;t have seen the answers.</>}>
        <h3 className="text-sm font-bold">Weekly · {R.weeks} weeks, {R.rows.toLocaleString()} player-weeks</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-line text-sm">
          <div className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] gap-2 border-b border-line bg-panel2/60 px-3 py-1.5 text-[10px] font-semibold uppercase text-muted"><span>Season</span><span className="text-right">Experts</span><span className="text-right">Sleeper</span><span className="text-right">Old mix</span><span className="text-right">SHS</span></div>
          {R.perSeason.map((x) => <div key={x.season} className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] gap-2 border-b border-line px-3 py-1.5 last:border-0"><span className="text-muted">{x.season}</span><span className="num text-right">{x.experts}%</span><span className="num text-right">{x.projection}%</span><span className="num text-right text-muted">{x.mix}%</span><span className={cx("num text-right font-bold", x.shs > x.experts ? "text-pos" : x.shs < x.experts ? "text-neg" : "")}>{x.shs}%</span></div>)}
          <div className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] gap-2 bg-panel2/40 px-3 py-1.5 font-bold"><span>Avg</span><span className="num text-right">{R.summary.experts}%</span><span className="num text-right">{R.summary.projection}%</span><span className="num text-right text-muted">{R.summary.mix}%</span><span className="num text-right">{R.summary.shs}%</span></div>
        </div>
        <p className="mt-2 text-xs text-muted">Old mix = the previous 25% experts · 25% Sleeper · 50% factors blend.{R.calls?.flipped ? ` When SHS AI disagreed with the experts on which of two players would score more, it was right ${R.calls.right}% of the time (${R.calls.flipped.toLocaleString()} pairs).` : ""}</p>
        <div className="mt-3"><ScopeResearch title="Weekly formula" note="Weekly expert ranks are very sharp: they already price in usage, matchups, Vegas totals and injury news. A factor only moves the weekly number for a position if it beat them out of sample. Betting lines are layered on top for players who have them, and graded below as weeks finish." model={R.model} single={Object.fromEntries(R.factors.map((f) => [f.key, f.byPos]))} /></div>
        <div className="mt-5"><ScopeResearch title={`Rest of season · ${LG.ros.weeks ?? ""} snapshots, ${LG.ros.rows.toLocaleString()} rankings`} note={LG.ros.note} model={LG.ros.model} single={flip(LG.ros.model)} /></div>
        <div className="mt-5"><ScopeResearch title={`Dynasty · ${LG.dynasty.seasons.length} preseasons, ${LG.dynasty.rows.toLocaleString()} rankings`} note={`${LG.dynasty.note} Small sample, so the formula is shrunk hard toward the experts.`} model={LG.dynasty.model} single={flip(LG.dynasty.model)} /></div>
      </Card>
      <Card title="Backtest · this season">
        {bt.loading && <p className="text-sm text-muted">Replaying past weeks{bt.prog ? ` · ${bt.prog[0]}/${bt.prog[1]}` : ""}…</p>}
        {!bt.loading && !bt.data && <p className="text-sm text-muted">Past weeks&apos; expert rankings aren&apos;t available yet; they arrive with the next data refresh.</p>}
        {bt.data && <BacktestDetail r={bt.data} />}
      </Card>
      {live.data && (
        <Card title="Live record (with betting lines & weather)">
          <p className="text-sm">Experts {live.data.experts.toFixed(1)}% · SHS AI {live.data.shs.toFixed(1)}% · Sleeper {live.data.sleeper.toFixed(1)}% picks right over {live.data.weeks.length} week{live.data.weeks.length === 1 ? "" : "s"} saved on this device.</p>
        </Card>
      )}
    </div>
  );
}
