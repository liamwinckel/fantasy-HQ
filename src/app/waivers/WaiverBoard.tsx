"use client";

import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { InjuryChip, NflLogo, cx, signed } from "@/components/ui";
import { AiChip } from "@/components/ShsAiParts";
import { waiverImpact } from "@/lib/services/waivers";
import { useApp } from "@/components/AppData";

export interface WaiverRow {
  /** SHS AI ±% this week and rest of season (or dynasty). */
  aiWeek?: number | null; aiRos?: number | null; aiRosLabel?: string;
  id: string; name: string; pos: string; team: string | null; age: number | null; injury: string | null;
  median: number; weekGain: number; rosGain: number; value: number; reasons: string[]; dropId: string | null; dropName: string | null; fills: string | null; base: number;
}
export interface MyPlayer { id: string; name: string; pos: string; value: number }

export function WaiverBoard({ leagueId, rows, roster, full, limit, used, valueLabel, lastWeek }: {
  leagueId: string; rows: WaiverRow[]; roster: MyPlayer[]; full: boolean; limit: number; used: number; valueLabel: string; lastWeek: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <div className={cx("flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-xs", full ? "text-warn" : "text-muted")}>
        Roster spots: <b>{used}/{limit}</b>{full ? " · full: every add needs a drop" : ` · ${limit - used} open`}
        <span className="text-muted">· Tap a player to see the impact on your team</span>
      </div>
      <div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-3 py-2.5 font-semibold sm:px-5">Player</th>
              <th className="px-2 py-2.5 text-right font-semibold" title="Sleeper projection this week, in your league's scoring">Proj · wk</th>
              <th className="hidden px-2 py-2.5 text-right font-semibold md:table-cell" title="Sleeper rest-of-season projection per game">Proj · RoS/g</th>
              <th className="hidden px-2 py-2.5 text-right font-semibold md:table-cell" title="Extra points your best lineup scores this week">Lineup gain · wk</th>
              <th className="px-2 py-2.5 text-right font-semibold" title={`Extra points your best lineups score through Week ${lastWeek}`}><span className="md:hidden">Gain RoS</span><span className="hidden md:inline">Lineup gain · season</span></th>
              <th className="hidden px-2 py-2.5 text-right font-semibold md:table-cell" title="SHS trade value, 0–100 in this league">{valueLabel}</th>
              <th className="hidden px-5 py-2.5 font-semibold lg:table-cell">Why</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <Fragment key={w.id}>
                <tr onClick={() => setOpen(open === w.id ? null : w.id)} className={cx("cursor-pointer border-t border-line align-top transition-colors hover:bg-panel2", open === w.id && "bg-acc-soft")}>
                  <td className="px-3 py-3 sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <PlayerImg id={w.id} name={w.name} pos={w.pos} />
                      <div className="min-w-0"><div className="flex items-center gap-1.5 font-semibold"><PlayerLink id={w.id} name={w.name} /><InjuryChip status={w.injury} /></div>{(w.aiWeek != null || w.aiRos != null) && <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted">{w.aiWeek != null && <span className="flex items-center gap-0.5">wk <AiChip v={w.aiWeek} /></span>}{w.aiRos != null && <span className="flex items-center gap-0.5">{w.aiRosLabel ?? "ROS"} <AiChip v={w.aiRos} /></span>}</div>}<div className="flex items-center gap-1 text-xs text-muted"><NflLogo team={w.team} size={14} />{w.pos}{w.team ? ` · ${w.team}` : ""}{w.age ? ` · age ${Math.floor(w.age)}` : ""}</div>{w.fills && <span className="mt-1 inline-block rounded bg-acc px-1.5 py-0.5 text-[10px] font-bold uppercase text-on-acc">Fills {w.fills}</span>}</div>
                    </div>
                  </td>
                  <td className="num px-2 py-3 text-right">{w.median.toFixed(1)}</td>
                  <td className="num hidden px-2 py-3 text-right md:table-cell">{w.base.toFixed(1)}</td>
                  <td className="num hidden px-2 py-3 text-right md:table-cell">{w.weekGain > 0 ? <span className="text-pos">{signed(w.weekGain)}</span> : "—"}</td>
                  <td className="num px-2 py-3 text-right">{w.rosGain > 0 ? <span className="font-semibold text-pos">{signed(w.rosGain)}</span> : "—"}</td>
                  <td className="num hidden px-2 py-3 text-right font-bold text-acc-ink md:table-cell">{w.value.toFixed(1)}</td>
                  <td className="hidden px-5 py-3 text-xs text-muted lg:table-cell">{w.reasons.slice(0, 2).join(" ") || "Depth / stash option."}</td>
                  <td className="py-3 pr-3"><ChevronDown size={16} className={cx("text-muted transition-transform", open === w.id && "rotate-180")} /></td>
                </tr>
                {open === w.id && (
                  <tr className="bg-acc-soft/40"><td colSpan={8} className="px-2 pb-4 pt-1 sm:px-5"><p className="mb-2 px-1 text-xs text-muted lg:hidden">{w.reasons.slice(0, 2).join(" ") || "Depth / stash option."}</p><Impact leagueId={leagueId} row={w} roster={roster} full={full} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Impact({ leagueId, row, roster, full }: { leagueId: string; row: WaiverRow; roster: MyPlayer[]; full: boolean }) {
  const [drop, setDrop] = useState<string | null>(full ? row.dropId : null);
  const { ctx } = useApp();
  void leagueId;
  const res = ctx && ctx.myRosterId !== null && (!full || drop) ? waiverImpact(ctx, ctx.myRosterId, row.id, drop) : null;
  const err = full && !drop ? "Your roster is full. Pick a player to drop: losing him counts against the add." : null;
  const d = (a: number, b: number) => <span className={cx("font-bold", b - a > 0.05 ? "text-pos" : b - a < -0.05 ? "text-neg" : "text-muted")}>{signed(b - a)}</span>;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>Add <b>{row.name}</b></span>
        <label className="flex items-center gap-2">
          <span className="text-muted">{full ? "and drop" : "and drop (optional)"}</span>
          <select value={drop ?? ""} onChange={(e) => setDrop(e.target.value || null)} className="rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm">
            {!full && <option value="">Nobody (open spot)</option>}
            {full && !drop && <option value="">Choose a player…</option>}
            {roster.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.pos}) · value {p.value.toFixed(1)}{p.id === row.dropId ? " · suggested" : ""}</option>)}
          </select>
        </label>
      </div>
      {err && <p className="text-sm text-warn">{err}</p>}
      {res && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Box label="Best lineup this week">{res.weekBefore.toFixed(1)} → <b>{res.weekAfter.toFixed(1)}</b> {d(res.weekBefore, res.weekAfter)}</Box>
          <Box label="Best lineups, rest of season">{res.rosBefore.toFixed(0)} → <b>{res.rosAfter.toFixed(0)}</b> {d(res.rosBefore, res.rosAfter)}</Box>
          <Box label="Power score · rank">{res.power.before.score.toFixed(0)} → <b>{res.power.after.score.toFixed(0)}</b> · #{res.power.before.rank} → <b>#{res.power.after.rank}</b></Box>
          <Box label="Roster value change"><span className={cx("font-bold", res.valueChange >= 0 ? "text-pos" : "text-neg")}>{signed(res.valueChange)}</span>{res.drop ? <span className="text-muted"> (minus {res.drop.name})</span> : null}</Box>
          <div className="flex flex-wrap gap-1.5 sm:col-span-4">
            {res.positions.map((p) => (
              <span key={p.pos} className={cx("flex items-center gap-1 rounded-md border px-2 py-1 text-xs", p.after < p.before ? "border-pos/60 text-pos" : p.after > p.before ? "border-neg/60 text-neg" : "border-line text-muted")}>
                <b className="text-fg">{p.pos}</b> {p.before} → {p.after}{p.after < p.before ? <ArrowUp size={12} /> : p.after > p.before ? <ArrowDown size={12} /> : null}
              </span>
            ))}
            <span className="text-[11px] text-muted">positional rank (1 = best)</span>
          </div>
        </div>
      )}
    </div>
  );
}

const Box = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-lg bg-panel2 p-3"><div className="text-[11px] text-muted">{label}</div><div className="num mt-0.5 text-sm">{children}</div></div>
);
