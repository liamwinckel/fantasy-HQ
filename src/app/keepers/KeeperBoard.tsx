"use client";

import { applySettings } from "@/lib/actions";
import { useRef, useState, type ReactNode } from "react";
import { useHPan } from "@/components/useHPan";
import { PlayerLink } from "@/components/PlayerCard";
import { PlayerImg, Segmented } from "@/components/client";
import { Sheet } from "@/components/Sheet";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { Card, cx, signed, Info } from "@/components/ui";
import { keeperGrade, modRounds, type KeeperRules } from "@/lib/engine/keepers";
import type { BoardCell, MyKeeperRow } from "@/lib/services/keeperData";
import type { KeeperRow } from "@/lib/engine/keepers";

type Row = Omit<MyKeeperRow, "surplus"> & { surplus: number | null };
type Others = { rosterId: number; name: string; keepers: (KeeperRow & { at: string | null; note: string | null })[] }[];

/** Sleeper-style position colours, tuned for the app's dark theme. */
export const POS_TINT: Record<string, string> = {
  QB: "bg-[#ff5d8f]/20 border-[#ff5d8f]/60 text-[#ff9dbb]", RB: "bg-[#3ddc97]/18 border-[#3ddc97]/60 text-[#7ff0bd]",
  WR: "bg-[#4cc3ff]/18 border-[#4cc3ff]/60 text-[#9adcff]", TE: "bg-[#ffb547]/20 border-[#ffb547]/60 text-[#ffd08a]",
  K: "bg-[#b38cff]/20 border-[#b38cff]/60 text-[#d2bcff]", DEF: "bg-[#9aa4b2]/20 border-[#9aa4b2]/60 text-[#c9d0d9]",
};

function Stepper({ label, value, min, max, onChange, fmt = (v: number) => String(v), hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; fmt?: (v: number) => string; hint?: ReactNode }) {
  const btn = "flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel2 text-lg font-bold disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Less ${label}`}>−</button>
        <span className="num min-w-20 text-center text-sm font-bold text-fg">{fmt(value)}</span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>+</button>
      </div>
      {hint && <span className="text-[11px]">{hint}</span>}
    </div>
  );
}
const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) => (
  <div className="flex flex-col gap-1 text-xs text-muted">{label}{children}{hint && <span className="text-[11px]">{hint}</span>}</div>
);

