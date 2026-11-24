"use client";

/** SHS AI backtest summary card (tap for every week, positions and factor diagnostics). */
import { useState } from "react";
import { useApp, useAsync } from "./AppData";
import { Sheet } from "./Sheet";
import { Card, cx } from "./ui";
import { LineChart } from "./charts";
import { PlayerLink } from "./PlayerCard";
import { runBacktest, type BacktestReport, type Grade } from "@/lib/services/backtest";
import type { LeagueContext } from "@/lib/services/league";

export function useBacktest(ctx: LeagueContext) {
  const [prog, setProg] = useState<[number, number] | null>(null);
  const q = useAsync(() => runBacktest(ctx, (d, t) => setProg([d, t])), [ctx]);
  return { ...q, prog };
}

const LABEL: Record<string, string> = { ppg: "Points per game", snap: "Snap share", adv: "Opportunity & efficiency", xfp: "Expected points", track: "Player tracking", chart: "Film charting", proj: "Projection", weather: "Weather", inj: "Injuries & practice", matchup: "Defensive matchup", vegas: "Team implied total", script: "Game script" };

function Trio({ s, e, p, fmt, better }: { s: number; e: number; p: number; fmt: (v: number) => string; better: "high" | "low" }) {
  const best = better === "high" ? Math.max(s, e, p) : Math.min(s, e, p);
  const cell = (l: string, v: number) => (
    <div className={cx("rounded-lg px-2 py-2 text-center", v === best ? "bg-pos/15" : "bg-panel2")}>
      <div className={cx("num text-lg font-bold leading-none", v === best && "text-pos")}>{fmt(v)}</div><div className="mt-0.5 text-[10px] text-muted">{l}</div>
    </div>
  );
  return <div className="grid grid-cols-3 gap-2">{cell("SHS AI", s)}{cell("Experts", e)}{cell("Sleeper proj", p)}</div>;
}

export function BacktestCard({ ctx }: { ctx: LeagueContext }) {
  const { data, loading, error, prog } = useBacktest(ctx);
  const [open, setOpen] = useState(false);
  if (error) return null;
  return (
    <>
      <Card title="SHS AI backtest" onOpen={data ? () => setOpen(true) : undefined}
        info={<>Every finished week of this season replayed with only what was known before kickoff, then graded on what happened. <b>Picks right</b> = for every pair of players at a position, how often the ranking put the higher scorer first. <b>Avg miss</b> = average points off per player. Betting lines and weather can&apos;t be replayed, so they&apos;re graded only by the live record.</>}>
        {loading || !data ? (
          <p className="text-sm text-muted">{loading ? `Replaying past weeks${prog ? ` · ${prog[0]}/${prog[1]}` : ""}…` : "Backtest needs last weeks' expert rankings; it'll appear after the next data refresh."}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div><div className="mb-1 text-[11px] font-semibold text-muted">Picks right · {data.weeks.length} weeks</div><Trio s={data.total.shs.pairAcc} e={data.total.ecr.pairAcc} p={data.total.sleeper.pairAcc} fmt={(v) => `${v.toFixed(1)}%`} better="high" /></div>
            <div><div className="mb-1 text-[11px] font-semibold text-muted">Avg miss (points)</div><Trio s={data.total.shs.mae} e={data.total.ecr.mae} p={data.total.sleeper.mae} fmt={(v) => v.toFixed(2)} better="low" /></div>
            <p className="text-[11px] text-muted">{verdict(data.total.shs, data.total.ecr)} Tap for week by week.</p>
          </div>
        )}
      </Card>
      <Sheet open={open} onClose={() => setOpen(false)} full title="SHS AI backtest" sub={`${ctx.league.name} · weeks ${data?.weeks.map((w) => w.week).join(", ")}`}>
        {data && <BacktestDetail r={data} />}
      </Sheet>
    </>
  );
}

export function verdict(s: Grade, e: Grade) {
  const d = Math.round((s.pairAcc - e.pairAcc) * 10) / 10;
  if (Math.abs(d) < 0.3) return "SHS AI and the experts are level so far.";
  return d > 0 ? `SHS AI is ahead of the experts by ${d} points.` : `The experts are ahead of SHS AI by ${Math.abs(d)} points.`;
}

