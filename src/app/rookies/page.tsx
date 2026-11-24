"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { rookieReport, ROOKIE_WEIGHTS, type RookieRow } from "@/lib/services/rookies";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { InjuryChip, NflLogo, Card, Notice, PageHeader, Tag, cx, Info } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";

export default function RookiePage() {
  return <LeaguePage>{(d) => <RookiePageBody {...d} />}</LeaguePage>;
}

function RookiePageBody({ league, ctx, sp }: LeagueData) {
  const pos = ["QB", "RB", "WR", "TE"].includes(sp.pos ?? "") ? sp.pos! : "ALL";
  const all = rookieReport(ctx);
  const rows = all.filter((r) => pos === "ALL" || r.pos === pos);
  const season = Number(ctx.league.season);
  const chip = (on: boolean) => cx("rounded-full border px-3 py-1.5 text-xs font-semibold", on ? "border-acc bg-acc text-on-acc" : "border-line text-muted hover:text-fg");
  const gradeStyle: Record<string, string> = { A: "bg-acc text-on-acc", B: "border border-acc-ink text-acc-ink", C: "border border-line text-fg", D: "bg-panel2 text-muted" };
  const best = (p: string) => all.find((r) => r.pos === p);
  const valueLabel = ctx.valuationMode === "dynasty" ? "dynasty value" : "trade value";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)}`} title="Rookie Report"
        info={<>The {season} rookie class on NFL rosters (drafted, or has played). The model starts with <b>draft capital</b> — where the NFL picked him is the best single predictor of a rookie&apos;s career — then checks what his team is doing with him. Scored against rookies <b>at his own position</b>: 35% draft capital (overall pick) · 25% role (snap share, last 3 games; QBs: share of team dropbacks) · 25% opportunity &amp; production (expected points from his touches and targets, plus points per game in your scoring) · 10% age (younger = more runway) · 5% landing spot (his offense&apos;s scoring rank). Grade A = 70+, B = 50+, C = 30+, D below. Tap a grade for the breakdown. {valueLabel[0].toUpperCase() + valueLabel.slice(1)} is shown separately, not used in the grade.</>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["QB", "RB", "WR", "TE"].map((p) => {
          const r = best(p);
          return (
            <div key={p} className="rounded-xl border border-line bg-panel p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Highest-graded rookie {p}</div>
              {r ? <><PlayerLink id={r.id} name={r.name} className="mt-1 block text-lg font-bold" /><div className="text-xs text-muted">{r.team} · {r.draft}</div><div className="text-xs text-muted">{r.games ? `${r.ppg.toFixed(1)} pts/g over ${r.games} games` : "No games yet"} · score {r.score}</div></> : <div className="mt-1 text-sm text-muted">None yet</div>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {["ALL", "QB", "RB", "WR", "TE"].map((p) => <Link key={p} href={`/rookies/?pos=${p}`} className={chip(pos === p)}>{p === "ALL" ? "All rookies" : p}</Link>)}
      </div>

      <Card title={`${season} class`} info={<>This year&apos;s rookies graded against other rookies at their position: draft capital, athletic testing, opportunity and production so far.</>} pad={false}>
        <div className="hidden grid-cols-[2rem_minmax(0,1.6fr)_2.5rem_5rem_3.5rem_4rem_6rem_minmax(0,1fr)] gap-x-3 border-b border-line px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted md:grid">
          <span>#</span><span>Rookie</span><span>Grade</span><span>Drafted</span><span className="text-right">Pts/g</span><span className="text-right">Snaps</span><span className="text-right">Production</span><span>Owner</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className={cx("px-3 py-2.5 md:grid md:grid-cols-[2rem_minmax(0,1.6fr)_2.5rem_5rem_3.5rem_4rem_6rem_minmax(0,1fr)] md:items-center md:gap-x-3 md:px-5", r.mine && "bg-acc-soft")}>
              <span className="num hidden text-sm font-bold text-muted md:block">{r.rankInClass}</span>
              <div className="flex min-w-0 items-center gap-2.5">
                <PlayerImg id={r.id} name={r.name} pos={r.pos} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><PlayerLink id={r.id} name={r.name} className="font-semibold" /><InjuryChip status={r.injury} /><GradeBtn r={r} cls={cx("ml-auto w-7 shrink-0 md:hidden", gradeStyle[r.grade])} /></div>
                  <div className="flex items-center gap-1 truncate text-xs text-muted"><NflLogo team={r.team} size={12} />{r.pos} · {r.team}{r.age ? ` · age ${Math.floor(r.age)}` : ""} · {r.pos} #{r.posRankInClass} by grade<span className="md:hidden"> · {r.draft}</span></div>
                  <div className="truncate text-xs md:hidden">{r.games ? `${r.ppg.toFixed(1)} pts/g · ${r.games} G` : "No games yet"}{r.snapL3 !== null ? ` · ${Math.round(r.snapL3 * 100)}% snaps` : ""}{r.yards ? ` · ${r.yards} ${r.yardsLabel}` : ""}{r.td ? ` · ${r.td} TD` : ""}</div>
                  <div className="flex flex-wrap gap-x-2 text-[11px] md:hidden"><span className={r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "text-muted"}>{r.owner}</span><span className="text-muted">{r.notes[0] ?? ""}</span></div>
                </div>
              </div>
              <GradeBtn r={r} cls={cx("hidden w-7 md:inline-block", gradeStyle[r.grade])} />
              <span className="hidden text-xs md:block">{r.draft}</span>
              <span className="num hidden text-right md:block">{r.games ? r.ppg.toFixed(1) : "—"}</span>
              <span className="num hidden text-right md:block">{r.snapL3 !== null ? `${Math.round(r.snapL3 * 100)}%` : "—"}</span>
              <span className="num hidden text-right text-xs md:block">{r.yards ? `${r.yards} ${r.pos === "QB" ? "pass" : ""} yds` : "—"}{r.td ? ` · ${r.td} TD` : ""}</span>
              <div className="hidden min-w-0 text-xs md:block"><div className={cx("truncate", r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "text-muted")}>{r.owner}</div><div className="truncate text-[11px] text-muted">{r.notes.join(" ")}</div></div>
            </li>
          ))}
          {rows.length === 0 && <li className="px-5 py-4 text-sm text-muted">No rookies at this position yet.</li>}
        </ul>
      </Card>

      <Card title={`${season + 1} prospects`} info={<>Next year&apos;s incoming class where data exists (draft projections are not available until spring).</>}>
        <p className="text-sm leading-relaxed text-muted">College prospects for the {season + 1} class arrive once NFLverse publishes combine results and the draft in the spring. Fantasy HQ picks them up automatically.</p>
      </Card>
    </div>
  );
}

const PART_LABEL: Record<keyof RookieRow["parts"], [string, (r: RookieRow) => string]> = {
  capital: ["Draft capital", (r) => r.draft === "Undrafted" ? "Undrafted" : `Pick ${r.draft}`],
  role: ["Role", (r) => r.snapL3 === null ? "No snaps yet" : r.pos === "QB" ? `${Math.round(r.snapL3 * 100)}% of team dropbacks, last 3` : `${Math.round(r.snapL3 * 100)}% of snaps, last 3`],
  output: ["Opportunity & production", (r) => r.games ? `${r.ppg.toFixed(1)} pts/g${r.xfpg !== null ? ` · ${r.xfpg} expected pts/g from his touches` : ""}` : "Hasn't played"],
  age: ["Age", (r) => (r.age ? `${Math.floor(r.age)} years old` : "Unknown")],
  spot: ["Landing spot", (r) => `${r.team ?? "—"} offense`],
};

/** Grade badge; tap for how the score was built. */
function GradeBtn({ r, cls }: { r: RookieRow; cls: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("rounded py-0.5 text-center text-xs font-extrabold", cls)} aria-label={`Grade ${r.grade}, score ${r.score}. Tap for breakdown`}>{r.grade}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${r.name} · grade ${r.grade}`} sub={`Score ${r.score}/100 · ${r.pos} #${r.posRankInClass} in the class`}>
        <ul className="flex flex-col gap-3 pb-4">
          {(Object.keys(ROOKIE_WEIGHTS) as (keyof RookieRow["parts"])[]).map((k) => (
            <li key={k} className="text-sm">
              <div className="flex items-center justify-between"><b>{PART_LABEL[k][0]} <span className="text-xs font-normal text-muted">· {Math.round(ROOKIE_WEIGHTS[k] * 100)}% of grade</span></b><span className="num font-bold">{Math.round(r.parts[k] * 100)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-panel2"><div className="h-2 rounded-full bg-acc" style={{ width: `${Math.round(r.parts[k] * 100)}%` }} /></div>
              <div className="mt-0.5 text-xs text-muted">{PART_LABEL[k][1](r)}</div>
            </li>
          ))}
          <li className="text-xs text-muted">Each part is 0–100 against rookies at his position (draft capital and age on fixed scales). {r.notes.join(" ")}</li>
        </ul>
      </Sheet>
    </>
  );
}
