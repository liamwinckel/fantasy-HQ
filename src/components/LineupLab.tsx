"use client";
import { Sparkline, TREND_MAX } from "./charts";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";
import { PlayerImg, PlayerPhoto, Segmented } from "@/components/client";
import { Roll } from "./motion";
import { Card, InjuryChip, NflLogo, cx, signed } from "@/components/ui";
import { PlayerLink } from "@/components/PlayerCard";
import type { Swap, TeamWeek, WeekLine } from "@/lib/services/views";

export interface LabPlayer {
  id: string; name: string; pos: string; team: string | null; injury: string | null;
  eligible: boolean[]; unavailable: string | null; locked: boolean;
  median: number; low: number; high: number; base: number; seasonAvg: number; last4: number; games: number;
  confidence: string; opp: string | null; onBye: boolean; matchup: number; usage: number; notes: string[];
  snapL3: number[] | null; recent: { week: number; pts: number }[]; actual?: number | null;
  /** Last 6 games and this league's startable line at his position (for the trend line). */
  trend?: number[]; trendRef?: number;
  /** SHS AI ±% vs expert rank this week. */
  ai?: number | null;
  /** Chance of a big week / a dud (position thresholds). */
  boom?: number; bust?: number;
}

type View = "current" | "optimal";
const short = (slot: string) => slot.replace("SUPER_FLEX", "SFLX").replace("IDP_FLEX", "IDP").replace("WRRB_FLEX", "W/R").replace("REC_FLEX", "W/T");
/** Same columns for the header and every row, so titles sit over their numbers. */
const GRID = "grid grid-cols-[3.25rem_2.25rem_minmax(0,1fr)_3.5rem] items-center gap-x-2.5 sm:grid-cols-[3.5rem_2.25rem_minmax(0,1fr)_11rem_3.5rem] sm:gap-x-3";

/**
 * FLIP: after a swap, rows glide from where they were to where they are now. Only runs when `armed`
 * (a swap just happened); switching Current/Optimal cross-fades instead. All reads happen before any
 * writes, so there's a single layout pass and no stutter.
 */
function useFlip(deps: unknown[], armed: React.MutableRefObject<boolean>) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const nodes = [...el.querySelectorAll<HTMLElement>("[data-flip]")];
    const now = new Map(nodes.map((n) => [n.dataset.flip!, n.getBoundingClientRect().top]));
    if (armed.current) {
      armed.current = false;
      const moves: HTMLElement[] = [];
      for (const n of nodes) {
        const before = last.current.get(n.dataset.flip!);
        const dy = before === undefined ? 0 : before - now.get(n.dataset.flip!)!;
        if (Math.abs(dy) < 1) continue;
        n.style.transition = "none";
        n.style.transform = `translateY(${dy}px)`;
        n.style.position = "relative";
        n.style.zIndex = "2";
        moves.push(n);
      }
      if (moves.length) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const n of moves) { n.style.transition = "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)"; n.style.transform = ""; }
          setTimeout(() => { for (const n of moves) { n.style.transition = ""; n.style.zIndex = ""; } }, 460);
        }));
      }
    }
    last.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return box;
}

