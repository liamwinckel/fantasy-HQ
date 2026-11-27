"use client";

/** The most valuable keepers in the league: production, positional rank and keep cost, late keeps first. */
import { useState } from "react";
import Link from "next/link";
import { Card, cx } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import type { MarketKeeper } from "@/lib/services/keeperData";
import { POS_TINT } from "./KeeperBoard";

export function KeeperMarket({ market, rounds, partnerLink }: { market: MarketKeeper[]; rounds: number; partnerLink: (rid: number, pid: string) => string }) {
  const [f, setF] = useState<"targets" | "all" | "mine">("targets");
  const [pos, setPos] = useState("ALL");
  const list = market.filter((m) => (f === "all" || (f === "mine" ? m.mine : !m.mine)) && (pos === "ALL" || m.pos === pos)).slice(0, 25);
  return (
    <Card title="League keeper values" collapse info={<>Every keeper-eligible player in the league, ranked by how much cheaper he is to keep than where he&apos;d go in next year&apos;s draft. <b>Rounds saved</b> = where he&apos;d be drafted vs the round it costs to keep him. Late keeps get extra weight: a top-10 receiver kept in round 14 beats a top-5 receiver kept in round 3, because the late pick costs almost nothing. <b>Targets</b> = other teams&apos; players, worth trading for before the deadline.</>} pad={false}>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-1 sm:px-5">
        {(["targets", "all", "mine"] as const).map((k) => <button key={k} type="button" onClick={() => setF(k)} className={cx("rounded-full border px-3 py-1 text-xs font-semibold", f === k ? "border-acc bg-acc text-on-acc" : "border-line text-muted")}>{k === "targets" ? "Trade targets" : k === "all" ? "Whole league" : "Mine"}</button>)}
        <span className="ml-auto flex gap-1">{["ALL", "QB", "RB", "WR", "TE"].map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("rounded px-1.5 py-0.5 text-[11px] font-semibold", pos === p ? "bg-panel2 text-fg" : "text-muted")}>{p}</button>)}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] gap-2 border-y border-line bg-panel2/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-5"><span>Player · team</span><span className="text-right">Rank</span><span className="text-right">Keep</span><span className="text-right">Saved</span></div>
      <ul className="divide-y divide-line">
        {list.map((m) => (
          <li key={m.playerId} className={cx("grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] items-center gap-2 px-4 py-2 sm:px-5", m.mine && "bg-acc-soft")}>
            <div className="flex min-w-0 items-center gap-2">
              <PlayerImg id={m.playerId} name={m.name} pos={m.pos} size={32} />
              <div className="min-w-0">
                <PlayerLink id={m.playerId} name={m.name} className="block truncate text-sm font-semibold" />
                <div className="truncate text-[11px] text-muted">{m.healthyPpg.toFixed(1)} pts/g · {m.mine ? "Yours" : <Link href={partnerLink(m.rosterId, m.playerId)} className="underline decoration-line underline-offset-2">{m.teamName}</Link>}{m.late && <span className="ml-1 rounded bg-acc px-1 text-[9px] font-bold uppercase text-on-acc">Late keep</span>}</div>
              </div>
            </div>
            <span className={cx("num justify-self-end rounded border px-1.5 py-0.5 text-[11px] font-bold", POS_TINT[m.pos])}>{m.pos}{m.posRank}</span>
            <span className="num text-right text-sm font-bold">R{m.costRound}</span>
            <span className="text-right"><span className={cx("num text-sm font-bold", (m.roundsSaved ?? 0) > 0 ? "text-pos" : "text-neg")}>{(m.roundsSaved ?? 0) > 0 ? "+" : ""}{m.roundsSaved}</span><span className="block text-[10px] text-muted">goes R{m.expectedRound}</span></span>
          </li>
        ))}
        {!list.length && <li className="px-5 py-3 text-sm text-muted">No keepers here.</li>}
      </ul>
      <p className="px-4 py-2 text-[11px] text-muted sm:px-5">Rank = positional rank by healthy points per game. Keep = round it costs ({rounds} rounds). Tap a team to open a trade with them for that player.</p>
    </Card>
  );
}
