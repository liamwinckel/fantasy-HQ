"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { rookieReport } from "@/lib/services/rookies";
import { Card, Notice, PageHeader, Tag, cx, Info } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";

export default function RookiePage() {
  return <LeaguePage>{(d) => <RookiePageBody {...d} />}</LeaguePage>;
}

function RookiePageBody({ setup, league, ctx, sp }: LeagueData) {
  const pos = ["QB", "RB", "WR", "TE"].includes(sp.pos ?? "") ? sp.pos! : "ALL";
  const all = rookieReport(ctx);
  const rows = all.filter((r) => pos === "ALL" || r.pos === pos);
  const season = Number(ctx.league.season);
  const chip = (on: boolean) => cx("rounded-full border px-3 py-1.5 text-xs font-semibold", on ? "border-acc bg-acc text-on-acc" : "border-line text-muted hover:text-fg");
  const gradeStyle: Record<string, string> = { A: "bg-acc text-on-acc", B: "border border-acc-ink text-acc-ink", C: "border border-line text-fg", D: "bg-panel2 text-muted" };
  const best = (p: string) => all.find((r) => r.pos === p);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)}`} title="Rookie Report" />
      <Info className="-mt-2 self-center" label="About this tool">The {season} rookie class, scouted with real NFL data: draft capital, role (snap share), production in your league&apos;s scoring and dynasty value. Grades rank each rookie within this class.</Info>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["QB", "RB", "WR", "TE"].map((p) => {
          const r = best(p);
          return (
            <div key={p} className="rounded-xl border border-line bg-panel p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Top rookie {p}</div>
              {r ? <><PlayerLink id={r.id} name={r.name} className="mt-1 block text-lg font-bold" /><div className="text-xs text-muted">{r.team} · {r.draft} · {r.ppg.toFixed(1)} pts/g</div></> : <div className="mt-1 text-sm text-muted">None yet</div>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {["ALL", "QB", "RB", "WR", "TE"].map((p) => <Link key={p} href={`/rookies/?pos=${p}`} className={chip(pos === p)}>{p === "ALL" ? "All rookies" : p}</Link>)}
      </div>

      <Card title={`${season} class`} right={<Tag kind="MODEL" />} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-5 py-2.5 font-semibold">#</th><th className="px-2 py-2.5 font-semibold">Rookie</th><th className="px-2 py-2.5 font-semibold">Grade</th>
              <th className="px-2 py-2.5 font-semibold">Drafted</th><th className="px-2 py-2.5 text-right font-semibold" title="Snap share, last 3 games">Snaps L3</th>
              <th className="px-2 py-2.5 text-right font-semibold">Pts/g</th><th className="px-2 py-2.5 text-right font-semibold">Last 4</th>
              <th className="px-2 py-2.5 text-right font-semibold" title="Projected points per game next season (development curve)">Next yr</th>
              <th className="px-2 py-2.5 text-right font-semibold">Dynasty value</th><th className="px-5 py-2.5 font-semibold">Owner · notes</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cx("border-t border-line", r.mine && "bg-acc-soft")}>
                  <td className="num px-5 py-2.5 font-bold text-muted">{r.rankInClass}</td>
                  <td className="px-2 py-2.5"><div className="flex items-center gap-2"><PlayerImg id={r.id} name={r.name} pos={r.pos} size={30} /><div><PlayerLink id={r.id} name={r.name} className="font-semibold" /><div className="text-xs text-muted">{r.pos}{r.posRankInClass ? ` · ${r.pos}${r.posRankInClass} in class` : ""} · {r.team}{r.age ? ` · ${Math.floor(r.age)}` : ""}</div></div></div></td>
                  <td className="px-2 py-2.5"><span className={cx("inline-block w-7 rounded py-0.5 text-center text-xs font-extrabold", gradeStyle[r.grade])}>{r.grade}</span></td>
                  <td className="px-2 py-2.5 text-xs">{r.draft}</td>
                  <td className="num px-2 py-2.5 text-right">{r.snapL3 !== null ? `${Math.round(r.snapL3 * 100)}%` : "—"}</td>
                  <td className="num px-2 py-2.5 text-right">{r.games ? r.ppg.toFixed(1) : "—"}</td>
                  <td className="num px-2 py-2.5 text-right">{r.games ? r.last4.toFixed(1) : "—"}</td>
                  <td className="num px-2 py-2.5 text-right">{r.nextYearPpg.toFixed(1)}</td>
                  <td className="num px-2 py-2.5 text-right font-bold text-acc-ink">{r.dynasty.toFixed(1)}</td>
                  <td className="px-5 py-2.5 text-xs"><span className={r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "text-muted"}>{r.owner}</span><div className="text-muted">{r.notes.join(" ")}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Info className="border-t border-line px-5 py-2.5">Grade = rank within the class on 40% dynasty value, 25% snap share, 20% draft capital, 15% points per game. A = top 20%. &quot;Next yr&quot; applies a typical second-year jump (WR/TE +12%, others +5%) to current healthy production.</Info>
      </Card>

      <Card title={`${season + 1} prospects`}>
        <p className="text-sm leading-relaxed text-muted">
          College prospect scouting for the {season + 1} class isn&apos;t included yet. No free, key-less data source covers prospects before the NFL Combine and Draft.
          NFLverse publishes combine results and draft picks in the spring; Fantasy HQ will pick those up automatically. A free College Football Data API key could add college production sooner.
          That would mean adding an (optional, free) key, which I&apos;ll only do if you want it.
        </p>
      </Card>
    </div>
  );
}
