"use client";

import { applySettings } from "@/lib/actions";
import { useState, type ReactNode } from "react";
import { PlayerLink } from "@/components/PlayerCard";
import { Segmented } from "@/components/client";
import { Card, Tag, cx, signed, Info } from "@/components/ui";
import { modRounds, type KeeperRules } from "@/lib/engine/keepers";

interface Row {
  playerId: string; name: string; pos: string; team: string | null; age: number | null;
  draftedRound: number | null; draftedPick: number | null; draftedOverall: number | null; draftedBy: string | null;
  wasKeeper: boolean; yearsKept: number; ineligible: string | null;
  costRound: number | null; costSource: string; capped: boolean; nextSeasonPpg: number; keeperValue: number; roundValue: number; surplus: number | null; recommended: boolean;
}

/** −/value/+ stepper (big tap targets). */
function Stepper({ label, value, min, max, onChange, fmt = (v: number) => String(v), hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; fmt?: (v: number) => string; hint?: ReactNode }) {
  const btn = "flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel2 text-lg font-bold disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Less ${label}`}>−</button>
        <span className="num min-w-16 text-center text-sm font-bold text-fg">{fmt(value)}</span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>+</button>
      </div>
      {hint && <span className="text-[11px]">{hint}</span>}
    </div>
  );
}

