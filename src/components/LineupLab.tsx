"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";
import { PlayerImg, Segmented } from "@/components/client";
import { Card, InjuryChip, NflLogo, cx, signed } from "@/components/ui";
import { PlayerLink } from "@/components/PlayerCard";
import type { Swap, TeamWeek, WeekLine } from "@/lib/services/views";

export interface LabPlayer {
  id: string; name: string; pos: string; team: string | null; injury: string | null;
  eligible: boolean[]; unavailable: string | null; locked: boolean;
  median: number; low: number; high: number; base: number; seasonAvg: number; last4: number; games: number;
  confidence: string; opp: string | null; onBye: boolean; matchup: number; usage: number; notes: string[];
  snapL3: number[] | null; recent: { week: number; pts: number }[]; actual?: number | null;
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

export function LineupLab({ slots, players, current, optimal, swaps, rosterSlots, week, onTotal, opponent, live = false, myName = "You", sim }: {
  slots: string[]; players: LabPlayer[]; current: (string | null)[]; optimal: (string | null)[]; swaps: Swap[]; rosterSlots: string; week: number; onTotal?: (t: number) => void;
  opponent?: TeamWeek | null; live?: boolean; myName?: string;
  /** Matchup simulator for the lineup on screen; `apply` puts a lineup on screen. */
  sim?: (lineup: (string | null)[], apply: (l: (string | null)[]) => void) => React.ReactNode;
}) {
  const [view, setView] = useState<View>("current");
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
        <Card pad={false} className="min-w-0 overflow-hidden lg:flex-[3]" title={opponent ? `Lineups · Week ${week}` : `Your lineup · Week ${week}`}
          right={<Segmented label="Lineup view" value={view} onChange={(v) => setView(v)} options={[{ value: "current", label: edited ? "Yours" : "Current" }, { value: "optimal", label: "Optimal" }]} />}
          info={<>Tap a position (QB, RB…) to choose who plays there; the player you replace moves to the bench, or swaps slots if he can play the other one. <b>Proj</b> = Sleeper&apos;s projection in your scoring. <b>Range</b> = floor (1 week in 10 is worse) · projection · ceiling (1 in 10 is better), from his own week-to-week swings and, when he has them, betting-market lines. Matchup % = how many more (+) or fewer (−) points this opponent allows to the position. Slots: {rosterSlots}. Nothing here changes Sleeper.</>}>
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs sm:px-5">
            <span className="text-muted">{view === "optimal" ? "Optimal lineup" : edited ? "Your changes" : "Set in Sleeper"}: <b className="num text-fg">{shownTotal.toFixed(1)}</b> pts</span>
            {view === "current" && optTotal - shownTotal > 0.05 && <span className="font-semibold text-acc-ink">Optimal is {signed(optTotal - shownTotal)}</span>}
            {view === "optimal" && <span className="font-semibold text-acc-ink">{signed(optTotal - curTotal)} vs current</span>}
            {edited && view === "current" && <button type="button" onClick={() => setMine(current)} className="font-semibold text-muted underline">Reset</button>}
          </div>
          {opponent ? (
            <div key={view} className="qa-fade-in"><Versus slots={slots} lineup={lineup} bench={bench} byId={byId} opponent={opponent} live={live} changed={changed} onSlot={setSlotOpen} boxRef={box} myName={myName} /></div>
          ) : (<>
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
          </>)}
        </Card>

        <div className="flex min-w-0 flex-col gap-4 lg:flex-[2]">
          {sim?.(lineup, (l) => { armed.current = true; setMine(l); setView("current"); })}
          <Card title="Start / sit">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-muted">Starter
                <select value={aId ?? ""} onChange={(e) => { setAId(e.target.value || null); setBPick(null); }} className="rounded-md border border-line bg-panel2 px-2 py-2 text-sm font-semibold text-fg">
                  {slots.map((slot, i) => lineup[i] ? <option key={i} value={lineup[i]!}>{short(slot)} · {byId.get(lineup[i]!)?.name}</option> : null)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted">vs anyone who can play {aSlot >= 0 ? short(slots[aSlot]) : "there"}
                <select value={bId ?? ""} onChange={(e) => setBPick(e.target.value || null)} className="rounded-md border border-line bg-panel2 px-2 py-2 text-sm font-semibold text-fg">
                  {bOptions.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.pos}) · {p.median.toFixed(1)}</option>)}
                </select>
              </label>
            </div>
            {A && B && (
              <>
                <div className="mt-3"><Compare a={A} b={B} /></div>
                <div className="mt-3 rounded-lg bg-acc-soft px-3 py-2.5 text-sm leading-relaxed">
                  <strong className="text-acc-ink">Start {better!.name}</strong> ({signed(Math.abs(B.median - A.median))} projected).{" "}
                  {better!.notes.slice(0, 2).join(" ")}
                  {B.id === better!.id && !lineup.includes(B.id) && aSlot >= 0 && <button type="button" className="ml-1 font-semibold text-acc-ink underline" onClick={() => place(aSlot, B.id)}>Put him in</button>}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

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
function Versus({ slots, lineup, bench, byId, opponent, live, changed, onSlot, boxRef, myName }: {
  slots: string[]; lineup: (string | null)[]; bench: LabPlayer[]; byId: Map<string, LabPlayer>; opponent: TeamWeek; live: boolean; myName: string;
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
          <div className="flex items-center gap-1 truncate text-[10px] text-muted sm:text-[11px]">{p && <NflLogo team={p.team} size={11} />}<span className="truncate">{p ? `${p.team ?? p.pos} ${p.onBye ? "BYE" : p.opp ? `v ${p.opp}` : ""}` : ""}</span></div>
        </div>
        <div className="w-10 shrink-0 text-right sm:w-12">
          <div className={cx("num text-sm font-bold", !started && "text-muted")}>{p ? (started ? p.actual!.toFixed(1) : p.median.toFixed(1)) : "—"}</div>
          {started && <div className="num text-[9px] text-muted">proj {p!.median.toFixed(1)}</div>}
        </div>
      </div>
    );
  };
  const oppCell = (l: WeekLine | undefined) => {
    if (!l) return <div className="flex-1" />;
    const started = live && l.actual !== null && l.actual !== 0;
    return (
      <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 px-1 text-right">
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
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-5">
        <span className="truncate pr-2">{myName}</span><span className="truncate pl-2">{opponent.name}</span>
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
              {oppCell(opponent.starters[i])}
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
