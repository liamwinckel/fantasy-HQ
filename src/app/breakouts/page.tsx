"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { breakouts, CLASS_LABEL, type BreakoutRow } from "@/lib/services/breakouts";
import { NflLogo, Card, InjuryChip, Notice, PageHeader, Tag, cx, Info } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { AiChip, useShsAiMap } from "@/components/ShsAiParts";

export default function BreakoutPage() {
  return <LeaguePage>{(d) => <BreakoutPageBody {...d} />}</LeaguePage>;
}

function BreakoutPageBody({ setup, league, ctx, sp }: LeagueData) {
  const pos = ["QB", "RB", "WR", "TE"].includes(sp.pos ?? "") ? sp.pos! : "ALL";
  const avail = sp.avail === "fa" || sp.avail === "mine" ? sp.avail : "all";
  const yr = ["0", "1", "2"].includes(sp.yr ?? "") ? sp.yr! : "all";
  const all = breakouts(ctx);
  const ai = useShsAiMap(ctx, ctx.valuationMode === "dynasty" ? "dynasty" : "ros");
  const rows = all.filter((r) => (pos === "ALL" || r.pos === pos) && (yr === "all" || r.yearsExp === Number(yr)) && (avail === "all" || (avail === "fa" ? r.owner === "Free agent" : r.mine))).slice(0, 40);
  const q = (patch: Record<string, string>) => `/breakouts/?${new URLSearchParams({ pos, avail, yr, ...patch }).toString()}`;
  const chip = (on: boolean) => cx("rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", on ? "border-acc bg-acc text-on-acc" : "border-line text-muted hover:text-fg");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)}`} title="Breakout Finder" />
      <div className="flex flex-wrap items-center gap-2">
        {[["all", "All classes"], ["0", "Rookies"], ["1", "2nd year"], ["2", "3rd year"]].map(([k, l]) => <Link key={k} href={q({ yr: k })} className={chip(yr === k)}>{l}</Link>)}
        <span className="mx-1 h-5 w-px bg-line" />
        {["ALL", "QB", "RB", "WR", "TE"].map((p) => <Link key={p} href={q({ pos: p })} className={chip(pos === p)}>{p === "ALL" ? "All" : p}</Link>)}
        <span className="mx-1 h-5 w-px bg-line" />
        {[["all", "Everyone"], ["fa", "Free agents"], ["mine", "My players"]].map(([k, l]) => <Link key={k} href={q({ avail: k })} className={chip(avail === k)}>{l}</Link>)}
      </div>
      <Info className="-mt-2 self-center" label="About this tool">
        Rookies, second- and third-year players whose profile points to a jump: share of team volume, efficiency, a growing role, Sleeper&apos;s outlook, draft capital and age.
        Only healthy players with a real role who are projected to play are scored; anyone already top-tier at their position is left out. Score 0–100.
      </Info>
      {rows.length === 0 && <Card><p className="text-sm text-muted">No candidates match these filters.</p></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r, i) => <BreakoutCard key={r.id} r={r} rank={i + 1} ai={ai.get(r.id)?.pct} />)}
      </div>
      <Info className="">Model weights are on <Link href="/methodology" className="underline">How it&apos;s calculated</Link>. Data: Sleeper league scoring, NFLverse stats and snap counts.</Info>
    </div>
  );
}

function BreakoutCard({ r, rank, ai }: { r: BreakoutRow; rank: number; ai?: number | null }) {
  const tierStyle = r.tier === "Strong" ? "bg-acc text-on-acc" : r.tier === "Moderate" ? "border border-acc-ink text-acc-ink" : "border border-line text-muted";
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="num w-6 pt-1 text-sm font-bold text-muted">{rank}</span>
        <PlayerImg id={r.id} name={r.name} pos={r.pos} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><PlayerLink id={r.id} name={r.name} className="text-base font-bold" /><InjuryChip status={r.injury} /><AiChip v={ai} name={r.name} /></div>
          <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted"><NflLogo team={r.team} size={14} />{r.pos} · {r.team} · {CLASS_LABEL[r.yearsExp]}{r.age ? ` · age ${Math.floor(r.age)}` : ""}{r.draftRound ? ` · R${r.draftRound} pick` : " · undrafted"} · <span className={r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : ""}>{r.owner}</span></div>
        </div>
        <div className="text-right">
          <div className="num font-[family-name:var(--font-display)] text-4xl font-bold leading-none text-acc-ink">{r.score}</div>
          <span className={cx("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", tierStyle)}>{r.tier}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-4">
        <div className="flex flex-col gap-1">
          {r.components.map((c) => (
            <div key={c.label} className="grid grid-cols-[8.5rem_1fr] items-center gap-2 text-[11px]">
              <span className="text-muted">{c.label}</span>
              <div className="h-1.5 rounded-full bg-panel2"><div className="h-1.5 rounded-full bg-acc transition-[width] duration-500" style={{ width: `${Math.round(c.value * 100)}%` }} /></div>
            </div>
          ))}
        </div>
        <Spark pts={r.pointsTrend} opp={r.oppTrend} />
      </div>
      {r.evidence.length > 0 && <ul className="mt-3 flex flex-col gap-1 text-xs leading-relaxed">{r.evidence.slice(0, 4).map((e) => <li key={e}>› {e}</li>)}</ul>}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted"><Tag kind="MODEL" /> {r.ppg} pts/g so far · Sleeper {r.rosPpg.toFixed(1)} pts/g ahead{r.snapPct !== null ? ` · ${Math.round(r.snapPct * 100)}% snaps` : ""} · trade value {r.value.toFixed(0)}</div>
    </Card>
  );
}

/** Last 6 games: bars = points, line = opportunity. */
function Spark({ pts, opp }: { pts: number[]; opp: number[] }) {
  const W = 120, H = 54;
  const mp = Math.max(1, ...pts), mo = Math.max(1, ...opp);
  const bw = W / Math.max(1, pts.length);
  const line = opp.map((o, i) => `${i * bw + bw / 2},${H - 4 - (o / mo) * (H - 10)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Last 6 games: points and opportunity">
      {pts.map((p, i) => <rect key={i} x={i * bw + bw * 0.2} y={H - 4 - (p / mp) * (H - 10)} width={bw * 0.6} height={Math.max(1, (p / mp) * (H - 10))} rx="2" fill="var(--acc)" opacity="0.8" />)}
      <polyline points={line} fill="none" stroke="var(--text)" strokeWidth="1.5" />
      <text x={W} y={8} fontSize="8" textAnchor="end" fill="var(--muted)">last 6 · pts / volume</text>
    </svg>
  );
}
