"use client";

/** Home-screen keeper readout: your keepers and what they cost, plus the best-value keepers to target in the league. */
import Link from "next/link";
import { Card, cx } from "./ui";
import { PlayerImg } from "./client";
import { PlayerLink } from "./PlayerCard";
import type { loadKeeperPlan } from "@/lib/services/keeperData";

type Plan = Awaited<ReturnType<typeof loadKeeperPlan>>;

export function KeeperReadout({ plan }: { plan: Plan | null; loading?: boolean }) {
  if (!plan) return <Card title="Keepers"><p className="text-sm text-muted">Loading your keeper plan…</p></Card>;
  const mine = plan.rows.filter((r) => r.planned).sort((a, b) => (b.roundsSaved ?? 0) - (a.roundsSaved ?? 0));
  const targets = plan.market.filter((m) => !m.mine).slice(0, 4);
  const cell = (key: string | null) => plan.board.find((c) => c.key === key)?.label ?? null;
  return (
    <Card title={`Keepers · ${plan.season} draft`} href="/keepers/" info={<>Your {plan.hasPlan ? "planned" : "recommended"} keepers, the pick each one costs, and how many rounds earlier he&apos;d go if you didn&apos;t keep him (rounds saved). Targets are other teams&apos; players with the biggest keeper value, late-round keeps first. Tap for the full Keeper Planner.</>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Your keepers ({mine.length}/{plan.rules.maxKeepers})</div>
          {mine.length ? (
            <ul className="flex flex-col gap-2">
              {mine.map((r) => (
                <li key={r.playerId} className="flex items-center gap-3 rounded-xl border border-acc/50 bg-acc-soft px-3 py-2">
                  <PlayerImg id={r.playerId} name={r.name} pos={r.pos} size={34} />
                  <div className="min-w-0 flex-1"><PlayerLink id={r.playerId} name={r.name} className="block truncate text-sm font-bold" /><div className="text-[11px] text-muted">{r.pos} · keep at {cell(r.keptAt) ?? `R${r.costRound}`} · would go R{r.expectedRound}</div></div>
                  <span className="text-right"><span className={cx("num block text-lg font-extrabold leading-none", (r.roundsSaved ?? 0) > 0 ? "text-pos" : "text-neg")}>{(r.roundsSaved ?? 0) > 0 ? "+" : ""}{r.roundsSaved}</span><span className="text-[9px] uppercase text-muted">rounds saved</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No keeper beats the value of the pick it costs right now.</p>}
        </div>
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Best keepers to target</div>
          <ul className="flex flex-col gap-2">
            {targets.map((m) => (
              <li key={m.playerId} className="flex items-center gap-3 rounded-xl border border-line bg-panel2/50 px-3 py-2">
                <PlayerImg id={m.playerId} name={m.name} pos={m.pos} size={34} />
                <div className="min-w-0 flex-1"><PlayerLink id={m.playerId} name={m.name} className="block truncate text-sm font-bold" /><div className="truncate text-[11px] text-muted">{m.pos}{m.posRank} · keep R{m.costRound}{m.late ? " · late keep" : ""} · {m.teamName}</div></div>
                <span className="text-right"><span className="num block text-lg font-extrabold leading-none text-pos">+{m.roundsSaved}</span><span className="text-[9px] uppercase text-muted">rounds</span></span>
              </li>
            ))}
            {!targets.length && <li className="text-sm text-muted">No clear keeper bargains on other teams.</li>}
          </ul>
        </div>
      </div>
      <Link href="/keepers/" className="mt-3 inline-block rounded-lg bg-acc px-4 py-2 text-sm font-bold text-on-acc">Open Keeper Planner</Link>
    </Card>
  );
}
