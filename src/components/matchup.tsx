"use client";

import type { GameView, TeamWeek, WeekLine } from "@/lib/services/views";
import { Bar, InjuryChip, Logo, NflLogo, cx } from "./ui";
import { TeamLink } from "./TeamPeek";
import { PlayerLink } from "./PlayerCard";
import { PlayerImg } from "./client";

const slotLabel = (s: string) => s.replace("SUPER_FLEX", "SFLX").replace("IDP_FLEX", "IDP").replace("WRRB_FLEX", "W/R").replace("REC_FLEX", "W/T");

function points(l: WeekLine, kind: GameView["kind"]) {
  if (kind === "past") return { main: (l.actual ?? 0).toFixed(1), sub: null };
  if (kind === "current") return { main: l.actual !== null && l.actual !== 0 ? l.actual.toFixed(1) : "—", sub: l.proj !== null ? `proj ${l.proj.toFixed(1)}` : null };
  return { main: l.proj !== null ? l.proj.toFixed(1) : "—", sub: null };
}

function Side({ t, kind, align }: { t: TeamWeek | null; kind: GameView["kind"]; align: "left" | "right" }) {
  if (!t) return <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">No opponent this week (playoff bracket or bye).</div>;
  const notStarted = kind === "current" && !t.actual;
  const total = kind === "future" || notStarted ? t.projected : t.actual;
  return (
    <div className="min-w-0 flex-1">
      <div className={cx("flex items-end justify-between gap-2 border-b border-line px-4 py-3", align === "right" && "flex-row-reverse text-right")}>
        <div className="min-w-0">
          <div className={cx("flex items-center gap-2 font-semibold", align === "right" && "flex-row-reverse")}><TeamLink rosterId={t.rosterId} name={t.name} avatar={t.avatar} size={26} /></div>
          <div className="text-[11px] text-muted">{kind === "past" ? "Final score" : notStarted ? "Projected · games not started" : kind === "current" ? `Live · projected ${t.projected?.toFixed(1) ?? "—"}` : "Projected best lineup"}</div>
        </div>
        <div className="num font-[family-name:var(--font-display)] text-4xl font-bold leading-none">{total !== null ? total.toFixed(1) : "—"}</div>
      </div>
      <ul className="divide-y divide-line">
        {t.starters.map((l, i) => {
          const p = points(l, kind);
          return (
            <li key={i} className={cx("flex items-center gap-2 px-4 py-2", align === "right" && "flex-row-reverse text-right")}>
              <span className="w-10 shrink-0 rounded bg-panel2 py-0.5 text-center text-[10px] font-extrabold">{slotLabel(l.slot)}</span>
              {l.playerId ? <PlayerImg id={l.playerId} name={l.name} pos={l.pos} size={30} /> : <span className="h-[30px] w-[30px] shrink-0 rounded-full border border-dashed border-line" />}
              <div className="min-w-0 flex-1">
                <div className={cx("flex items-center gap-1 text-sm font-medium", align === "right" && "justify-end")}>
                  {l.playerId ? <PlayerLink id={l.playerId} name={l.name} /> : <span className="truncate">{l.name}</span>}
                  <InjuryChip status={l.injury} />
                </div>
                <div className={cx("flex items-center gap-1 truncate text-[11px] text-muted", align === "right" && "justify-end")}><NflLogo team={l.team} size={12} />{l.pos}{l.team ? ` · ${l.team}` : ""}{l.note ? ` · ${l.note}` : ""}</div>
              </div>
              <div className="w-14 shrink-0">
                <div className="num text-sm font-bold">{p.main}</div>
                {p.sub && <div className="num text-[10px] text-muted">{p.sub}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MatchupBoard({ g }: { g: GameView }) {
  return (
    <div>
      <div className="flex flex-col divide-y divide-line sm:flex-row sm:divide-x sm:divide-y-0">
        <Side t={g.a} kind={g.kind} align="left" />
        <Side t={g.b} kind={g.kind} align="right" />
      </div>
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
            <span className="w-32 shrink-0 text-xs text-muted">Your win chance</span>
            <Bar value={g.winProbA} color={g.winProbA >= 50 ? "bg-acc" : "bg-muted"} />
            <span className="num w-12 text-right font-bold">{g.winProbA.toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
