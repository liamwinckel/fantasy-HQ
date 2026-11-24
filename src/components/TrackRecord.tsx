"use client";

/** Honest track record: how SHS AI has actually done against the experts, past seasons and this one. */
import { useAsync } from "./AppData";
import { Card, cx } from "./ui";
import { accuracy } from "@/lib/services/accuracy";
import RESEARCH from "@/lib/services/shsResearch.json";
import LONG from "@/lib/services/shsResearchLong.json";
import type { LeagueContext } from "@/lib/services/league";

const R = RESEARCH as unknown as { summary: { experts: number; shs: number }; weeks: number; calls?: { flipped: number; right: number | null } };
const LG = LONG as unknown as Record<"ros" | "dynasty", { model: Record<string, { gain: number }> }>;
const avgGain = (m: Record<string, { gain: number }>) => { const v = Object.values(m).map((x) => x.gain); return Math.round((v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)) * 10) / 10; };

function Line({ label, shs, exp, sub }: { label: string; shs: number; exp: number; sub: string }) {
  const d = Math.round((shs - exp) * 10) / 10;
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0"><div className="text-sm font-semibold">{label}</div><div className="text-[11px] text-muted">{sub}</div></div>
      <div className="text-right"><div className="num text-sm"><b>{shs.toFixed(1)}%</b> <span className="text-muted">vs {exp.toFixed(1)}%</span></div><div className={cx("num text-[11px] font-bold", d > 0 ? "text-pos" : d < 0 ? "text-neg" : "text-muted")}>{d > 0 ? `+${d} vs experts` : d < 0 ? `${d} vs experts` : "Tied with experts"}</div></div>
    </li>
  );
}

export function TrackRecord({ ctx }: { ctx: LeagueContext }) {
  const live = useAsync(() => accuracy(ctx), [ctx]);
  const ros = avgGain(LG.ros.model), dyn = avgGain(LG.dynasty.model);
  return (
    <Card title="SHS AI track record" href="/shs/" info={<><b>Picks right</b> = for every pair of players at the same position, how often the one ranked higher actually scored more. Past seasons were replayed with only what was known at the time, and SHS AI was graded on seasons it wasn&apos;t fitted to. Nothing is hidden: where it only ties the experts, it says so.</>}>
      <ul className="divide-y divide-line">
        <Line label="Weekly, 2021–now" shs={R.summary.shs} exp={R.summary.experts} sub={`${R.weeks} replayed weeks${R.calls?.right ? ` · right ${R.calls.right}% when it disagreed` : ""}`} />
        {live.data && <Line label="This season, your league" shs={live.data.shs} exp={live.data.experts} sub={`${live.data.weeks.length} graded week${live.data.weeks.length === 1 ? "" : "s"} saved on this device`} />}
      </ul>
      <p className="mt-1 text-[11px] text-muted">Rest of season: {ros > 0 ? `+${ros}` : ros} pts of picks right vs experts on average · Dynasty: {dyn > 0 ? `+${dyn}` : dyn}. Tap for the full research.</p>
    </Card>
  );
}
