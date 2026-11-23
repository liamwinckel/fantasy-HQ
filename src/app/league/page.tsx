"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import { TeamLink } from "@/components/TeamPeek";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { powerRankings, POS_ORDER } from "@/lib/engine/power";
import { ord } from "@/lib/engine/classify";
import { Bar, Card, ClassBadge, Notice, PageHeader, Stat, Tag, cx, Info } from "@/components/ui";

export default function LeagueAnalyzer() {
  return <LeaguePage>{(d) => <LeagueAnalyzerBody {...d} />}</LeaguePage>;
}

function LeagueAnalyzerBody({ setup, league, ctx, sp }: LeagueData) {

  const power = powerRankings(ctx);
  const n = ctx.teamsCount;
  const mine = power.find((p) => p.rosterId === ctx.myRosterId);
  const team = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)!;
  const positions = [...POS_ORDER.filter((p) => power.some((t) => t.positions[p])), "Depth"];
  const rankOf = (p: (typeof power)[number], pos: string) => (pos === "Depth" ? { rank: p.depthRank, pts: p.depth } : p.positions[pos]);
  // Heat: rank 1 = strongest = full yellow
  const heat = (rank: number) => `rgba(255, 214, 10, ${(0.08 + 0.85 * ((n - rank) / Math.max(1, n - 1))).toFixed(2)})`;
  const showDyn = ctx.showClasses;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring} · ${n} teams`} title="League Analyzer" />

      {mine && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Your power rank" value={`#${mine.rank}`} sub={`Power score ${mine.score.toFixed(0)} / 100`} tag="MODEL" />
          <Stat label="Playoff odds" value={`${(ctx.sim.playoffOdds[mine.rosterId] ?? 0).toFixed(0)}%`} sub={`Avg finish: ${ord(Math.round(ctx.sim.avgSeed[mine.rosterId] ?? 0))}`} tag="MODEL" />
          <Stat label="Title odds" value={`${(ctx.sim.titleOdds[mine.rosterId] ?? 0).toFixed(0)}%`} sub="Simulated" tag="MODEL" />
          <Stat label="Strengths" value={<span className="text-xl">{mine.strengths.join(" · ") || "—"}</span>} sub="Top quarter of the league" />
          <Stat label="Weaknesses" value={<span className="text-xl">{mine.weaknesses.join(" · ") || "—"}</span>} sub="Bottom quarter of the league" />
        </div>
      )}

      <Card title="Power rankings" right={<span className="flex items-center gap-2 text-[11px] text-muted">Tap a team for its roster <Tag kind="MODEL" /></span>} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-2.5 font-semibold">#</th>
                <th className="px-2 py-2.5 font-semibold">Team</th>
                <th className="px-2 py-2.5 font-semibold" title="45% lineup strength + 35% rest-of-season strength + 20% points per game">Power score</th>
                <th className="px-2 py-2.5 font-semibold">Record</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Actual points scored per game">Pts / game</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Projected points of the best healthy lineup">Lineup strength</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Average projected best lineup over the remaining weeks">Rest of season</th>
                <th className="px-2 py-2.5 text-right font-semibold">Playoffs</th>
                <th className="px-2 py-2.5 text-right font-semibold">Title</th>
                {showDyn && <th className="px-2 py-2.5 font-semibold">Dynasty strategy</th>}
                <th className="px-5 py-2.5 font-semibold">Strong · weak</th>
              </tr>
            </thead>
            <tbody>
              {power.map((p) => {
                const t = team(p.rosterId);
                const c = ctx.classifications.get(p.rosterId);
                return (
                  <tr key={p.rosterId} className={cx("border-t border-line", p.rosterId === ctx.myRosterId && "bg-acc-soft")}>
                    <td className="num px-5 py-3 font-bold">{p.rank}</td>
                    <td className="px-2 py-3"><TeamLink rosterId={t.rosterId} name={t.name} avatar={t.avatar} size={32} className="font-semibold" /><div className="pl-10 text-[11px] text-muted">@{t.manager} · standings {ord(t.rank)}</div></td>
                    <td className="min-w-36 px-2 py-3"><div className="flex items-center gap-2"><Bar value={p.score} /><span className="num w-8 text-right font-bold">{p.score.toFixed(0)}</span></div></td>
                    <td className="num px-2 py-3">{t.wins}–{t.losses}{t.ties ? `–${t.ties}` : ""}</td>
                    <td className="num px-2 py-3 text-right">{p.pfPerGame.toFixed(1)}</td>
                    <td className="num px-2 py-3 text-right">{p.startNow.toFixed(1)}</td>
                    <td className="num px-2 py-3 text-right">{p.ros.toFixed(1)}</td>
                    <td className="num px-2 py-3 text-right">{(ctx.sim.playoffOdds[p.rosterId] ?? 0).toFixed(0)}%</td>
                    <td className="num px-2 py-3 text-right">{(ctx.sim.titleOdds[p.rosterId] ?? 0).toFixed(0)}%</td>
                    {showDyn && <td className="px-2 py-3"><ClassBadge cls={c ? c.override ?? c.primary : null} /><div className="text-[11px] text-muted">{c?.confidence}% · value #{p.dynastyRank}</div></td>}
                    <td className="px-5 py-3 text-xs"><span className="text-pos">{p.strengths.join(", ") || "—"}</span><span className="text-muted"> · </span><span className="text-neg">{p.weaknesses.join(", ") || "—"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Positional rankings" right={<span className="text-xs text-muted">1 = strongest · points = projected per week from starters</span>} pad={false}>
        <div className="overflow-x-auto p-4 sm:p-5">
          <div className="grid min-w-[640px] gap-1" style={{ gridTemplateColumns: `minmax(150px,1.6fr) repeat(${positions.length}, minmax(64px,1fr))` }}>
            <span />
            {positions.map((pos) => <span key={pos} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{pos}</span>)}
            {power.map((p) => (
              <div key={p.rosterId} className="contents">
                <span className={cx("py-2 pr-2 text-sm", p.rosterId === ctx.myRosterId ? "font-bold" : "font-medium")}><TeamLink rosterId={p.rosterId} name={team(p.rosterId).name} avatar={team(p.rosterId).avatar} size={22} /></span>
                {positions.map((pos) => {
                  const r = rankOf(p, pos);
                  if (!r) return <span key={pos} />;
                  return (
                    <span key={pos} title={`${r.pts.toFixed(1)} projected pts`} style={{ background: heat(r.rank) }} className={cx("rounded-md py-1.5 text-center", r.rank <= n / 2 ? "text-[#0a0a0a]" : "")}>
                      <span className="num block text-sm font-bold">{ord(r.rank)}</span>
                      <span className="num block text-[10px] opacity-75">{r.pts.toFixed(1)}</span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <Info className="border-t border-line px-5 py-2.5">Players in flex slots count toward their own position. Depth = projected points of the best three bench players (no K/DEF). Power score = 45% lineup strength + 35% rest-of-season strength + 20% actual points per game.</Info>
      </Card>
    </div>
  );
}
