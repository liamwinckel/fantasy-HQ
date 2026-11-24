"use client";

import type { GameView, TeamWeek, WeekLine } from "@/lib/services/views";
import { Bar, InjuryChip, Logo, NflLogo, cx, WinBar } from "./ui";
import { TeamLink } from "./TeamPeek";
import { useState } from "react";
import { PlayerLink } from "./PlayerCard";
import { PlayerImg } from "./client";

const slotLabel = (s: string) => s.replace("SUPER_FLEX", "SFLX").replace("IDP_FLEX", "IDP").replace("WRRB_FLEX", "W/R").replace("REC_FLEX", "W/T");

function points(l: WeekLine, kind: GameView["kind"]): { main: string; sub: string | null; projected?: boolean } {
  if (kind === "past") return { main: (l.actual ?? 0).toFixed(1), sub: null };
  if (kind === "current") return l.actual !== null && l.actual !== 0
    ? { main: l.actual.toFixed(1), sub: l.proj !== null ? `proj ${l.proj.toFixed(1)}` : null }
    : { main: l.proj !== null ? l.proj.toFixed(1) : "—", sub: null, projected: true };
  return { main: l.proj !== null ? l.proj.toFixed(1) : "—", sub: null, projected: true };
}
/** "Drake Maye" → "D. Maye" on small screens. */
const shortName = (n: string) => { const [f, ...r] = n.split(" "); return r.length ? `${f[0]}. ${r.join(" ")}` : n; };

function Cell({ l, kind, align }: { l: WeekLine | undefined; kind: GameView["kind"]; align: "left" | "right" }) {
  if (!l) return <div className="flex-1" />;
  const p = points(l, kind);
  const right = align === "right";
  return (
    <div className={cx("flex min-w-0 flex-1 items-center gap-2", right && "flex-row-reverse text-right")}>
      <span className="hidden sm:block">{l.playerId ? <PlayerImg id={l.playerId} name={l.name} pos={l.pos} size={30} /> : <span className="block h-[30px] w-[30px] shrink-0 rounded-full border border-dashed border-line" />}</span>
      <div className="min-w-0 flex-1">
        <div className={cx("flex items-center gap-1 text-xs font-semibold sm:text-sm", right && "flex-row-reverse")}>
          {l.playerId ? <><PlayerLink id={l.playerId} name={shortName(l.name)} className="sm:hidden" /><PlayerLink id={l.playerId} name={l.name} className="hidden sm:inline" /></> : <span className="truncate text-muted">{l.name}</span>}
          <InjuryChip status={l.injury} />
        </div>
        <div className={cx("flex items-center gap-1 truncate text-[10px] text-muted sm:text-[11px]", right && "flex-row-reverse")}><NflLogo team={l.team} size={11} /><span className="truncate">{l.team ?? l.pos}{l.note ? ` · ${l.note}` : ""}</span></div>
      </div>
      <div className="w-10 shrink-0 sm:w-12">
        <div className={cx("num text-sm font-bold", p.projected && "text-muted")}>{p.main}</div>
        {p.sub && <div className="num text-[10px] text-muted">{p.sub}</div>}
      </div>
    </div>
  );
}

function Head({ t, kind, align }: { t: TeamWeek | null; kind: GameView["kind"]; align: "left" | "right" }) {
  if (!t) return <div className="flex-1 p-3 text-center text-xs text-muted">No opponent (bye or bracket)</div>;
  const notStarted = kind === "current" && !t.actual;
  const total = kind === "future" || notStarted ? t.projected : t.actual;
  return (
    <div data-team={t.rosterId} className={cx("flex min-w-0 flex-1 cursor-pointer flex-col gap-1 px-3 py-3", align === "right" ? "items-end text-right" : "items-start")}>
      <TeamLink rosterId={t.rosterId} name={t.name} avatar={t.avatar} size={24} className="max-w-full text-sm font-semibold" />
      <div className="num font-[family-name:var(--font-display)] text-3xl font-bold leading-none sm:text-4xl">{total !== null ? total.toFixed(1) : "—"}</div>
      <div className="text-[10px] text-muted">{kind === "past" ? "Final" : kind === "future" ? "Projected · best lineup" : notStarted ? "Projected" : `Live · proj ${t.projected?.toFixed(1) ?? "—"}`}</div>
    </div>
  );
}

/** Both lineups side by side, slot by slot (like the Sleeper matchup screen), on any screen size. */
export function MatchupBoard({ g }: { g: GameView }) {
  const [bench, setBench] = useState(false);
  const n = Math.max(g.a.starters.length, g.b?.starters.length ?? 0);
  const nb = Math.max(g.a.bench.length, g.b?.bench.length ?? 0);
  return (
    <div>
      <div className="flex divide-x divide-line border-b border-line">
        <Head t={g.a} kind={g.kind} align="left" />
        <Head t={g.b} kind={g.kind} align="right" />
      </div>
      <ul className="divide-y divide-line">
        {Array.from({ length: n }, (_, i) => (
          <li key={i} className="flex items-center gap-1.5 px-2 py-2 sm:gap-3 sm:px-4">
            <Cell l={g.a.starters[i]} kind={g.kind} align="left" />
            <span className="w-9 shrink-0 rounded bg-panel2 py-0.5 text-center text-[9px] font-extrabold sm:w-11 sm:text-[10px]">{slotLabel(g.a.starters[i]?.slot ?? g.b?.starters[i]?.slot ?? "")}</span>
            <Cell l={g.b?.starters[i]} kind={g.kind} align="right" />
          </li>
        ))}
      </ul>
      {nb > 0 && (
        <>
          <button type="button" onClick={() => setBench(!bench)} className="flex w-full items-center justify-center gap-1 border-t border-line py-2 text-xs font-semibold text-muted hover:text-fg">
            {bench ? "Hide benches" : "Show benches"}
          </button>
          {bench && (
            <ul className="divide-y divide-line border-t border-line bg-panel2/40">
              {Array.from({ length: nb }, (_, i) => (
                <li key={i} className="flex items-center gap-1.5 px-2 py-2 sm:gap-3 sm:px-4">
                  <Cell l={g.a.bench[i]} kind={g.kind} align="left" />
                  <span className="w-9 shrink-0 text-center text-[9px] font-bold text-muted sm:w-11">BN</span>
                  <Cell l={g.b?.bench[i]} kind={g.kind} align="right" />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="border-t border-line px-4 py-3">
        {g.kind === "past" && g.result && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className={cx("rounded px-2 py-0.5 text-xs font-extrabold", g.result === "W" ? "bg-pos text-black" : g.result === "L" ? "bg-neg text-white" : "bg-panel2")}>{g.result === "W" ? "WIN" : g.result === "L" ? "LOSS" : "TIE"}</span>
            {g.a.bestPossible !== null && g.a.actual !== null && (
              <span className="text-muted">Best possible lineup: <b className="text-fg">{g.a.bestPossible.toFixed(1)}</b> · points left on bench: <b className={g.a.bestPossible - g.a.actual > 10 ? "text-warn" : "text-fg"}>{(g.a.bestPossible - g.a.actual).toFixed(1)}</b></span>
            )}
          </div>
        )}
        {g.kind !== "past" && g.winProbA !== null && (
          <div className="flex items-center gap-3 text-sm">
            <span className="shrink-0 text-xs text-muted">{g.a.name} win chance</span>
            <WinBar pct={g.winProbA} />
            <span className="num w-12 text-right font-bold">{g.winProbA.toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