export function LineupLab({ slots, players, current, optimal, swaps, rosterSlots, week, onTotal, opponent, opponentBest, header, live = false, myName = "You", sim }: {
  slots: string[]; players: LabPlayer[]; current: (string | null)[]; optimal: (string | null)[]; swaps: Swap[]; rosterSlots: string; week: number; onTotal?: (t: number) => void;
  opponent?: TeamWeek | null; live?: boolean; myName?: string;
  /** Opponent's own best lineup this week (null when it can't differ, e.g. future weeks already assume it). */
  opponentBest?: TeamWeek | null;
  /** Score + win chance block shown at the top of the same card (head-to-head view), given the totals on screen. */
  header?: (t: { mine: number; opp: number | null }) => React.ReactNode;
  /** Matchup simulator for the lineup on screen; `apply` puts a lineup on screen. */
  sim?: (lineup: (string | null)[], apply: (l: (string | null)[]) => void, opponent: TeamWeek | null) => React.ReactNode;
}) {
  const [view, setView] = useState<View>("current");
  const [oppView, setOppView] = useState<View>("current");
  const oppTotal = (t: TeamWeek | null | undefined) => (t ? Math.round(t.starters.reduce((a, l) => a + (l.proj ?? 0), 0) * 10) / 10 : 0);
  const oppGain = opponent && opponentBest ? oppTotal(opponentBest) - oppTotal(opponent) : 0;
  const oppShown = oppView === "optimal" && opponentBest ? opponentBest : opponent ?? null;
  const oppChanged = (i: number) => oppView === "optimal" && !!opponent && !!oppShown?.starters[i]?.playerId && !opponent.starters.some((l) => l.playerId === oppShown.starters[i].playerId);
  const [mine, setMine] = useState<(string | null)[]>(current);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const lineup = view === "current" ? mine : optimal;
  const total = (l: (string | null)[]) => Math.round(l.reduce((a, id) => a + (id ? byId.get(id)?.median ?? 0 : 0), 0) * 10) / 10;
  const curTotal = total(current);
  const optTotal = total(optimal);
  const shownTotal = total(lineup);
  const edited = mine.some((x, i) => x !== current[i]);
  useEffect(() => { onTotal?.(shownTotal); }, [shownTotal, onTotal]);
  const starters = new Set(lineup.filter(Boolean) as string[]);
  const bench = players.filter((p) => !starters.has(p.id)).sort((a, b) => b.median - a.median);
  const currentSet = new Set(current.filter(Boolean) as string[]);
  const changed = (i: number) => !!lineup[i] && !currentSet.has(lineup[i]!);
  const [slotOpen, setSlotOpen] = useState<number | null>(null);
  const armed = useRef(false);
  const box = useFlip([lineup, view], armed);

  /** Put a player in slot i; whoever was there takes his old slot if eligible, otherwise goes to the bench. */
  const place = (i: number, pid: string | null) => {
    const base = [...lineup];
    const from = pid ? base.indexOf(pid) : -1;
    const occupant = base[i];
    base[i] = pid;
    if (from >= 0) base[from] = occupant && byId.get(occupant)?.eligible[from] ? occupant : null;
    armed.current = view === "current";
    setMine(base);
    setView("current");
    setSlotOpen(null);
  };

  // Start/sit: any starter vs any rostered player who can play that slot.
  const firstSwap = swaps[0];
  const [aId, setAId] = useState<string | null>(firstSwap?.outId ?? (lineup.find(Boolean) ?? null));
  const aSlot = aId ? lineup.indexOf(aId) : -1;
  const bOptions = players.filter((p) => p.id !== aId && !p.unavailable && (aSlot < 0 || p.eligible[aSlot]));
  const [bPick, setBPick] = useState<string | null>(firstSwap?.inId ?? null);
  const bId = bPick && bOptions.some((p) => p.id === bPick) ? bPick : [...bOptions].sort((x, y) => y.median - x.median)[0]?.id ?? null;
  const A = aId ? byId.get(aId) : undefined;
  const B = bId ? byId.get(bId) : undefined;
  const better = A && B ? (B.median > A.median ? B : A) : undefined;
  const [pickSide, setPickSide] = useState<"a" | "b" | null>(null);

  const row = (key: string, p: LabPlayer | undefined, slotLabel: React.ReactNode, i: number | null, isNew = false) => (
    <div key={key} data-flip={key} className={cx(GRID, "relative border-b border-line bg-panel px-3 py-2 transition-colors duration-300 sm:px-5", isNew && "bg-acc-soft")}>
      {slotLabel}
      {p ? <PlayerImg id={p.id} name={p.name} pos={p.pos} /> : <span className="h-9 w-9 rounded-full border border-dashed border-neg" />}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          {p ? <PlayerLink id={p.id} name={p.name} /> : <span className="text-muted">Empty slot</span>}
          {p && <InjuryChip status={p.injury} />}
          {p?.locked && <Lock size={12} className="shrink-0 text-muted" aria-label="Game started" />}
        </div>
        <div className="flex items-center gap-1 truncate text-xs text-muted">
          {p && (p.trend?.length ?? 0) >= 3 && <Sparkline values={p.trend!} width={40} height={14} max={TREND_MAX[p.pos] ?? 30} refLine={p.trendRef} label={`Last ${p.trend!.length} games: ${p.trend!.map((v) => v.toFixed(1)).join(", ")}; dashed = startable line`} />}
          {p && <NflLogo team={p.team} size={13} />}
          <span className="truncate">{p ? `${p.pos}${p.team ? ` · ${p.team}` : ""} · ${p.unavailable ?? (p.onBye ? "BYE" : p.opp ? `vs ${p.opp}` : "no game")}${i !== null && p.matchup !== 1 ? ` · ${signed((p.matchup - 1) * 100, 0)}%` : ""}` : ""}</span>
        </div>
      </div>
      <div className="hidden sm:block">{p && p.high > 0 && <RangeBar low={p.low} med={p.median} high={p.high} />}</div>
      <div className="text-right">
        <div className="num font-bold">{p ? p.median.toFixed(1) : "0.0"}</div>
        {isNew && <div className="text-[10px] font-semibold text-pos">new</div>}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {opponent ? (
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-panel lg:flex-[3]">
          {header?.({ mine: shownTotal, opp: oppView === "optimal" && opponentBest ? oppTotal(opponentBest) : null })}
          <div key={`${view}:${oppView}`} className="qa-fade-in"><Versus slots={slots} lineup={lineup} bench={bench} byId={byId} opponent={oppShown ?? opponent} oppChanged={oppChanged} live={live} changed={changed} onSlot={setSlotOpen} boxRef={box}
            left={<SideToggle name={myName} value={view} onChange={setView} gain={optTotal - curTotal} edited={edited} onReset={() => setMine(current)} />}
            right={<SideToggle name={opponent.name} value={oppView} onChange={setOppView} gain={oppGain} disabled={!opponentBest} align="right" />} /></div>
        </section>
        ) : (
        <Card pad={false} className="min-w-0 overflow-hidden lg:flex-[3]" title={`Your lineup · Week ${week}`}
          right={<Segmented label="Lineup view" value={view} onChange={(v) => setView(v)} options={[{ value: "current", label: edited ? "Yours" : "Current" }, { value: "optimal", label: "Optimal" }]} />}
          info={<>Tap a position (QB, RB…) to choose who plays there; the player you replace moves to the bench, or swaps slots if he can play the other one. <b>Proj</b> = Sleeper&apos;s projection in your scoring. <b>Range</b> = floor (1 week in 10 is worse) · projection · ceiling (1 in 10 is better), from his own week-to-week swings and, when he has them, betting-market lines. Matchup % = how many more (+) or fewer (−) points this opponent allows to the position. Trend line = his last 6 games on the same scale for every player at his position; dashed = the startable line there; end dot green if his latest game cleared it. Slots: {rosterSlots}. Nothing here changes Sleeper.</>}>
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs sm:px-5">
            <span className="text-muted">{view === "optimal" ? "Optimal lineup" : edited ? "Your changes" : "Set in Sleeper"}: <b className="num text-fg">{shownTotal.toFixed(1)}</b> pts</span>
            {view === "current" && optTotal - shownTotal > 0.05 && <span className="font-semibold text-acc-ink">Optimal is {signed(optTotal - shownTotal)}</span>}
            {view === "optimal" && <span className="font-semibold text-acc-ink">{signed(optTotal - curTotal)} vs current</span>}
            {edited && view === "current" && <button type="button" onClick={() => setMine(current)} className="font-semibold text-muted underline">Reset</button>}
          </div>
          <>
          <div className={cx(GRID, "border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-5")}>
            <span>Slot</span><span /><span>Player</span><span className="hidden sm:block">Floor · proj · ceiling</span><span className="text-right">Proj</span>
          </div>
          <div ref={box} key={view} className="qa-fade-in">
            {slots.map((slot, i) => {
              const p = lineup[i] ? byId.get(lineup[i]!) : undefined;
              const canEdit = !p?.locked;
              return row(p ? p.id : `empty-${i}`, p, (
                <button type="button" disabled={!canEdit} onClick={() => setSlotOpen(i)} aria-label={`Choose who plays ${slot}`}
                  className={cx("rounded-md py-1.5 text-center text-[11px] font-extrabold transition-transform", canEdit ? "bg-acc text-on-acc active:scale-90" : "bg-panel2 text-muted")}>{short(slot)}</button>
              ), i, changed(i));
            })}
            <div className="border-b border-line bg-panel2/50 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Bench</div>
            {bench.map((b) => row(b.id, b, <span className="rounded-md bg-panel2 py-1.5 text-center text-[11px] font-bold text-muted">{b.unavailable === "IR slot" ? "IR" : b.unavailable === "Taxi" ? "TAXI" : "BN"}</span>, null))}
          </div>
          </>
        </Card>
        )}

        <div className="flex min-w-0 flex-col gap-4 lg:flex-[2]">
          {sim?.(lineup, (l) => { armed.current = true; setMine(l); setView("current"); }, oppShown)}
          <Card title="Who should I start?" info={<>Pick any starter and anyone who could play his slot. Each player&apos;s week is a range: floor (1 week in 10 worse), projection, ceiling (1 in 10 better). <b>% to outscore</b> = how often he beats the other one, from those ranges. Tap a player to swap him for someone else.</>}>
            {(() => {
              // Chance B outscores A, treating each week as a normal range (floor/ceiling ≈ 10th/90th percentiles).
              const sd = (p: LabPlayer) => Math.max(1, (p.high - p.low) / 2.563);
              const pB = A && B ? phi((B.median - A.median) / Math.sqrt(sd(A) ** 2 + sd(B) ** 2)) * 100 : 50;
              const maxC = Math.max(25, A?.high ?? 0, B?.high ?? 0);
              const card = (p: LabPlayer | undefined, pct: number, win: boolean, onTap: () => void, label: string) => (
                <button type="button" onClick={onTap} aria-label={`${label}: ${p?.name ?? "choose"}. Tap to change`}
                  className={cx("relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-transform active:scale-[0.98]", win ? "border-acc bg-acc-soft" : "border-line bg-panel2/40")}>
                  <span className="absolute left-2 top-2 text-[9px] font-bold uppercase tracking-wider text-muted">{label}</span>
                  {win && <span className="absolute right-2 top-2 rounded-full bg-acc px-2 py-0.5 text-[10px] font-extrabold uppercase text-on-acc">Start</span>}
                  {p ? <>
                    <span className="mt-4"><PlayerPhoto id={p.id} name={p.name} pos={p.pos} size={64} /></span>
                    <span className="flex max-w-full items-center justify-center gap-1 truncate text-sm font-bold">{p.name}<InjuryChip status={p.injury} /></span>
                    <span className="flex items-center gap-1 text-[11px] text-muted"><NflLogo team={p.team} size={12} />{p.pos} · {p.onBye ? "BYE" : p.opp ? `vs ${p.opp}` : "no game"}</span>
                    <span className={cx("num h-display text-3xl leading-none", win && "text-acc-ink")}><Roll text={`${Math.round(pct)}%`} /></span>
                    <span className="text-[10px] text-muted">to outscore · proj <b className="num text-fg">{p.median.toFixed(1)}</b></span>
                  </> : <span className="py-10 text-sm text-muted">Choose a player</span>}
                </button>
              );
              return (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    {card(A, 100 - pB, !!A && !!B && pB < 50, () => setPickSide("a"), "Starter")}
                    {card(B, pB, !!A && !!B && pB >= 50, () => setPickSide("b"), `vs · ${aSlot >= 0 ? short(slots[aSlot]) : "slot"}`)}
                  </div>
                  {A && B && (
                    <>
                      <div className="mt-4 flex flex-col gap-3">
                        {[A, B].map((p) => (
                          <div key={p.id}>
                            <div className="mb-1 flex items-center justify-between text-xs"><span className="flex min-w-0 items-center gap-1.5"><PlayerPhoto id={p.id} name={p.name} pos={p.pos} size={20} /><b className="truncate">{p.name}</b></span><span className="num text-muted">Boom {p.boom ?? "—"}% · Bust {p.bust ?? "—"}%</span></div>
                            <div className="relative h-3 rounded-full bg-panel2">
                              <div className={cx("absolute inset-y-0 rounded-full", p.id === better!.id ? "bg-acc/50" : "bg-muted/40")} style={{ left: `${(p.low / maxC) * 100}%`, width: `${((p.high - p.low) / maxC) * 100}%` }} />
                              <div className={cx("absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg", p.id === better!.id ? "bg-acc" : "bg-fg")} style={{ left: `${(p.median / maxC) * 100}%` }} />
                            </div>
                            <div className="num mt-0.5 flex justify-between text-[10px] text-muted"><span>Floor {p.low.toFixed(1)}</span><span>Ceiling {p.high.toFixed(1)}</span></div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 rounded-lg bg-acc-soft px-3 py-2.5 text-sm leading-relaxed">
                        <strong className="text-acc-ink">Start {better!.name}</strong> ({signed(Math.abs(B.median - A.median))} projected{Math.abs(pB - 50) < 8 ? "; close call" : ""}).{" "}
                        {better!.notes.slice(0, 2).join(" ")}
                        {B.id === better!.id && !lineup.includes(B.id) && aSlot >= 0 && <button type="button" className="ml-1 font-semibold text-acc-ink underline" onClick={() => place(aSlot, B.id)}>Put him in</button>}
                      </div>
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-xs font-semibold text-muted">Full comparison</summary>
                        <div className="mt-2"><Compare a={A} b={B} /></div>
                      </details>
                    </>
                  )}
                </>
              );
            })()}
          </Card>
        </div>
      </div>

      {pickSide && (
        <PickSheet title={pickSide === "a" ? "Pick a starter" : `Who could play ${aSlot >= 0 ? short(slots[aSlot]) : "there"}?`}
          options={pickSide === "a" ? (lineup.filter(Boolean) as string[]).map((id) => byId.get(id)!).filter(Boolean) : [...bOptions].sort((x, y) => y.median - x.median)}
          onPick={(id) => { if (pickSide === "a") { setAId(id); setBPick(null); } else setBPick(id); setPickSide(null); }} onClose={() => setPickSide(null)} />
      )}
      {slotOpen !== null && (
        <SlotSheet slot={slots[slotOpen]} index={slotOpen} lineup={lineup} players={players} byId={byId} onPick={(pid) => place(slotOpen, pid)} onClose={() => setSlotOpen(null)} />
      )}
    </div>
  );
}

function RangeBar({ low, med, high }: { low: number; med: number; high: number }) {
  const max = 40;
  const pct = (x: number) => `${Math.min(100, (100 * x) / max)}%`;
  return (
    <div>
      <div className="relative h-3.5 rounded-full bg-panel2">
        <div className="absolute top-1 h-1.5 rounded-full bg-muted/50" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
        <div className="absolute top-0.5 h-2.5 w-1 rounded bg-acc" style={{ left: pct(med) }} />
      </div>
      <div className="num mt-0.5 text-[11px] text-muted">{low.toFixed(1)} · {med.toFixed(1)} · {high.toFixed(1)}</div>
    </div>
  );
}

function Compare({ a, b }: { a?: LabPlayer; b?: LabPlayer }) {
  const rows: [string, (p: LabPlayer) => string][] = [
    ["Projected pts", (p) => p.median.toFixed(1)],
    ["Floor / ceiling", (p) => `${p.low.toFixed(1)} / ${p.high.toFixed(1)}`],
    ["Boom / bust", (p) => (p.boom !== undefined ? `${p.boom}% / ${p.bust}%` : "—")],
    ["Avg pts, last 4 games", (p) => p.last4.toFixed(1)],
    ["Avg pts, season", (p) => `${p.seasonAvg.toFixed(1)} (${p.games} games)`],
    ["Snap %, last 3 games", (p) => (p.snapL3 ? p.snapL3.join(" · ") : "—")],
    ["Opponent · matchup", (p) => (p.onBye ? "BYE" : p.opp ? `${p.opp}${p.matchup !== 1 ? ` ${signed((p.matchup - 1) * 100, 0)}%` : ""}` : "—")],
    ["Usage vs season", (p) => (p.usage === 1 ? "Steady" : `${signed((p.usage - 1) * 100, 0)}%`)],
    ["Injury status", (p) => p.injury ?? "Healthy"],
    ["Projection confidence", (p) => p.confidence],
  ];
  return (
    <div className="grid grid-cols-[1.2fr_1fr_1fr] text-sm">
      <span />
      <span className="truncate pb-2 text-right font-bold">{a?.name ?? "Empty"}</span>
      <span className="truncate pb-2 text-right font-bold text-acc-ink">{b?.name} ✓</span>
      {rows.map(([k, f]) => (
        <div key={k} className="contents">
          <span className="border-t border-line py-1.5 text-muted">{k}</span>
          <span className="num border-t border-line py-1.5 text-right">{a ? f(a) : "—"}</span>
          <span className="num border-t border-line py-1.5 text-right font-semibold">{b ? f(b) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

/** Who should play this slot? Everyone on the roster who can, with the change in projected points. */
function SlotSheet({ slot, index, lineup, players, byId, onPick, onClose }: {
  slot: string; index: number; lineup: (string | null)[]; players: LabPlayer[]; byId: Map<string, LabPlayer>; onPick: (pid: string | null) => void; onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  const cur = lineup[index] ? byId.get(lineup[index]!) : undefined;
  const options = players.filter((p) => p.eligible[index] && !p.unavailable && !p.locked && p.id !== cur?.id).sort((a, b) => b.median - a.median);
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={`Choose who plays ${slot}`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="fhq-in relative w-full max-w-md rounded-t-2xl border border-line bg-bg p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl md:rounded-2xl">
        <div className="mb-3 flex items-center gap-3">
          <span className="rounded-md bg-acc px-2.5 py-1.5 text-sm font-extrabold text-on-acc">{short(slot)}</span>
          <div className="min-w-0 flex-1"><div className="h-display text-2xl">Who plays here?</div><div className="truncate text-xs text-muted">Now: {cur ? `${cur.name} · ${cur.median.toFixed(1)}` : "empty"}</div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-panel2 p-2"><X size={16} /></button>
        </div>
        <ul className="flex max-h-[55dvh] flex-col gap-1.5 overflow-y-auto">
          {options.map((p) => {
            const at = lineup.indexOf(p.id);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-left hover:border-acc">
                  <PlayerImg id={p.id} name={p.name} pos={p.pos} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><span className="truncate">{p.name}</span><InjuryChip status={p.injury} /></span>
                    <span className="block truncate text-xs text-muted">{p.pos} · {p.onBye ? "BYE" : p.opp ? `vs ${p.opp}` : "no game"}{at >= 0 ? " · starting (they swap)" : " · bench"}</span>
                  </span>
                  <span className="text-right"><span className="num block text-sm font-bold">{p.median.toFixed(1)}</span><span className={cx("num block text-[11px] font-semibold", p.median - (cur?.median ?? 0) >= 0 ? "text-pos" : "text-neg")}>{signed(p.median - (cur?.median ?? 0))}</span></span>
                </button>
              </li>
            );
          })}
          {cur && (
            <li><button type="button" onClick={() => onPick(null)} className="w-full rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-muted hover:text-fg">Bench {cur.name} (leave empty)</button></li>
          )}
          {options.length === 0 && !cur && <li className="text-sm text-muted">Nobody on your roster can play this slot.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

const shortName = (n: string) => { const [f, ...r] = n.split(" "); return r.length ? `${f[0]}. ${r.join(" ")}` : n; };

/** Both rosters side by side, slot by slot (like Sleeper). Your side is editable: tap the slot badge. */
function Versus({ slots, lineup, bench, byId, opponent, oppChanged, live, changed, onSlot, boxRef, left, right }: {
  slots: string[]; lineup: (string | null)[]; bench: LabPlayer[]; byId: Map<string, LabPlayer>; opponent: TeamWeek; oppChanged: (i: number) => boolean; live: boolean;
  left: React.ReactNode; right: React.ReactNode;
  changed: (i: number) => boolean; onSlot: (i: number) => void; boxRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [showBench, setShowBench] = useState(true);
  const mineCell = (p: LabPlayer | undefined, key: string, isNew = false) => {
    const started = live && p?.locked && p.actual !== null && p.actual !== undefined;
    return (
      <div data-flip={key} className={cx("flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5", isNew && "bg-acc-soft")}>
        <span className="hidden sm:block">{p ? <PlayerImg id={p.id} name={p.name} pos={p.pos} size={30} /> : <span className="block h-[30px] w-[30px] rounded-full border border-dashed border-neg" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1 text-xs font-semibold sm:text-sm">
            {p ? <><PlayerLink id={p.id} name={shortName(p.name)} className="sm:hidden" /><PlayerLink id={p.id} name={p.name} className="hidden sm:inline" /></> : <span className="text-muted">Empty</span>}
            {p && <InjuryChip status={p.injury} />}
          </div>
          <div className="flex items-center gap-1 truncate text-[10px] text-muted sm:text-[11px]">{p && (p.trend?.length ?? 0) >= 3 && <Sparkline values={p.trend!} width={30} height={12} max={TREND_MAX[p.pos] ?? 30} refLine={p.trendRef} label={`Last ${p.trend!.length} games: ${p.trend!.map((v) => v.toFixed(1)).join(", ")}; dashed = startable line`} />}{p && <NflLogo team={p.team} size={11} />}<span className="truncate">{p ? `${p.team ?? p.pos} ${p.onBye ? "BYE" : p.opp ? `v ${p.opp}` : ""}` : ""}</span></div>
        </div>
        <div className="w-10 shrink-0 text-right sm:w-12">
          <div className={cx("num text-sm font-bold", !started && "text-muted")}>{p ? (started ? p.actual!.toFixed(1) : p.median.toFixed(1)) : "—"}</div>
          {started && <div className="num text-[9px] text-muted">proj {p!.median.toFixed(1)}</div>}
        </div>
      </div>
    );
  };
  const oppCell = (l: WeekLine | undefined, isNew = false) => {
    if (!l) return <div className="flex-1" />;
    const started = live && l.actual !== null && l.actual !== 0;
    return (
      <div className={cx("flex min-w-0 flex-1 flex-row-reverse items-center gap-2 rounded-lg px-1 py-0.5 text-right", isNew && "bg-acc-soft")}>
        <span className="hidden sm:block">{l.playerId ? <PlayerImg id={l.playerId} name={l.name} pos={l.pos} size={30} /> : <span className="block h-[30px] w-[30px] rounded-full border border-dashed border-line" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-row-reverse items-center gap-1 text-xs font-semibold sm:text-sm">
            {l.playerId ? <><PlayerLink id={l.playerId} name={shortName(l.name)} className="sm:hidden" /><PlayerLink id={l.playerId} name={l.name} className="hidden sm:inline" /></> : <span className="text-muted">{l.name}</span>}
            <InjuryChip status={l.injury} />
          </div>
          <div className="flex flex-row-reverse items-center gap-1 truncate text-[10px] text-muted sm:text-[11px]"><NflLogo team={l.team} size={11} /><span className="truncate">{l.team ?? l.pos} {l.note}</span></div>
        </div>
        <div className="w-10 shrink-0 text-left sm:w-12">
          <div className={cx("num text-sm font-bold", !started && "text-muted")}>{started ? l.actual!.toFixed(1) : l.proj !== null ? l.proj.toFixed(1) : "—"}</div>
          {started && l.proj !== null && <div className="num text-[9px] text-muted">proj {l.proj.toFixed(1)}</div>}
        </div>
      </div>
    );
  };
  const nb = Math.max(bench.length, opponent.bench.length);
  return (
    <div ref={boxRef}>
      <div className="flex items-end gap-1 border-y border-line bg-panel2/40 px-1.5 py-2 sm:gap-3 sm:px-4">
        <div className="min-w-0 flex-1">{left}</div>
        <span className="w-10 shrink-0 sm:w-12" aria-hidden />
        <div className="min-w-0 flex-1">{right}</div>
      </div>
      <ul className="divide-y divide-line">
        {slots.map((slot, i) => {
          const p = lineup[i] ? byId.get(lineup[i]!) : undefined;
          const canEdit = !p?.locked;
          return (
            <li key={i} className="flex items-center gap-1 px-1.5 py-1.5 sm:gap-3 sm:px-4">
              {mineCell(p, p ? p.id : `empty-${i}`, changed(i))}
              <button type="button" disabled={!canEdit} onClick={() => onSlot(i)} aria-label={`Choose who plays ${slot}`}
                className={cx("w-10 shrink-0 rounded-md py-1.5 text-center text-[10px] font-extrabold transition-transform sm:w-12 sm:text-[11px]", canEdit ? "bg-acc text-on-acc active:scale-90" : "bg-panel2 text-muted")}>{short(slot)}</button>
              {oppCell(opponent.starters[i], oppChanged(i))}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => setShowBench(!showBench)} className="w-full border-y border-line bg-panel2/50 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{showBench ? "Bench ▾" : "Bench ▸"}</button>
      {showBench && (
        <ul className="divide-y divide-line">
          {Array.from({ length: nb }, (_, i) => (
            <li key={i} className="flex items-center gap-1 px-1.5 py-1.5 sm:gap-3 sm:px-4">
              {bench[i] ? mineCell(bench[i], bench[i].id) : <div className="flex-1" />}
              <span className="w-10 shrink-0 text-center text-[10px] font-bold text-muted sm:w-12">{bench[i]?.unavailable === "IR slot" ? "IR" : "BN"}</span>
              {oppCell(opponent.bench[i])}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Set / Optimal switch that sits above one side's roster. Shows how much the optimal lineup adds. */
function SideToggle({ name, value, onChange, gain, edited = false, onReset, disabled = false, align = "left" }: {
  name: string; value: View; onChange: (v: View) => void; gain: number; edited?: boolean; onReset?: () => void; disabled?: boolean; align?: "left" | "right";
}) {
  const btn = (v: View, label: React.ReactNode) => (
    <button type="button" onClick={() => onChange(v)} disabled={disabled} aria-pressed={value === v}
      className={cx("min-w-0 truncate whitespace-nowrap rounded-full px-1.5 py-1 text-[11px] font-bold transition-colors duration-300", value === v ? "text-on-acc" : "text-muted", disabled && "opacity-50")}>{label}</button>
  );
  return (
    <div className={cx("flex flex-col gap-1", align === "right" ? "items-end" : "items-start")}>
      <span className={cx("flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted", align === "right" && "flex-row-reverse")}>
        <span className="min-w-0 truncate">{name}</span>
        {gain > 0.05 && <span className="num shrink-0 normal-case tracking-normal text-acc-ink">+{gain.toFixed(1)} optimal</span>}
        {edited && value === "current" && onReset && <button type="button" onClick={onReset} className="shrink-0 normal-case tracking-normal text-acc-ink underline">reset</button>}
      </span>
      <div role="group" aria-label={`${name} lineup`} className="relative isolate grid w-full max-w-[200px] grid-cols-2 rounded-full border border-line bg-panel p-0.5">
        <span aria-hidden className="absolute inset-y-0.5 left-0.5 -z-10 rounded-full bg-acc transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: "calc((100% - 4px) / 2)", transform: `translateX(${value === "optimal" ? 100 : 0}%)`, opacity: disabled ? 0.5 : 1 }} />
        {btn("current", edited ? "Yours" : "Set")}
        {btn("optimal", "Optimal")}
      </div>
    </div>
  );
}

// Standard normal CDF.
function phi(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Player chooser with faces, for the start/sit cards. */
function PickSheet({ title, options, onPick, onClose }: { title: string; options: LabPlayer[]; onPick: (id: string) => void; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="fhq-in relative w-full max-w-md rounded-t-2xl border border-line bg-bg p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl md:rounded-2xl">
        <div className="mb-3 flex items-center gap-3"><div className="h-display min-w-0 flex-1 text-2xl">{title}</div><button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-panel2 p-2"><X size={16} /></button></div>
        <div className="grid max-h-[60dvh] grid-cols-3 gap-2 overflow-y-auto pb-2">
          {options.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p.id)} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-panel p-2.5 text-center transition-transform active:scale-95 hover:border-acc">
              <PlayerPhoto id={p.id} name={p.name} pos={p.pos} size={48} />
              <span className="w-full truncate text-xs font-bold">{p.name}</span>
              <span className="text-[10px] text-muted">{p.pos} · {p.onBye ? "BYE" : p.opp ? `vs ${p.opp}` : "—"} · {p.median.toFixed(1)}</span>
            </button>
          ))}
          {!options.length && <p className="col-span-full text-sm text-muted">Nobody else can play there.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
