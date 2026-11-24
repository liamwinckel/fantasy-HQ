"use client";

/** Matchup simulator: your lineup vs theirs, played out 10,000 times. */
import { useEffect, useMemo, useState } from "react";
import type { LeagueContext } from "@/lib/services/league";
import type { TeamWeek } from "@/lib/services/views";
import { bestWinLineup, playerDist, simulateMatchup, type SimPlayer } from "@/lib/engine/ranges";
import { Card, WinBar, cx, signed } from "./ui";

export function MatchupSim({ ctx, week, slots, lineup, eligible, locked, actual, opponent, myName, onApply }: {
  ctx: LeagueContext; week: number; slots: string[]; lineup: (string | null)[];
  eligible: (id: string, slot: number) => boolean; locked: (id: string) => boolean; actual: (id: string) => number | null;
  opponent: TeamWeek; myName: string; onApply: (l: (string | null)[]) => void;
}) {
  const oppLocked = new Set(ctx.lineups.get(opponent.rosterId)?.locked ?? []);
  const toSim = useMemo(() => (id: string, isLocked: boolean, act: number | null): SimPlayer => {
    const d = playerDist(ctx, id, week);
    return { id, team: ctx.players.get(id)?.team ?? null, mean: d.mean, sd: d.sd, fixed: isLocked ? act ?? 0 : null };
  }, [ctx, week]);
  const mine = (l: (string | null)[]) => l.filter(Boolean).map((id) => toSim(id!, locked(id!), actual(id!)));
  const opp = useMemo(() => opponent.starters.filter((s) => s.playerId).map((s) => toSim(s.playerId!, oppLocked.has(s.playerId!), s.actual)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opponent, toSim]);
  const key = lineup.join(",");
  const [res, setRes] = useState<ReturnType<typeof simulateMatchup> | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setRes(simulateMatchup(mine(lineup), opp, 10000)), 30); // after paint: keeps swaps smooth
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opp]);
  const [best, setBest] = useState<ReturnType<typeof bestWinLineup> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setBest(null), [key]);
  const name = (id: string | null) => (id ? ctx.players.get(id)?.name ?? id : "empty");

  const find = () => {
    setBusy(true);
    setTimeout(() => {
      const all = [...new Set([...lineup.filter(Boolean) as string[], ...benchIds()])];
      setBest(bestWinLineup(lineup, all, eligible, locked, (id) => toSim(id, locked(id), actual(id)), opp));
      setBusy(false);
    }, 20);
  };
  const benchIds = () => [...ctx.teams.find((t) => t.rosterId === ctx.myRosterId)?.players ?? []].filter((id) => !lineup.includes(id));

  return (
    <Card title="Matchup simulator" info={<>Both lineups played out 10,000 times. Each player&apos;s score is drawn from his floor-to-ceiling range (his own week-to-week swings, plus the betting markets&apos; view when he has lines); teammates rise and fall together. <b>Best lineup to win</b> tries every bench swap and keeps the ones that raise your win chance, which can differ from the highest projected total.</>}>
      {!res ? <p className="text-sm text-muted">Simulating…</p> : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <div><div className="text-[11px] text-muted">Win chance</div><div className={cx("num font-[family-name:var(--font-display)] text-5xl font-bold leading-none", res.winProb >= 50 ? "text-pos" : "text-neg")}>{res.winProb.toFixed(0)}%</div></div>
            <div className="text-right text-xs text-muted">Typical result<div className="num text-base font-bold text-fg">{signed(res.margin.p50)} pts</div></div>
          </div>
          <WinBar pct={res.winProb} />
          <div className="grid grid-cols-2 gap-2 text-xs">
            {([[myName, res.mine], [opponent.name, res.opp]] as const).map(([n, s]) => (
              <div key={n} className="rounded-xl bg-panel2/70 p-3">
                <div className="truncate font-semibold">{n}</div>
                <div className="num mt-1 text-lg font-bold">{s.p50.toFixed(1)}</div>
                <div className="text-muted">bad week {s.p10.toFixed(0)} · great week {s.p90.toFixed(0)}</div>
              </div>
            ))}
          </div>
          <Histogram h={res.hist} myName={myName} oppName={opponent.name} />
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-panel2/70 p-2"><div className="num text-sm font-bold">{pct(res.myScores, res.oppScores, (a, b) => a - b > 20)}%</div><div className="text-muted">win by 20+</div></div>
            <div className="rounded-lg bg-panel2/70 p-2"><div className="num text-sm font-bold">{pct(res.myScores, res.oppScores, (a, b) => Math.abs(a - b) <= 5)}%</div><div className="text-muted">within 5</div></div>
            <div className="rounded-lg bg-panel2/70 p-2"><div className="num text-sm font-bold">{pct(res.myScores, res.oppScores, (a, b) => b - a > 20)}%</div><div className="text-muted">lose by 20+</div></div>
          </div>
          <div className="rounded-xl border border-line p-3">
            {!best ? (
              <button type="button" onClick={find} disabled={busy} className="w-full rounded-lg bg-acc py-2.5 text-sm font-bold text-on-acc disabled:opacity-60">{busy ? "Testing every swap…" : "Find the lineup most likely to win"}</button>
            ) : best.moves.length === 0 ? (
              <p className="text-sm">Your lineup already gives you the best chance to win ({best.base.toFixed(0)}%).</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-baseline justify-between"><b>Best lineup to win</b><span className="num font-bold text-pos">{best.base.toFixed(0)}% → {best.winProb.toFixed(0)}%</span></div>
                <ul className="flex flex-col gap-1">{best.moves.map((m) => <li key={m.in} className="flex justify-between gap-2 text-xs"><span><b>Start {name(m.in)}</b> at {slots[m.slot]}{m.out ? `, bench ${name(m.out)}` : ""}</span><span className="num shrink-0 text-pos">+{m.gain}%</span></li>)}</ul>
                <button type="button" onClick={() => onApply(best.lineup)} className="mt-1 rounded-lg bg-acc py-2 text-sm font-bold text-on-acc">Use this lineup here</button>
                <p className="text-[11px] text-muted">Only changes this screen. Set it in Sleeper yourself.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function pct(a: Float64Array, b: Float64Array, f: (x: number, y: number) => boolean) {
  let c = 0; for (let i = 0; i < a.length; i++) if (f(a[i], b[i])) c++;
  return Math.round((c / a.length) * 100);
}

function Histogram({ h, myName, oppName }: { h: { lo: number; step: number; mine: number[]; opp: number[] }; myName: string; oppName: string }) {
  const W = 600, H = 120, pad = 18;
  const max = Math.max(...h.mine, ...h.opp, 0.001);
  const n = h.mine.length;
  const x = (i: number) => (i / Math.max(1, n - 1)) * (W - 10) + 5;
  const y = (v: number) => H - pad - (v / max) * (H - pad - 6);
  const path = (arr: number[]) => `M${x(0)},${H - pad} ${arr.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(n - 1)},${H - pad} Z`;
  const ticks = [0, Math.floor(n / 2), n - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score distributions">
        <path d={path(h.opp)} fill="#f87171" opacity="0.28" stroke="#f87171" strokeWidth="1.5" />
        <path d={path(h.mine)} fill="var(--acc)" opacity="0.32" stroke="var(--acc)" strokeWidth="1.5" />
        {ticks.map((i) => <text key={i} x={x(i)} y={H - 4} fontSize="11" textAnchor="middle" fill="var(--muted)">{Math.round(h.lo + i * h.step)}</text>)}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-muted"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-acc" />{myName}</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#f87171]" />{oppName}</span><span>· how often each total happens</span></div>
    </div>
  );
}