export function KeeperBoard({ leagueId, rows, rules, rounds, teams, draftType, sleeperMax, season }: { leagueId: string; rows: Row[]; rules: KeeperRules; rounds: number; teams: number; draftType: string | null; sleeperMax: number | null; season: number }) {
  const [busy, setBusy] = useState(false);
  const save = async (patch: object) => {
    setBusy(true);
    await applySettings({ keeper: { leagueId, ...patch } });
    setBusy(false);
  };
  const mod = modRounds(rules.modifier);
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.keeperValue, r.roundValue)));
  const range = (r: number) => `picks ${(r - 1) * teams + 1}–${r * teams}`;
  const pickLabel = (r: Row) => (r.draftedRound ? `${r.draftedRound}.${String(r.draftedPick ?? 0).padStart(2, "0")}` : null);
  const ex = rows.find((r) => r.draftedRound && r.costRound && r.costSource === "drafted");
  return (
    <div className={cx("flex flex-col gap-4 transition-opacity", busy && "opacity-60")}>
      <Card title="Keeper rules" info={<>These rules turn each player&apos;s draft slot (pulled from Sleeper) into next season&apos;s cost. Draft: {rounds} rounds × {teams} teams{draftType ? ` (${draftType})` : ""}.</>}>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Stepper label="Keepers per team" value={rules.maxKeepers} min={0} max={Math.min(30, rounds)} onChange={(v) => save({ maxKeepers: v })} hint={sleeperMax ? `Sleeper setting: ${sleeperMax}` : undefined} />
          <Stepper label="Cost vs drafted round" value={mod} min={0} max={5} onChange={(v) => save({ modifier: v })} fmt={(v) => (v === 0 ? "Same" : `${v} round${v === 1 ? "" : "s"}`)} />
          <div className="flex flex-col gap-1 text-xs text-muted">Cost moves
            <Segmented label="Modifier direction" value={rules.direction} onChange={(d) => save({ direction: d })} options={[{ value: "earlier", label: "Earlier (pricier)" }, { value: "later", label: "Later" }]} />
          </div>
          <Stepper label="Extra rounds per season already kept" value={rules.perYearKept} min={0} max={5} onChange={(v) => save({ perYearKept: v })} fmt={(v) => (v === 0 ? "None" : `+${v}`)} hint="Escalates long-term keepers" />
          <Stepper label="Max seasons in a row" value={rules.maxYears} min={0} max={10} onChange={(v) => save({ maxYears: v })} fmt={(v) => (v === 0 ? "No limit" : String(v))} />
          <Stepper label="Rounds that can't be kept" value={rules.protectedRounds} min={0} max={Math.max(0, rounds - 1)} onChange={(v) => save({ protectedRounds: v })} fmt={(v) => (v === 0 ? "None" : `1–${v}`)} hint="e.g. 1–2 = no 1st/2nd-round keepers" />
          <label className="flex flex-col gap-1 text-xs text-muted">Undrafted / waiver pickups cost
            <select className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg" value={rules.undraftedRound} onChange={(e) => save({ undraftedRound: Number(e.target.value) })}>
              {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => <option key={r} value={r}>Round {r} · {range(r)}{r === rounds ? " (last)" : ""}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-xs text-muted">Value him over
            <Segmented label="Value horizon" value={String(rules.horizon) as "1" | "2"} onChange={(h) => save({ horizon: Number(h) })} options={[{ value: "1", label: "Next season" }, { value: "2", label: "Next 2 seasons" }]} />
          </div>
        </div>
        <Info className="mt-4">
          {ex ? <>Example: {ex.name} was drafted at {pickLabel(ex)} (round {ex.draftedRound}), so with these rules he costs your <b>round {ex.costRound}</b> pick in {season}.</> : <>With {mod === 0 ? "no change" : `${mod} round${mod === 1 ? "" : "s"} ${rules.direction}`}, a round-6 pick costs round {Math.min(rounds, Math.max(1, 6 + (rules.direction === "earlier" ? -mod : mod)))} in {season}.</>}
          {" "}Override any player&apos;s cost in the table.
        </Info>
      </Card>

      <Card title={`Your keeper options for ${season}`} right={<Tag kind="MODEL" />} pad={false}
        info={<><b>Drafted</b> = where he went in this season&apos;s Sleeper draft (round.pick, overall #). <b>Cost</b> = the round you give up next season. <b>Value</b> bars: his projected points per game above a replacement player (yellow) vs what a typical pick in that round returns (grey). <b>Surplus</b> = the difference; KEEP marks your best {rules.maxKeepers}.</>}>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.playerId} className={cx("grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_7rem_6rem_minmax(0,1fr)_4rem_6.5rem] sm:items-center sm:px-5", r.recommended && "bg-acc-soft")}>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  {r.recommended && <span className="shrink-0 rounded bg-acc px-1.5 py-0.5 text-[10px] font-extrabold text-on-acc">KEEP</span>}
                  <PlayerLink id={r.playerId} name={r.name} className="font-semibold" />
                </div>
                <div className="truncate text-xs text-muted">{r.pos}{r.team ? ` · ${r.team}` : ""}{r.age ? ` · ${Math.floor(r.age)}` : ""}{r.yearsKept ? ` · kept ${r.yearsKept} season${r.yearsKept === 1 ? "" : "s"}` : ""}</div>
              </div>
              <div className="text-right text-xs sm:text-left">
                {r.draftedRound ? <><b className="num text-sm">{pickLabel(r)}</b> <span className="text-muted">#{r.draftedOverall}</span><div className="truncate text-[11px] text-muted">{r.wasKeeper ? "kept" : "drafted"}{r.draftedBy ? ` by ${r.draftedBy}` : ""}</div></> : <span className="text-muted">Undrafted<div className="text-[11px]">waivers / FA</div></span>}
              </div>
              <div className="text-xs">
                {r.costRound ? <><b className="num text-sm">Round {r.costRound}</b><div className="text-[11px] text-muted">{r.costSource === "manual" ? "custom" : r.costSource}{r.capped ? " · capped" : ""}</div></> : <span className="font-semibold text-neg">{r.ineligible ?? "Not eligible"}</span>}
              </div>
              <div className="flex flex-col gap-1" title={`${r.keeperValue} vs ${r.roundValue} pts/g above replacement`}>
                <div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-panel2"><div className="h-2 rounded-full bg-acc transition-[width] duration-500" style={{ width: `${(100 * r.keeperValue) / maxV}%` }} /></div><span className="num w-8 text-right text-[11px]">{r.keeperValue.toFixed(1)}</span></div>
                <div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-panel2"><div className="h-2 rounded-full bg-muted transition-[width] duration-500" style={{ width: `${(100 * r.roundValue) / maxV}%` }} /></div><span className="num w-8 text-right text-[11px] text-muted">{r.costRound ? r.roundValue.toFixed(1) : "—"}</span></div>
              </div>
              <div className={cx("num text-right text-sm font-bold", r.surplus === null ? "text-muted" : r.surplus > 0 ? "text-pos" : "text-neg")}>{r.surplus === null ? "—" : signed(r.surplus)}<div className="text-[10px] font-normal text-muted">surplus</div></div>
              <select aria-label={`Keeper cost for ${r.name}`} className="rounded-md border border-line bg-panel2 px-2 py-1.5 text-xs" value={r.costSource === "manual" ? r.costRound ?? 0 : 0} onChange={(e) => save({ override: { playerId: r.playerId, round: Number(e.target.value) } })}>
                <option value={0}>Auto cost</option>
                {Array.from({ length: rounds }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Round {n} · {range(n)}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4 border-t border-line px-5 py-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-acc" />His value ({rules.horizon === 2 ? "next 2 seasons" : "next season"})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-muted" />Typical pick in his cost round</span>
          <span>Points per game above replacement.</span>
        </div>
      </Card>
    </div>
  );
}