export function KeeperBoard({ leagueId, rows, rules, rounds, teams, draftType, sleeperMax, season, board, order, others, teamName, myRosterId, hasPlan, rulesSet }: {
  leagueId: string; rows: Row[]; rules: KeeperRules; rounds: number; teams: number; draftType: string | null; sleeperMax: number | null; season: number;
  board: BoardCell[]; order: number[]; others: Others; teamName: (rid: number) => string; myRosterId: number; hasPlan: boolean; rulesSet: boolean;
}) {
  const [rulesOpen, setRulesOpen] = useState(!rulesSet);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (patch: object) => {
    setBusy(true);
    await applySettings({ keeper: { leagueId, ...patch } });
    setBusy(false);
  };
  const mod = modRounds(rules.modifier);
  const range = (r: number) => `picks ${(r - 1) * teams + 1}–${r * teams}`;
  const pickLabel = (r: Row) => (r.draftedRound ? `${r.draftedRound}.${String(r.draftedPick ?? 0).padStart(2, "0")}` : null);
  const cellLabel = (key: string | null) => board.find((c) => c.key === key)?.label ?? null;
  // Changing one player's keeper spot turns the current recommendation into your saved plan.
  const setKeep = (playerId: string, key: string) => {
    const planNow: Record<string, string> = {};
    for (const r of rows) if (r.planned && r.keptAt) planNow[r.playerId] = r.keptAt;
    if (key === "none") delete planNow[playerId]; else planNow[playerId] = key;
    if (!Object.keys(planNow).length) planNow["_"] = "none";
    save({ planAll: planNow });
  };
  const keeping = rows.filter((r) => r.planned);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <button type="button" onClick={() => setRulesOpen(!rulesOpen)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={rulesOpen}>
          <span className="text-sm font-bold">Keeper rules</span>
          <span className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
            {[`${rules.maxKeepers} keeper${rules.maxKeepers === 1 ? "" : "s"}`,
              rules.draftedMode === "adp" ? `Drafted: ADP${rules.adpOffset ? ` ${rules.adpOffset > 0 ? "+" : ""}${rules.adpOffset}` : ""}` : `Drafted: Rd ${rules.direction === "earlier" ? "−" : "+"}${mod}`,
              rules.undraftedMode === "round" ? `Pickups: Rd ${rules.undraftedRound}` : `Pickups: ADP${rules.undraftedOffset ? ` ${rules.undraftedOffset > 0 ? "+" : ""}${rules.undraftedOffset}` : ""}`,
              `${rounds} rds`].map((c) => <span key={c} className="shrink-0 rounded-md bg-panel2 px-2 py-0.5 text-[11px] font-semibold text-muted">{c}</span>)}
          </span>
          {!rulesSet && <span className="shrink-0 rounded bg-acc px-1.5 py-0.5 text-[10px] font-extrabold text-on-acc">SET UP</span>}
          <ChevronDown size={16} className={cx("shrink-0 text-muted transition-transform", rulesOpen && "rotate-180")} />
        </button>
        <div className={cx("grid transition-[grid-template-rows] duration-300", rulesOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden"><div className="border-t border-line px-4 py-4 sm:px-5">
        <p className="mb-4 text-xs text-muted">These rules turn each player&apos;s draft slot (pulled from Sleeper) into next season&apos;s cost. Draft: {rounds} rounds × {teams} teams{draftType ? ` (${draftType})` : ""}.</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Stepper label="Keepers per team" value={rules.maxKeepers} min={0} max={Math.min(30, rounds)} onChange={(v) => save({ maxKeepers: v })} hint={sleeperMax ? `Sleeper setting: ${sleeperMax}` : undefined} />
          <Field label="Drafted players cost">
            <select className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg" value={rules.draftedMode} onChange={(e) => save({ draftedMode: e.target.value })}>
              <option value="drafted">Round he was drafted ± modifier</option>
              <option value="adp">Where he&apos;d go next year ± offset</option>
              <option value="earlier">Whichever of those is earlier</option>
            </select>
          </Field>
          {(rules.draftedMode !== "adp") && <Stepper label="Drafted-round modifier" value={mod} min={0} max={5} onChange={(v) => save({ modifier: v })} fmt={(v) => (v === 0 ? "Same round" : `${v} round${v === 1 ? "" : "s"}`)} />}
          {(rules.draftedMode !== "adp") && <Field label="Modifier moves the cost"><Segmented label="Modifier direction" value={rules.direction} onChange={(d) => save({ direction: d })} options={[{ value: "earlier", label: "Earlier (pricier)" }, { value: "later", label: "Later" }]} /></Field>}
          {rules.draftedMode !== "drafted" && <Stepper label="Drafted: offset from where he'd go" value={rules.adpOffset} min={-5} max={5} onChange={(v) => save({ adpOffset: v })} fmt={(v) => (v === 0 ? "Same round" : v < 0 ? `${-v} earlier` : `${v} later`)} hint="e.g. −1 = one round before where he'd be drafted" />}
          <Field label="Waiver / free-agent pickups cost">
            <select className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg" value={rules.undraftedMode} onChange={(e) => save({ undraftedMode: e.target.value })}>
              <option value="adp">Where he&apos;d go next year ± rounds</option>
              <option value="earlier">Where he&apos;d go, or a set round if earlier</option>
              <option value="round">A set round</option>
            </select>
          </Field>
          {rules.undraftedMode !== "round" && <Stepper label="Pickups: rounds from where he'd go" value={rules.undraftedOffset} min={-5} max={5} onChange={(v) => save({ undraftedOffset: v })} fmt={(v) => (v === 0 ? "At ADP" : v < 0 ? `${-v} earlier` : `${v} later`)} hint="e.g. −1 = kept a round before his projected round" />}
          {rules.undraftedMode !== "adp" && (
            <Field label={rules.undraftedMode === "earlier" ? "Pickups: set round" : "Waiver pickups' round"}>
              <select className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg" value={rules.undraftedRound} onChange={(e) => save({ undraftedRound: Number(e.target.value) })}>
                {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => <option key={r} value={r}>Round {r} · {range(r)}{r === rounds ? " (last)" : ""}</option>)}
              </select>
            </Field>
          )}
          <Stepper label="Extra rounds per season already kept" value={rules.perYearKept} min={0} max={5} onChange={(v) => save({ perYearKept: v })} fmt={(v) => (v === 0 ? "None" : `+${v}`)} />
          <Stepper label="Max seasons in a row" value={rules.maxYears} min={0} max={10} onChange={(v) => save({ maxYears: v })} fmt={(v) => (v === 0 ? "No limit" : String(v))} />
          <Stepper label="Rounds that can't be kept" value={rules.protectedRounds} min={0} max={Math.max(0, rounds - 1)} onChange={(v) => save({ protectedRounds: v })} fmt={(v) => (v === 0 ? "None" : `Rounds 1–${v}`)} />
          <Field label="Can a keeper use a pick you got in a trade?" hint="e.g. you own two 5th-rounders: can he go in either?">
            <Segmented label="Keep at traded picks" value={rules.anyPick ? "yes" : "no"} onChange={(v) => save({ anyPick: v === "yes" })} options={[{ value: "yes", label: "Yes, any pick I own" }, { value: "no", label: "Only my own" }]} />
          </Field>
          <Field label="If you don't own a pick in his round">
            <select className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-fg" value={rules.missingPick} onChange={(e) => save({ missingPick: e.target.value })}>
              <option value="earlier">Use my next earlier pick</option>
              <option value="later">Use my next later pick</option>
              <option value="none">He can&apos;t be kept</option>
            </select>
          </Field>
          <Field label="Value him over"><Segmented label="Value horizon" value={String(rules.horizon) as "1" | "2"} onChange={(h) => save({ horizon: Number(h) })} options={[{ value: "1", label: "Next season" }, { value: "2", label: "Next 2 seasons" }]} /></Field>
        </div>
        <Info className="mt-4">&quot;Where he&apos;d go next year&quot; is SHS&apos;s projected draft round (next season&apos;s value ranked across the league) until real ADP exists in the summer.</Info>
        </div></div></div>
      </div>

      <Card title={`Your keepers for ${season}`} pad={false}
        right={<div className="flex items-center gap-2 text-xs"><span className="text-muted">{keeping.length}/{rules.maxKeepers}{hasPlan ? " · your plan" : " · suggested"}</span>{hasPlan && <button type="button" className="font-semibold text-acc-ink underline" onClick={() => save({ planReset: true })}>Reset</button>}</div>}
        info={<>Grade = next season&apos;s points per game over what that round&apos;s pick usually gets. The bar runs from round 1 to {rounds}: the dot is where he&apos;d go next year, the tick is what he costs to keep. Green between them = rounds you save.</>}>
        <ul className="divide-y divide-line">
          {Array.from({ length: Math.max(rules.maxKeepers, keeping.length) }, (_, i) => keeping[i] ?? null).map((r, i) => (
            <li key={r?.playerId ?? `empty-${i}`}>
              {r ? <KeeperSlotCard r={r} rounds={rounds} over={i >= rules.maxKeepers} onRemove={() => setKeep(r.playerId, "none")} onAt={(k) => setKeep(r.playerId, k)} onCost={(n) => save({ override: { playerId: r.playerId, round: n } })} cellLabel={cellLabel} />
                : (
                  <button type="button" onClick={() => setPicking(true)} className="fhq-pop flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5">
                    <span className="w-9 shrink-0 text-center text-[10px] font-extrabold text-muted">K{i + 1}</span>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-acc/60 text-acc-ink"><Plus size={18} /></span>
                    <span className="text-sm font-semibold text-muted">Add a keeper</span>
                  </button>
                )}
            </li>
          ))}
        </ul>
        {keeping.length >= rules.maxKeepers && <button type="button" onClick={() => setPicking(true)} className="w-full border-t border-line py-2.5 text-xs font-semibold text-muted">Swap or add players</button>}
      </Card>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Your roster" sub="Best keeps first · ★ = suggested">
        <ul className="flex flex-col gap-1.5 pb-2">
          {[...rows].sort((a, b) => Number(!!b.costRound) - Number(!!a.costRound) || (b.surplus ?? -99) - (a.surplus ?? -99)).map((r) => {
            const can = !!r.costRound && (r.slots.length > 0 || !!r.keptAt);
            return (
              <li key={r.playerId}>
                <button type="button" disabled={!can} onClick={() => {
                  setKeep(r.playerId, r.planned ? "none" : r.keptAt ?? r.slots[0]?.key ?? "none");
                  // Filling the last spot closes the sheet so you see the new keeper land in the lineup.
                  if (!r.planned && keeping.length + 1 >= rules.maxKeepers) setTimeout(() => setPicking(false), 220);
                }}
                  className={cx("flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40", r.planned ? "border-acc bg-acc-soft" : "border-line bg-panel2 hover:border-acc/50")}>
                  <KeepGrade g={keeperGrade(r.surplus)} />
                  <PlayerImg id={r.playerId} name={r.name} pos={r.pos} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-sm font-semibold"><span className="truncate">{r.name}</span>{r.recommended && <span className="shrink-0 text-acc-ink">★</span>}</div>
                    <div className="truncate text-[11px] text-muted">{r.pos}{r.team ? ` · ${r.team}` : ""} · {r.costRound ? `keep Rd ${r.costRound} · goes Rd ${r.expectedRound}` : r.ineligible ?? "can't be kept"}</div>
                  </div>
                  {r.roundsSaved !== null && r.costRound ? <span className={cx("num w-10 shrink-0 text-right text-sm font-bold", r.roundsSaved > 0 ? "text-pos" : r.roundsSaved < 0 ? "text-neg" : "text-muted")}>{r.roundsSaved > 0 ? "+" : ""}{r.roundsSaved}<span className="block text-[9px] font-normal text-muted">rounds</span></span> : null}
                  <span key={r.planned ? "on" : "off"} className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", r.planned ? "fhq-check bg-acc text-on-acc" : "border border-line text-muted")}>{r.planned ? <Check size={15} /> : <Plus size={15} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      <DraftBoard board={board} order={order} rounds={rounds} teamName={teamName} myRosterId={myRosterId} season={season} />

      <Card title="Other teams' likely keepers" collapse summary={`${others.length} teams`} info={<>SHS predicts each team&apos;s keepers with your league&apos;s rules: mostly next season&apos;s gain at the price he&apos;d cost (a player keepable late beats an equal player keepable early), plus a little long-term dynasty value. Up to {rules.maxKeepers} per team, only when worth it.</>} pad={false}>
        <ul className="divide-y divide-line">
          {others.map((t) => (
            <li key={t.rosterId} data-team={t.rosterId} className="cursor-pointer px-4 py-2.5 sm:px-5">
              <div className="text-sm font-semibold">{t.name}</div>
              {t.keepers.length ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {t.keepers.map((k) => (
                    <span key={k.playerId} className={cx("rounded-lg border px-2 py-1 text-xs", POS_TINT[k.pos] ?? "border-line bg-panel2")}>
                      <b>{k.name}</b> · {k.pos} · Rd {k.costRound}{k.at ? ` (${k.at})` : ""}<span className="opacity-80"> · would go Rd {k.expectedRound}</span>
                    </span>
                  ))}
                </div>
              ) : <div className="text-xs text-muted">No keeper worth the price.</div>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Next season's draft board, Sleeper-style: rounds down, teams across, keepers filled in. */
function DraftBoard({ board, order, rounds, teamName, myRosterId, season }: { board: BoardCell[]; order: number[]; rounds: number; teamName: (rid: number) => string; myRosterId: number; season: number }) {
  const [all, setAll] = useState(true);
  const show = all ? rounds : Math.min(rounds, 8);
  const lastKeeperRound = Math.max(0, ...board.filter((c) => c.keeper).map((c) => c.round));
  const visible = Math.max(show, all ? rounds : lastKeeperRound);
  const strip = useRef<HTMLDivElement>(null);
  useHPan(strip);
  return (
    <Card title={`${season} draft board`} collapse id="keeper-board" summary="Tap to see every round" pad={false} info={<>Order is estimated from projected final standings (worst record picks first){" "}and snakes each round; traded picks are shown under their new owner. Yellow-ringed = your keepers; the rest are SHS&apos;s predictions for each team. Colours by position.</>}>
      <div ref={strip} className="overflow-x-auto overscroll-x-contain" data-no-swipe>
        <table className="border-separate border-spacing-1 px-2 py-2 text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-panel" />
              {order.map((rid, i) => (
                <th key={rid} className={cx("w-28 min-w-28 rounded-md px-1 py-1.5 text-left font-semibold", rid === myRosterId ? "bg-acc-soft text-acc-ink" : "bg-panel2 text-muted")}>
                  <div className="num text-[10px] opacity-70">Slot {i + 1}</div><div className="truncate">{teamName(rid)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: visible }, (_, i) => i + 1).map((r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 bg-panel pr-1 text-center font-bold text-muted">R{r}</td>
                {board.filter((c) => c.round === r).sort((a, b) => order.indexOf(a.originalRosterId) - order.indexOf(b.originalRosterId)).map((c) => {
                  const k = c.keeper;
                  const traded = c.ownerRosterId !== c.originalRosterId;
                  return (
                    <td key={c.key} className="align-top">
                      <div className={cx("h-14 w-28 rounded-md border px-1.5 py-1",
                        k ? cx(POS_TINT[k.pos] ?? "border-line bg-panel2", k.mine ? "ring-2 ring-acc" : "opacity-80") : c.ownerRosterId === myRosterId ? "border-acc/50 bg-acc-soft/40" : "border-line bg-panel2/50")}>
                        <div className="flex justify-between text-[10px] opacity-75"><span className="num">{c.label}</span>{k && <span>{k.pos}</span>}</div>
                        {k ? <div className="truncate font-semibold">{k.name}</div> : <div className="truncate text-muted">{traded ? `→ ${teamName(c.ownerRosterId)}` : ""}</div>}
                        {k && <div className="truncate text-[10px] opacity-75">{k.mine ? "your keeper" : "predicted"}{traded ? ` · ${teamName(c.ownerRosterId)}` : ""}</div>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible < rounds && <button type="button" onClick={() => setAll(true)} className="w-full border-t border-line py-2.5 text-sm font-semibold text-acc-ink">Show all {rounds} rounds</button>}
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5 text-[11px]">
        {Object.entries(POS_TINT).map(([p, c]) => <span key={p} className={cx("rounded border px-1.5 py-0.5", c)}>{p}</span>)}
        <span className="text-muted">· solid yellow ring = your keeper · dashed = predicted · → = pick traded to that team</span>
      </div>
    </Card>
  );
}

/** Keep grade chip: green A/B, neutral C, red D/F. */
function KeepGrade({ g }: { g: string | null }) {
  if (!g) return <span className="num grid h-7 w-9 shrink-0 place-items-center rounded-lg bg-panel2 text-sm font-extrabold text-muted">—</span>;
  const tone = g.startsWith("A") ? "bg-pos/20 text-pos" : g.startsWith("B") ? "bg-pos/10 text-pos" : g.startsWith("C") ? "bg-panel2 text-fg" : "bg-neg/15 text-neg";
  return <span title="Keep grade: next-season value over what that round's pick usually gets" className={cx("num grid h-7 w-9 shrink-0 place-items-center rounded-lg text-sm font-extrabold", tone)}>{g}</span>;
}

/**
 * A kept player, lineup-style: grade, photo and name, then a round bar — dot = where he'd go next year, tick = what
 * he costs; the stretch between is the rounds you save (green) or overpay (red). Keep-at pick and custom cost tuck
 * into small chips.
 */
function KeeperSlotCard({ r, rounds, over, onRemove, onAt, onCost, cellLabel }: {
  r: Row; rounds: number; over: boolean; onRemove: () => void; onAt: (key: string) => void; onCost: (round: number) => void; cellLabel: (k: string | null) => string | null;
}) {
  const x = (round: number) => `${((Math.min(rounds, Math.max(1, round)) - 0.5) / rounds) * 100}%`;
  const cost = r.costRound ?? rounds, go = r.expectedRound;
  const saved = cost - go;
  const lo = Math.min(cost, go), hi = Math.max(cost, go);
  return (
    <div className={cx("fhq-pop flex flex-col gap-2 px-4 py-3 sm:px-5", over && "bg-neg/10")}>
      <div className="flex items-center gap-3">
        <KeepGrade g={keeperGrade(r.surplus)} />
        <PlayerImg id={r.playerId} name={r.name} pos={r.pos} size={42} />
        <div className="min-w-0 flex-1">
          <PlayerLink id={r.playerId} name={r.name} className="block truncate text-sm font-bold" />
          <div className="truncate text-[11px] text-muted">{r.pos}{r.team ? ` · ${r.team}` : ""}{r.age ? ` · ${Math.floor(r.age)}` : ""}{r.yearsKept ? ` · kept ${r.yearsKept}×` : ""}{r.surplus !== null ? ` · ${signed(r.surplus)} pts/g` : ""}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-sm font-extrabold">Rd {r.costRound ?? "—"}</div>
          <div className={cx("num text-[10px] font-bold", saved > 0 ? "text-pos" : saved < 0 ? "text-neg" : "text-muted")}>{saved > 0 ? `saves ${saved}` : saved < 0 ? `${-saved} early` : "at value"}</div>
        </div>
        <button type="button" aria-label={`Don't keep ${r.name}`} onClick={onRemove} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neg/50 text-neg hover:bg-neg hover:text-white"><X size={14} /></button>
      </div>
      <div className="relative ml-[3.25rem] h-4" aria-label={`Would go round ${go}, costs round ${cost}`}>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-panel2" />
        <div className={cx("absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full", saved >= 0 ? "bg-pos" : "bg-neg")} style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-fg" style={{ left: x(go) }} title={`Would go round ${go}`} />
        <div className="absolute top-0 h-4 w-1 -translate-x-1/2 rounded bg-acc" style={{ left: x(cost) }} title={`Costs round ${cost}`} />
      </div>
      <div className="ml-[3.25rem] flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted">goes Rd {go} ·</span>
        <label className="relative rounded-md bg-panel2 px-2 py-0.5 font-semibold">
          at {r.keptAt ? cellLabel(r.keptAt) ?? r.slots.find((s) => s.key === r.keptAt)?.label ?? "—" : "—"} ▾
          <select aria-label={`Keep ${r.name} at`} className="absolute inset-0 opacity-0" value={r.keptAt ?? ""} onChange={(e) => onAt(e.target.value)}>
            {r.slots.map((s) => <option key={s.key} value={s.key}>{s.label}{s.via ? ` (via ${s.via})` : ""}</option>)}
            {r.keptAt && !r.slots.some((s) => s.key === r.keptAt) && <option value={r.keptAt}>{cellLabel(r.keptAt)}</option>}
          </select>
        </label>
        <label className="relative rounded-md bg-panel2 px-2 py-0.5 font-semibold text-muted">
          {r.costSource === "manual" ? "custom cost" : "cost by rules"} ▾
          <select aria-label={`Cost for ${r.name}`} className="absolute inset-0 opacity-0" value={r.costSource === "manual" ? r.costRound ?? 0 : 0} onChange={(e) => onCost(Number(e.target.value))}>
            <option value={0}>By rules</option>
            {Array.from({ length: rounds }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Round {n}</option>)}
          </select>
        </label>
        {r.slotNote && <span className="text-warn">{r.slotNote}</span>}
        {over && <span className="font-bold text-neg">over the limit</span>}
      </div>
    </div>
  );
}
