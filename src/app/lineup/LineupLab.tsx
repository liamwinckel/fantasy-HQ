"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";
import { PlayerImg, Segmented } from "@/components/client";
import { Card, InjuryChip, NflLogo, cx, signed } from "@/components/ui";
import { PlayerLink } from "@/components/PlayerCard";
import type { Swap } from "@/lib/services/views";

export interface LabPlayer {
  id: string; name: string; pos: string; team: string | null; injury: string | null;
  eligible: boolean[]; unavailable: string | null; locked: boolean;
  median: number; low: number; high: number; base: number; seasonAvg: number; last4: number; games: number;
  confidence: string; opp: string | null; onBye: boolean; matchup: number; usage: number; notes: string[];
  snapL3: number[] | null; recent: { week: number; pts: number }[];
}

type View = "current" | "recommended" | "custom";
const short = (slot: string) => slot.replace("SUPER_FLEX", "SFLX").replace("IDP_FLEX", "IDP").replace("WRRB_FLEX", "W/R").replace("REC_FLEX", "W/T");
/** Same columns for the header and every row, so titles sit over their numbers. */
const GRID = "grid grid-cols-[3.25rem_2.25rem_minmax(0,1fr)_3.5rem] items-center gap-x-2.5 sm:grid-cols-[3.5rem_2.25rem_minmax(0,1fr)_11rem_3.5rem] sm:gap-x-3";

