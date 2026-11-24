"use client";

/** SHS AI Lab: what it is, the backtest in full, and the live record. */
import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { BacktestDetail, useBacktest } from "@/components/Backtest";
import { ShsExplainer } from "@/components/ShsAiParts";
import { Card, PageHeader } from "@/components/ui";
import { accuracy } from "@/lib/services/accuracy";
import Link from "next/link";
import RESEARCH from "@/lib/services/shsResearch.json";

type Res = { generatedAt: string; projSource: string; weeks: number; rows: number; expert: number; summary: Record<string, number>;
  perSeason: { season: number; weeks: number; experts: number; projection: number; shsDefault: number; shsTuned: number }[];
  factors: { key: string; corr: number | null; flipped?: number }[] };
const R = RESEARCH as unknown as Res;
const LABEL: Record<string, string> = { ppg: "Points per game", snap: "Snap share", adv: "Opportunity & efficiency", xfp: "Expected points", track: "Player tracking", chart: "Film charting", proj: "Projection gap", inj: "Injuries & practice", matchup: "Defensive matchup", vegas: "Team implied total", script: "Game script" };

export default function ShsPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

function Body({ ctx, league }: LeagueData) {
  const bt = useBacktest(ctx);
  const live = useAsync(() => accuracy(ctx), [ctx]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader eyebrow={league.name} title="SHS AI Lab" />
      <Card title="What SHS AI is"><ShsExplainer scope="week" /><Link href="/settings/" className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">Adjust weights in Settings</Link></Card>
      <Card title="Five-season research" info={<>Every regular-season week since 2021 ({R.weeks} weeks, {R.rows.toLocaleString()} player-weeks) replayed with only what was known before kickoff: FantasyPros weekly expert ranks, Sleeper&apos;s projection, and every SHS factor from earlier weeks. Scored in PPR. &quot;Tuned&quot; is out of sample: weights fitted on the other seasons, graded on that one.</>}>
        <div className="overflow-hidden rounded-xl border border-line text-sm">
          <div className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] gap-2 border-b border-line bg-panel2/60 px-3 py-1.5 text-[10px] font-semibold uppercase text-muted"><span>Season</span><span className="text-right">Experts</span><span className="text-right">Sleeper</span><span className="text-right">Old SHS</span><span className="text-right">Tuned SHS</span></div>
          {R.perSeason.map((x) => <div key={x.season} className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] gap-2 border-b border-line px-3 py-1.5 last:border-0"><span className="text-muted">{x.season}</span><span className="num text-right">{x.experts}%</span><span className="num text-right">{x.projection}%</span><span className="num text-right">{x.shsDefault}%</span><span className="num text-right font-bold">{x.shsTuned}%</span></div>)}
        </div>
        <p className="mt-3 text-sm"><b>Finding:</b> {R.expert >= 100 ? "none of the stat-based factors beat the expert consensus week to week. Each one, added on its own in either direction, made the rankings slightly worse (below), because the experts already price in usage, matchups, Vegas totals and injuries. So SHS AI now follows the experts for the week unless betting lines disagree; lines are saved before every game and graded below as weeks finish." : `the best mix was ${R.expert}% experts; that's now the default.`}</p>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">
          {[...R.factors].sort((a, b) => (b.corr ?? 0) - (a.corr ?? 0)).map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-2 px-3 py-1.5"><span>{LABEL[f.key] ?? f.key}</span><span className="num text-xs text-muted">{(f.corr ?? 0) > 0 ? "+" : ""}{f.corr} pts{f.flipped !== undefined ? ` · flipped ${f.flipped > 0 ? "+" : ""}${f.flipped}` : ""}</span></li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] text-muted">Change in picks right (percentage points) when the factor nudges the expert rank by up to ±5%.</p>
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
