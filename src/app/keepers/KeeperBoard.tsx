"use client";

import { applySettings } from "@/lib/actions";
import { useState, type ReactNode } from "react";
import { PlayerLink } from "@/components/PlayerCard";
import { Segmented } from "@/components/client";
import { Card, InfoButton, cx, signed, Info } from "@/components/ui";
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

export function KeeperBoard({ leagueId, rows, rules, rounds, teams, draftType, sleeperMax, season, board, order, others, teamName, myRosterId, hasPlan }: {
  leagueId: string; rows: Row[]; rules: KeeperRules; rounds: number; teams: number; draftType: string | null; sleeperMax: number | null; season: number;
  board: BoardCell[]; order: number[]; others: Others; teamName: (rid: number) => string; myRosterId: number; hasPlan: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
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
    <div className={cx("flex flex-col gap-4 transition-opacity", busy && "opacity-60")}>
      <Card title="Keeper rules" info={<>These rules turn each player&apos;s draft slot (pulled from Sleeper) into next season&apos;s cost. Draft: {rounds} rounds × {teams} teams{draftType ? ` (${draftType})` : ""}.</>}>
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
      </Card>

      <Card title={`Your keepers for ${season}`} right={<div className="flex items-center gap-2"><InfoButton open={help} onClick={() => setHelp(!help)} label="How to read this" />{hasPlan && <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => save({ planReset: true })}>Use recommended</button>}</div>} pad={false}>
        {help && (
          <div className="fhq-in border-b border-line bg-panel2/50 px-4 py-3 text-xs leading-relaxed text-muted">
            <p><b className="text-fg">Drafted</b> = where he went in this season&apos;s Sleeper draft (round.pick and overall pick #), or kept / undrafted.</p>
            <p className="mt-1"><b className="text-fg">Costs</b> = the round you give up next season under your rules. <b className="text-fg">Would go</b> = the round he&apos;d likely be drafted in if nobody kept him.</p>
            <p className="mt-1"><b className="text-fg">Rounds saved</b> = how much later you get him than he&apos;d go (+3 = you keep a round-4 talent with a round-7 pick).</p>
            <p className="mt-1"><b className="text-fg">Gain</b> = how many more fantasy points per game he should score than the player you&apos;d typically get with that same pick. It&apos;s what KEEP is based on, because a round saved early in the draft is worth more than a round saved late.</p>
            <p className="mt-1"><b className="text-fg">Keep at</b> = which of your picks he uses. Change it to plan your board.</p>
          </div>
        )}
        <div className="border-b border-line px-4 py-2 text-xs text-muted sm:px-5">Keeping {keeping.length} of {rules.maxKeepers}{keeping.length > rules.maxKeepers ? <b className="text-neg"> · over the limit</b> : ""}{hasPlan ? " · your plan" : " · recommended"}</div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.playerId} className={cx("grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(0,1.3fr)_6.5rem_6.5rem_5.5rem_5rem_9rem] sm:items-center sm:px-5", r.planned && "bg-acc-soft")}>
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <div className="flex min-w-0 items-center gap-2">
                  <KeepGrade g={keeperGrade(r.surplus)} />
                  <PlayerLink id={r.playerId} name={r.name} className="min-w-0 truncate font-semibold" />
                  {r.planned && <span className="shrink-0 rounded bg-acc px-1.5 py-0.5 text-[10px] font-extrabold text-on-acc">KEEP</span>}
                </div>
                <div className="truncate text-xs text-muted">{r.pos}{r.team ? ` · ${r.team}` : ""}{r.age ? ` · age ${Math.floor(r.age)}` : ""}{r.yearsKept ? ` · kept ${r.yearsKept} season${r.yearsKept === 1 ? "" : "s"}` : ""}</div>
              </div>
              <div className="text-xs">
                <div className="text-[10px] uppercase tracking-wider text-muted">Drafted</div>
                {r.draftedRound ? <><b className="num text-sm">{pickLabel(r)}</b> <span className="text-muted">#{r.draftedOverall}</span><div className="truncate text-[11px] text-muted">{r.wasKeeper ? "as a keeper" : r.draftedBy ? `by ${r.draftedBy}` : ""}</div></> : <span className="text-muted">Undrafted (waivers)</span>}
              </div>
              <div className="text-xs">
                <div className="text-[10px] uppercase tracking-wider text-muted">Costs · would go</div>
                {r.costRound ? <><b className="num text-sm">Rd {r.costRound}</b> <span className="text-muted">· Rd {r.expectedRound}</span><div className="text-[11px] text-muted">{r.costSource === "manual" ? "custom cost" : r.costSource === "undrafted" ? "pickup rule" : "draft rule"}{r.capped ? " · capped" : ""}</div></> : <span className="font-semibold text-neg">{r.ineligible ?? "Can't be kept"}</span>}
              </div>
              <div className="text-xs">
                <div className="text-[10px] uppercase tracking-wider text-muted">Rounds saved</div>
                {r.roundsSaved === null ? "—" : <b className={cx("num text-sm", r.roundsSaved > 0 ? "text-pos" : r.roundsSaved < 0 ? "text-neg" : "")}>{r.roundsSaved > 0 ? `+${r.roundsSaved}` : r.roundsSaved}</b>}
              </div>
              <div className="text-xs">
                <div className="text-[10px] uppercase tracking-wider text-muted">Gain / game</div>
                {r.surplus === null ? "—" : <b className={cx("num text-sm", r.surplus > 0 ? "text-pos" : "text-neg")}>{signed(r.surplus)} pts</b>}
              </div>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <select aria-label={`Keep ${r.name} at`} className="rounded-md border border-line bg-panel2 px-2 py-1.5 text-xs" disabled={!r.costRound}
                  value={r.planned && r.keptAt ? r.keptAt : "none"} onChange={(e) => setKeep(r.playerId, e.target.value)}>
                  <option value="none">Don&apos;t keep</option>
                  {r.slots.map((s) => <option key={s.key} value={s.key}>Keep at {s.label}{s.via ? ` (via ${s.via})` : " (your pick)"}</option>)}
                  {r.planned && r.keptAt && !r.slots.some((s) => s.key === r.keptAt) && <option value={r.keptAt}>Keep at {cellLabel(r.keptAt)}</option>}
                </select>
                {r.slotNote && <span className="text-[11px] text-warn">{r.slotNote}</span>}
                <select aria-label={`Cost for ${r.name}`} className="rounded-md border border-line bg-panel2 px-2 py-1 text-[11px] text-muted" value={r.costSource === "manual" ? r.costRound ?? 0 : 0} onChange={(e) => save({ override: { playerId: r.playerId, round: Number(e.target.value) } })}>
                  <option value={0}>Cost: by rules</option>
                  {Array.from({ length: rounds }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Cost: round {n}</option>)}
                </select>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <DraftBoard board={board} order={order} rounds={rounds} teamName={teamName} myRosterId={myRosterId} season={season} />

      <Card title="Other teams' likely keepers" info={<>SHS predicts each team&apos;s keepers with your league&apos;s rules: mostly next season&apos;s gain at the price he&apos;d cost (a player keepable late beats an equal player keepable early), plus a little long-term dynasty value. Up to {rules.maxKeepers} per team, only when worth it.</>} pad={false}>
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
  const [all, setAll] = useState(false);
  const show = all ? rounds : Math.min(rounds, 8);
  const lastKeeperRound = Math.max(0, ...board.filter((c) => c.keeper).map((c) => c.round));
  const visible = Math.max(show, all ? rounds : lastKeeperRound);
  return (
    <Card title={`${season} draft board`} pad={false} info={<>Order is estimated from projected final standings (worst record picks first){" "}and snakes each round; traded picks are shown under their new owner. Yellow-ringed = your keepers; the rest are SHS&apos;s predictions for each team. Colours by position.</>}>
      <div className="overflow-x-auto overscroll-x-contain" data-no-swipe>
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
