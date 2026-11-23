"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Lock, Minus, Plus, X } from "lucide-react";
import { PlayerImg, Segmented } from "@/components/client";
import { Card, InjuryChip, NflLogo, Tag, cx, signed } from "@/components/ui";
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
  // Only flag players who are new to the lineup, not ones who just slide between flex slots.
  const changed = (i: number) => view !== "current" && !!lineup[i] && !currentSet.has(lineup[i]!);
  const [compare, setCompare] = useState(0);
  const sw = swaps[compare];

  const setSlot = (i: number, id: string | null) => {
    const next = [...custom];
    const prev = next.indexOf(id);
    if (id && prev >= 0) next[prev] = next[i]; // swap if already starting elsewhere
    next[i] = id;
    setCustom(next);
  };

  // +/−: "+" on a bench player (or ⇄ on a starter) opens a slot picker; "−" sends a starter to the bench.
  const [picking, setPicking] = useState<string | null>(null);
  const pickPlayer = picking ? byId.get(picking) : undefined;
  const place = (pid: string, to: number) => {
    const base = [...lineup];
    const from = base.indexOf(pid);
    const occupant = base[to];
    base[to] = pid;
    if (from >= 0) base[from] = occupant && byId.get(occupant)?.eligible[from] ? occupant : null;
    setCustom(base);
    setView("custom");
    setPicking(null);
  };
  const benchIt = (pid: string) => {
    const base = [...lineup];
    const from = base.indexOf(pid);
    if (from < 0) return;
    base[from] = null;
    setCustom(base);
    setView("custom");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-3">
          <div className="rounded-xl border border-line bg-panel px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">Projected total · {view === "custom" ? "your simulation" : view === "current" ? "current lineup" : "recommended lineup"}</div>
            <div className="num font-[family-name:var(--font-display)] text-4xl font-bold leading-none">{shownTotal.toFixed(1)}</div>
          </div>
          <div className="rounded-xl bg-acc-soft px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-acc-ink">{view === "custom" ? "Simulation vs current lineup" : "Gain if you use recommended"}</div>
            <div className="num font-[family-name:var(--font-display)] text-4xl font-bold leading-none text-acc-ink">{signed(view === "custom" ? shownTotal - curTotal : optTotal - curTotal)}</div>
          </div>
        </div>
        <div className="w-full sm:ml-auto sm:w-auto">
          <Segmented label="Lineup view" size="lg" value={view} onChange={(v) => { if (v === "custom" && view !== "custom") setCustom(lineup); setView(v); }}
            options={[{ value: "current", label: "Current" }, { value: "recommended", label: "Recommended" }, { value: "custom", label: "Simulate" }]} />
        </div>
      </div>

      <p className="-mt-1 text-xs text-muted">Tap <b className="text-fg">+</b> on a bench player to choose which slot he goes into, <b className="text-fg">⇄</b> to move a starter, or <b className="text-fg">−</b> to bench him. Changes show as a simulation.</p>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card pad={false} className="min-w-0 lg:flex-[3]" title={`Week ${week} starters`}>
          <div className="flex items-center gap-3 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted sm:px-5">
            <span className="w-14 shrink-0">Slot</span>
            <span className="w-9 shrink-0" aria-hidden />
            <span className="flex-1">Player · team · opponent</span>
            <span className="hidden w-44 sm:block" title="Low = bad week (20th percentile), median = expected, high = good week (80th percentile)">Range: low · expected · high</span>
            <span className="w-14 text-right" title="Projected fantasy points in your league's scoring">Proj. pts</span>
          </div>
          <div className="divide-y divide-line">
            {slots.map((slot, i) => {
              const p = lineup[i] ? byId.get(lineup[i]!) : undefined;
              const options = players.filter((x) => x.eligible[i] && !x.unavailable);
              return (
                <div key={i} className={cx("flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-5", changed(i) && "bg-acc-soft")}>
                  <span className="w-14 shrink-0 rounded bg-panel2 py-1 text-center text-[11px] font-extrabold">{slot.replace("SUPER_FLEX", "SFLEX").replace("IDP_FLEX", "IDP")}</span>
                  {p ? <PlayerImg id={p.id} name={p.name} pos={p.pos} /> : <span className="h-9 w-9 shrink-0 rounded-full border border-dashed border-neg" />}
                  <div className="min-w-0 flex-1">
                    {view === "custom" ? (
                      <select aria-label={`${slot} slot`} value={lineup[i] ?? ""} onChange={(e) => setSlot(i, e.target.value || null)}
                        className="w-full max-w-72 rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm font-semibold">
                        <option value="">Empty</option>
                        {options.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.pos}) · {o.median.toFixed(1)}</option>)}
                      </select>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {p ? <PlayerLink id={p.id} name={p.name} /> : <span>Empty slot</span>}
                        {p && <InjuryChip status={p.injury} />}
                        {p?.locked && <Lock size={12} className="text-muted" aria-label="Game started" />}
                      </div>
                    )}
                    <div className="flex items-center gap-1 truncate text-xs text-muted">
                      {p && <NflLogo team={p.team} size={13} />}{p ? `${p.pos}${p.team ? ` · ${p.team}` : ""} · ${p.onBye ? "BYE" : p.opp ? `vs ${p.opp}` : "no game"}${p.matchup !== 1 ? ` · matchup ${signed((p.matchup - 1) * 100, 0)}%` : ""}` : "No player"}
                    </div>
                  </div>
                  <div className="hidden w-44 sm:block">
                    {p && p.high > 0 && <RangeBar low={p.low} med={p.median} high={p.high} />}
                  </div>
                  <div className="w-14 text-right">
                    <div className="num font-bold">{p ? p.median.toFixed(1) : "0.0"}</div>
                    {changed(i) && <div className="text-[11px] font-semibold text-pos">new start</div>}
                  </div>
                  {p && !p.locked ? (
                    <div className="flex shrink-0 gap-1">
                      <IconBtn label={`Move ${p.name} to another slot`} onClick={() => setPicking(p.id)}><ArrowLeftRight size={15} /></IconBtn>
                      <IconBtn label={`Bench ${p.name}`} tone="neg" onClick={() => benchIt(p.id)}><Minus size={16} /></IconBtn>
                    </div>
                  ) : <span className="w-[76px] shrink-0" />}
                </div>
              );
            })}
          </div>
          <dl className="grid gap-x-6 gap-y-1.5 border-t border-line px-5 py-3 text-xs text-muted sm:grid-cols-2">
            <div><dt className="inline font-semibold text-fg">Proj. pts</dt> <dd className="inline">Expected fantasy points this week in your league&apos;s scoring.</dd></div>
            <div><dt className="inline font-semibold text-fg">Range</dt> <dd className="inline">Low = a bad week (1 in 5 is worse), high = a good week (1 in 5 is better). The yellow tick marks the expected score.</dd></div>
            <div><dt className="inline font-semibold text-fg">Matchup %</dt> <dd className="inline">How many more (+) or fewer (−) points this opponent allows to the position than an average defense, half-weighted.</dd></div>
            <div><dt className="inline font-semibold text-fg">New start</dt> <dd className="inline">A player who isn&apos;t in your current lineup.</dd></div>
            <div className="sm:col-span-2 flex items-center gap-1.5">Slots: {rosterSlots}. All projections <Tag kind="MODEL" />. Nothing here changes Sleeper. Set lineups in the Sleeper app.</div>
          </dl>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 lg:flex-[2]">
          {sw && (
            <Card title="Start / sit" right={swaps.length > 1 && (
              <select aria-label="Choose comparison" value={compare} onChange={(e) => setCompare(Number(e.target.value))} className="rounded-md border border-line bg-panel2 px-2 py-1 text-xs">
                {swaps.map((s, i) => <option key={i} value={i}>{s.inName} vs {s.outName}</option>)}
              </select>
            )}>
              <Compare a={sw.outId ? byId.get(sw.outId) : undefined} b={byId.get(sw.inId)} />
              <div className="mt-3 rounded-lg bg-acc-soft px-3 py-2.5 text-sm leading-relaxed">
                <strong className="text-acc-ink">Why:</strong> {sw.reason}. Start {sw.inName}{sw.outId ? `, bench ${sw.outName}` : ""} for {signed(sw.gain)} projected points.
                {byId.get(sw.inId)?.notes.length ? ` ${byId.get(sw.inId)!.notes.join(" ")}` : ""}
              </div>
            </Card>
          )}
          {!sw && <Card title="Start / sit"><p className="text-sm text-muted">Your current lineup already matches the model&apos;s best lineup.</p></Card>}

          <Card title="Bench" pad={false} right={<span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Proj. pts</span>}>
            <ul className="divide-y divide-line">
              {bench.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-3 py-2.5 text-sm sm:px-5">
                  <PlayerImg id={b.id} name={b.name} pos={b.pos} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold"><PlayerLink id={b.id} name={b.name} /><InjuryChip status={b.injury} /></div>
                    <div className="flex items-center gap-1 text-xs text-muted"><NflLogo team={b.team} size={13} />{b.pos}{b.team ? ` · ${b.team}` : ""}{b.unavailable ? ` · ${b.unavailable}` : b.onBye ? " · BYE" : b.opp ? ` · vs ${b.opp}` : ""}</div>
                  </div>
                  <span className="num w-12 text-right">{b.median.toFixed(1)}</span>
                  {b.unavailable || b.locked ? <span className="w-9" /> : <IconBtn label={`Start ${b.name}`} tone="acc" onClick={() => setPicking(b.id)}><Plus size={17} /></IconBtn>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      {pickPlayer && (
        <SlotPicker player={pickPlayer} slots={slots} lineup={lineup} byId={byId} onPick={(i) => place(pickPlayer.id, i)} onClose={() => setPicking(null)} />
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

function IconBtn({ label, onClick, tone, children }: { label: string; onClick: () => void; tone?: "acc" | "neg"; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90",
        tone === "acc" ? "bg-acc text-on-acc" : tone === "neg" ? "border border-neg/60 text-neg hover:bg-neg/10" : "border border-line text-muted hover:text-fg")}>
      {children}
    </button>
  );
}

/** "Which slot?" prompt: every slot the player can fill, who's there now, and the change in projected points. */
function SlotPicker({ player, slots, lineup, byId, onPick, onClose }: {
  player: LabPlayer; slots: string[]; lineup: (string | null)[]; byId: Map<string, LabPlayer>; onPick: (i: number) => void; onClose: () => void;
}) {
  const from = lineup.indexOf(player.id);
  if (typeof document === "undefined") return null;
  const options = slots.map((slot, i) => ({ slot, i })).filter(({ i }) => player.eligible[i] && i !== from && !(lineup[i] && byId.get(lineup[i]!)?.locked));
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={`Choose a slot for ${player.name}`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="fhq-in relative w-full max-w-md rounded-t-2xl border border-line bg-bg p-4 shadow-2xl md:rounded-2xl">
        <div className="mb-3 flex items-center gap-3">
          <PlayerImg id={player.id} name={player.name} pos={player.pos} size={40} />
          <div className="min-w-0 flex-1"><div className="text-[11px] uppercase tracking-wider text-muted">{from >= 0 ? "Move" : "Start"}</div><div className="h-display truncate text-2xl">{player.name}</div><div className="text-xs text-muted">{player.pos} · proj {player.median.toFixed(1)}</div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-panel2 p-2"><X size={16} /></button>
        </div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted">Which slot?</div>
        <ul className="mt-2 flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
          {options.map(({ slot, i }) => {
            const occ = lineup[i] ? byId.get(lineup[i]!) : undefined;
            const swapBack = from >= 0 && occ && occ.eligible[from];
            const delta = player.median - (occ?.median ?? 0);
            return (
              <li key={i}>
                <button type="button" onClick={() => onPick(i)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-left hover:border-acc">
                  <span className="w-14 shrink-0 rounded bg-panel2 py-1 text-center text-[11px] font-extrabold">{slot.replace("SUPER_FLEX", "SFLEX").replace("IDP_FLEX", "IDP")}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {occ ? <>Replace <b>{occ.name}</b> <span className="text-muted">({occ.median.toFixed(1)}){from >= 0 ? (swapBack ? " · swaps into his slot" : " · goes to bench") : " · goes to bench"}</span></> : <span className="text-muted">Empty slot</span>}
                  </span>
                  {from < 0 && <span className={cx("num text-sm font-bold", delta >= 0 ? "text-pos" : "text-neg")}>{signed(delta)}</span>}
                </button>
              </li>
            );
          })}
          {options.length === 0 && <li className="text-sm text-muted">No open slot he can play.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