export function BacktestDetail({ r }: { r: BacktestReport }) {
  const { ctx } = useApp();
  const labels = r.weeks.map((w) => String(w.week));
  return (
    <div className="flex flex-col gap-6 pb-4">
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Picks right by week</h3>
        <LineChart labels={labels} yMin={40} yMax={80} fmt={(v) => `${Math.round(v)}%`} series={[
          { name: "SHS AI", color: "var(--acc)", values: r.weeks.map((w) => w.shs.pairAcc) },
          { name: "Experts", color: "#38bdf8", values: r.weeks.map((w) => w.ecr.pairAcc) },
          { name: "Sleeper proj", color: "var(--muted)", values: r.weeks.map((w) => w.sleeper.pairAcc), dash: true },
        ]} />
      </section>
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Average miss by week (points)</h3>
        <LineChart labels={labels} fmt={(v) => v.toFixed(1)} series={[
          { name: "SHS AI", color: "var(--acc)", values: r.weeks.map((w) => w.shs.mae) },
          { name: "Experts", color: "#38bdf8", values: r.weeks.map((w) => w.ecr.mae) },
          { name: "Sleeper proj", color: "var(--muted)", values: r.weeks.map((w) => w.sleeper.mae), dash: true },
        ]} />
      </section>
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Week by week</h3>
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-[2.5rem_repeat(3,minmax(0,1fr))] gap-2 border-b border-line bg-panel2/60 px-3 py-1.5 text-[10px] font-semibold uppercase text-muted"><span>Wk</span><span className="text-right">SHS AI</span><span className="text-right">Experts</span><span className="text-right">Sleeper</span></div>
          {[...r.weeks].reverse().map((w) => {
            const best = Math.max(w.shs.pairAcc, w.ecr.pairAcc, w.sleeper.pairAcc);
            const c = (g: Grade) => <span className={cx("num text-right", g.pairAcc === best && "font-bold text-pos")}>{g.pairAcc.toFixed(1)}%<span className="block text-[10px] font-normal text-muted">±{g.mae.toFixed(1)} pts</span></span>;
            return <div key={w.week} className="grid grid-cols-[2.5rem_repeat(3,minmax(0,1fr))] items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-0"><span className="text-xs text-muted">{w.week}</span>{c(w.shs)}{c(w.ecr)}{c(w.sleeper)}</div>;
          })}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">By position (season)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["QB", "RB", "WR", "TE"].map((pos) => {
            const avg = (k: "shs" | "ecr" | "sleeper") => r.weeks.reduce((a, w) => a + (w.byPos[pos]?.[k] ?? 0), 0) / Math.max(1, r.weeks.length);
            const s = avg("shs"), e = avg("ecr");
            return <div key={pos} className="rounded-xl bg-panel2/70 p-3 text-xs"><b className="text-sm">{pos}</b><div className="mt-1 flex justify-between"><span className="text-muted">SHS AI</span><b className={s >= e ? "text-pos" : ""}>{s.toFixed(1)}%</b></div><div className="flex justify-between"><span className="text-muted">Experts</span><b className={e > s ? "text-pos" : ""}>{e.toFixed(1)}%</b></div><div className="flex justify-between"><span className="text-muted">Sleeper</span><span>{avg("sleeper").toFixed(1)}%</span></div></div>;
          })}
        </div>
      </section>
      {r.weeks.at(-1)?.biggestCalls.length ? (
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Biggest calls vs the experts · week {r.weeks.at(-1)!.week}</h3>
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {r.weeks.at(-1)!.biggestCalls.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate"><PlayerLink id={c.id} name={ctx?.players.get(c.id)?.name ?? c.id} /></span>
                <span className="text-xs text-muted">SHS {c.pct > 0 ? "+" : ""}{c.pct}% · expert #{c.ecrPos} → finished #{c.actualPosRank}</span>
                <span className={cx("text-xs font-bold", c.right ? "text-pos" : "text-neg")}>{c.right ? "Right" : "Wrong"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Betting lines</h3>
        {r.markets ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {([["Betting lines", r.markets.markets], ["Experts", r.markets.experts], ["SHS AI", r.markets.shs]] as const).map(([l, v]) => (
                <div key={l} className={cx("rounded-lg p-2", v === Math.max(r.markets!.markets, r.markets!.experts, r.markets!.shs) ? "bg-pos/15" : "bg-panel2")}><div className="num text-lg font-bold">{v.toFixed(1)}%</div><div className="text-muted">{l}</div></div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">Picks right on the {r.markets.n.toLocaleString()} player-weeks with saved lines ({r.markets.weeks} week{r.markets.weeks === 1 ? "" : "s"}). Lines above a player&apos;s expert rank → beat it: correlation {r.markets.corr > 0 ? "+" : ""}{r.markets.corr.toFixed(3)}.</p>
          </>
        ) : <p className="text-xs text-muted">Lines are now saved before every game; they&apos;ll be graded here once those weeks finish.</p>}
      </section>
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">What each factor told us</h3>
        <p className="mb-2 text-[11px] text-muted">Correlation between the factor and a player beating (+) or missing (−) his expert rank. Weight = the multiplier auto-tune now uses (0.5×–1.5×, halfway between default and best fit).</p>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {r.factors.map((f) => (
            <li key={f.key} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] items-center gap-2 px-3 py-2">
              <span className="truncate">{LABEL[f.key] ?? f.key}<span className="ml-1 text-[10px] text-muted">{f.n.toLocaleString()} players</span></span>
              <span className={cx("num text-right text-xs font-semibold", f.corr > 0.02 ? "text-pos" : f.corr < -0.02 ? "text-neg" : "text-muted")}>{f.corr > 0 ? "+" : ""}{f.corr.toFixed(3)}</span>
              <span className="num text-right text-xs">{f.mult.toFixed(2)}×</span>
            </li>
          ))}
        </ul>
        {r.tuned && <p className="mt-2 text-[11px] text-muted">With the best-fitting weights SHS AI would have picked right {r.tuned.shs.pairAcc.toFixed(1)}% (in-sample, so treat as an upper bound). Best expert share found: {r.tuned.expert}%.</p>}
      </section>
    </div>
  );
}