export function LineupLab({ slots, players, current, optimal, swaps, rosterSlots, week }: {
  slots: string[]; players: LabPlayer[]; current: (string | null)[]; optimal: (string | null)[]; swaps: Swap[]; rosterSlots: string; week: number;
}) {
  const [view, setView] = useState<View>(swaps.length ? "recommended" : "current");
  const [custom, setCustom] = useState<(string | null)[]>(current);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const lineup = view === "current" ? current : view === "recommended" ? optimal : custom;
  const total = (l: (string | null)[]) => Math.round(l.reduce((a, id) => a + (id ? byId.get(id)?.median ?? 0 : 0), 0) * 10) / 10;
  const curTotal = total(current);
  const optTotal = total(optimal);
  const shownTotal = total(lineup);
  const starters = new Set(lineup.filter(Boolean) as string[]);
  const bench = players.filter((p) => !starters.has(p.id)).sort((a, b) => b.median - a.median);
  const currentSet = new Set(current.filter(Boolean) as string[]);
  const changed = (i: number) => view !== "current" && !!lineup[i] && !currentSet.has(lineup[i]!);
  const [slotOpen, setSlotOpen] = useState<number | null>(null);

  /** Put a player in slot i; whoever was there takes his old slot if eligible, otherwise goes to the bench. */
  const place = (i: number, pid: string | null) => {
    const base = [...lineup];
    const from = pid ? base.indexOf(pid) : -1;
    const occupant = base[i];
    base[i] = pid;
    if (from >= 0) base[from] = occupant && byId.get(occupant)?.eligible[from] ? occupant : null;
    setCustom(base);
    setView("custom");
    setSlotOpen(null);
  };

  // Start/sit: any starter vs any rostered player who can play that slot.
  const firstSwap = swaps[0];
  const [aId, setAId] = useState<string | null>(firstSwap?.outId ?? (lineup.find(Boolean) ?? null));
  const aSlot = aId ? lineup.indexOf(aId) : -1;
  const bOptions = players.filter((p) => p.id !== aId && !p.unavailable && (aSlot < 0 || p.eligible[aSlot]));
  const [bPick, setBPick] = useState<string | null>(firstSwap?.inId ?? null);
  const bId = bPick && bOptions.some((p) => p.id === bPick) ? bPick : bOptions.sort((x, y) => y.median - x.median)[0]?.id ?? null;
  const A = aId ? byId.get(aId) : undefined;
  const B = bId ? byId.get(bId) : undefined;
  const better = A && B ? (B.median > A.median ? B : A) : undefined;

  const row = (p: LabPlayer | undefined, slotLabel: React.ReactNode, i: number | null, isNew = false) => (
    <div className={cx(GRID, "px-3 py-2 sm:px-5", isNew && "bg-acc-soft")}>
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
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="flex gap-3">
          <div className="rounded-xl border border-line bg-panel px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-wider text-muted">{view === "custom" ? "Your lineup" : view === "current" ? "Current lineup" : "Recommended"}</div>
            <div className="num font-[family-name:var(--font-display)] text-4xl font-bold leading-none">{shownTotal.toFixed(1)}</div>
          </div>
          <div className="rounded-xl bg-acc-soft px-4 py-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-acc-ink">vs current</div>
            <div className="num font-[family-name:var(--font-display)] text-4xl font-bold leading-none text-acc-ink">{signed(view === "current" ? optTotal - curTotal : shownTotal - curTotal)}</div>
          </div>
        </div>
        <Segmented label="Lineup view" size="lg" value={view} onChange={(v) => { if (v === "custom" && view !== "custom") setCustom(lineup); setView(v); }}
          options={[{ value: "current", label: "Current" }, { value: "recommended", label: "Best" }, { value: "custom", label: "Mine" }]} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card pad={false} className="min-w-0 lg:flex-[3]" title={`Week ${week} roster`}
          info={<>Tap a position (QB, RB…) to choose who plays there; the player you replace moves to the bench, or swaps slots if he can play the other one. <b>Proj</b> = expected fantasy points this week in your scoring (Sleeper). <b>Range</b> = a bad week (1 in 5 is worse) · expected · a good week (1 in 5 is better). Matchup % = how many more (+) or fewer (−) points this opponent allows to the position. Slots: {rosterSlots}. Nothing here changes Sleeper.</>}>
          <div className={cx(GRID, "border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-5")}>
            <span>Slot</span><span /><span>Player</span><span className="hidden sm:block">Range · low / exp / high</span><span className="text-right">Proj</span>
          </div>
          <div className="divide-y divide-line">
            {slots.map((slot, i) => {
              const p = lineup[i] ? byId.get(lineup[i]!) : undefined;
              const canEdit = !p?.locked;
              return (
                <div key={i}>
                  {row(p, (
                    <button type="button" disabled={!canEdit} onClick={() => setSlotOpen(i)} aria-label={`Choose who plays ${slot}`}
                      className={cx("rounded-md py-1.5 text-center text-[11px] font-extrabold transition-colors", canEdit ? "bg-acc text-on-acc active:scale-95" : "bg-panel2 text-muted")}>{short(slot)}</button>
                  ), i, changed(i))}
                </div>
              );
            })}
          </div>
          <div className="border-y border-line bg-panel2/50 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Bench</div>
          <div className="divide-y divide-line">
            {bench.map((b) => <div key={b.id}>{row(b, <span className="rounded-md bg-panel2 py-1.5 text-center text-[11px] font-bold text-muted">{b.unavailable === "IR slot" ? "IR" : b.unavailable === "Taxi" ? "TAXI" : "BN"}</span>, null)}</div>)}
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 lg:flex-[2]">
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
                  {B.id !== better!.id ? "" : lineup.includes(B.id) ? "" : <button type="button" className="ml-1 font-semibold text-acc-ink underline" onClick={() => place(aSlot, B.id)}>Put him in</button>}
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
    ["Bad / good week", (p) => `${p.low.toFixed(1)} / ${p.high.toFixed(1)}`],
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
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={`Choose who plays ${slot}`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="fhq-in relative w-full max-w-md rounded-t-2xl border border-line bg-bg p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl md:rounded-2xl">
        <div className="mb-3 flex items-center gap-3">
          <span className="rounded-md bg-acc px-2.5 py-1.5 text-sm font-extrabold text-on-acc">{short(slot)}</span>
          <div className="min-w-0 flex-1"><div className="h-display text-2xl">Who plays here?</div><div className="truncate text-xs text-muted">Now: {cur ? `${cur.name} · ${cur.median.toFixed(1)}` : "empty"}</div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-panel2 p-2"><X size={16} /></button>
        </div>
        <ul className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto">
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
