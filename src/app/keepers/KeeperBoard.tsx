"use client";

import { applySettings } from "@/lib/actions";
import { useState } from "react";
import { PlayerLink } from "@/components/PlayerCard";
import { Segmented } from "@/components/client";
import { Card, Tag, cx, signed, Info } from "@/components/ui";
import type { KeeperRules } from "@/lib/engine/keepers";

interface Row {
  playerId: string; name: string; pos: string; team: string | null; age: number | null; draftedRound: number | null; wasKeeper: boolean;
  costRound: number | null; costSource: string; capped: boolean; nextSeasonPpg: number; keeperValue: number; roundValue: number; surplus: number | null; recommended: boolean;
}

export function KeeperBoard({ leagueId, rows, rules, rounds, sleeperMax, season }: { leagueId: string; rows: Row[]; rules: KeeperRules; rounds: number; sleeperMax: number | null; season: number }) {
  const [busy, setBusy] = useState(false);
  const save = async (patch: object) => {
    setBusy(true);
    await applySettings({ keeper: { leagueId, ...patch } });
    setBusy(false);
  };
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.keeperValue, r.roundValue)));
  const input = "rounded-lg border border-line bg-panel2 px-3 py-2 text-sm";
  return (
    <div className={cx("flex flex-col gap-4 transition-opacity", busy && "opacity-60")}>
      <Card title="Keeper rules">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted">Keepers per team
            <input type="number" min={0} max={30} defaultValue={rules.maxKeepers} className={input} onBlur={(e) => save({ maxKeepers: Number(e.target.value) })} />
            {sleeperMax && <span>Sleeper setting: {sleeperMax}</span>}
          </label>
          <div className="flex flex-col gap-1 text-xs text-muted">Cost vs this year&apos;s round
            <Segmented label="Keeper round modifier" value={rules.modifier} onChange={(m) => save({ modifier: m })} options={[{ value: "same", label: "Same" }, { value: "+1", label: "+1" }, { value: "+2", label: "+2" }, { value: "+3", label: "+3" }]} />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted">&quot;+&quot; moves the cost
            <Segmented label="Modifier direction" value={rules.direction} onChange={(d) => save({ direction: d })} options={[{ value: "earlier", label: "Earlier (pricier)" }, { value: "later", label: "Later" }]} />
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted">Undrafted / waiver pickups cost
            <select className={input} defaultValue={rules.undraftedRound} onChange={(e) => save({ undraftedRound: Number(e.target.value) })}>
              {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => <option key={r} value={r}>Round {r}{r === rounds ? " (last)" : ""}</option>)}
            </select>
          </label>
        </div>
        <Info className="mt-3">Example: with &quot;+1&quot; and &quot;Earlier&quot;, a player drafted in round 6 costs your round-5 pick in {season}. Set any player&apos;s cost by hand in the table (&quot;Custom&quot;).</Info>
      </Card>

      <Card title={`Your keeper options for ${season}`} right={<Tag kind="MODEL" />} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-3 py-2.5 font-semibold sm:px-5">Player</th>
                <th className="hidden px-2 py-2.5 font-semibold sm:table-cell" title="Round drafted this season">Drafted</th>
                <th className="px-2 py-2.5 font-semibold" title="Round you give up next season">Cost</th>
                <th className="hidden px-2 py-2.5 text-right font-semibold md:table-cell" title="Projected points per game next season (age-adjusted)">Next season</th>
                <th className="hidden px-2 py-2.5 font-semibold lg:table-cell" title="Player's value vs what a pick in that round usually returns (points per game above replacement)">Player value vs round value</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Player value minus round value">Surplus</th>
                <th className="px-3 py-2.5 font-semibold sm:px-5">Set cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId} className={cx("border-t border-line transition-colors", r.recommended && "bg-acc-soft")}>
                  <td className="px-3 py-2.5 sm:px-5">
                    <div className="flex items-center gap-2">
                      {r.recommended && <span className="rounded bg-acc px-1.5 py-0.5 text-[10px] font-extrabold text-on-acc">KEEP</span>}
                      <PlayerLink id={r.playerId} name={r.name} className="font-semibold" />
                    </div>
                    <div className="text-xs text-muted">{r.pos}{r.team ? ` · ${r.team}` : ""}{r.age ? ` · ${Math.floor(r.age)}` : ""}{r.wasKeeper ? " · kept this year" : ""}</div>
                  </td>
                  <td className="num hidden px-2 py-2.5 sm:table-cell">{r.draftedRound ? `R${r.draftedRound}` : <span className="text-muted">Undrafted</span>}</td>
                  <td className="num px-2 py-2.5">{r.costRound ? <b>R{r.costRound}</b> : <span className="text-neg">Not eligible</span>}<div className="text-[11px] text-muted">{r.costSource === "manual" ? "custom" : r.costSource}{r.capped ? " · capped" : ""}</div></td>
                  <td className="num hidden px-2 py-2.5 text-right md:table-cell">{r.nextSeasonPpg.toFixed(1)}</td>
                  <td className="hidden min-w-48 px-2 py-2.5 lg:table-cell">
                    <div className="flex flex-col gap-1">
                      <div className="h-2 rounded-full bg-panel2"><div className="h-2 rounded-full bg-acc transition-[width] duration-500" style={{ width: `${(100 * r.keeperValue) / maxV}%` }} /></div>
                      <div className="h-2 rounded-full bg-panel2"><div className="h-2 rounded-full bg-muted transition-[width] duration-500" style={{ width: `${(100 * r.roundValue) / maxV}%` }} /></div>
                    </div>
                  </td>
                  <td className={cx("num px-2 py-2.5 text-right font-bold", r.surplus === null ? "text-muted" : r.surplus > 0 ? "text-pos" : "text-neg")}>{r.surplus === null ? "—" : signed(r.surplus)}</td>
                  <td className="px-3 py-2.5 sm:px-5">
                    <select aria-label={`Keeper cost for ${r.name}`} className="rounded-md border border-line bg-panel2 px-2 py-1 text-xs" value={r.costSource === "manual" ? r.costRound ?? 0 : 0} onChange={(e) => save({ override: { playerId: r.playerId, round: Number(e.target.value) } })}>
                      <option value={0}>Auto</option>
                      {Array.from({ length: rounds }, (_, i) => i + 1).map((n) => <option key={n} value={n}>R{n}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-line px-5 py-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-acc" />Player value next season</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-muted" />Typical value of a pick in that round</span>
          <span>KEEP = best {rules.maxKeepers} by surplus. Values are projected points per game above replacement.</span>
        </div>
      </Card>
    </div>
  );
}
