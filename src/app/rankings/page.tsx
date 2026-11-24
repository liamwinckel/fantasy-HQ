"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { PlayerImg, Segmented } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { InjuryChip, NflLogo, PageHeader, cx } from "@/components/ui";
import { formatLabel } from "@/lib/services/portfolio";
import { rankings, type RankRow, type RankScope } from "@/lib/services/rankings";

export default function RankingsPage() {
  return <LeaguePage>{(d) => <RankingsBody {...d} />}</LeaguePage>;
}

const n0 = (x: number) => (x ? String(Math.round(x)) : "–");
const n1 = (x: number) => (x ? x.toFixed(1) : "–");

function statLine(r: RankRow, scope: RankScope) {
  if (scope === "dynasty") return [r.age ? `age ${Math.floor(r.age)}` : null, r.yearsExp !== null ? (r.yearsExp === 0 ? "rookie" : `${r.yearsExp} yrs exp`) : null].filter(Boolean).join(" · ");
  const parts: string[] = [];
  if (r.pos === "QB") parts.push(`${n0(r.passYd)} pass yds`, `${n1(r.passTd)} pass TD`);
  if (["QB", "RB", "WR", "TE"].includes(r.pos) && r.rushYd) parts.push(`${n0(r.rushYd)} rush yds`);
  if (["RB", "WR", "TE"].includes(r.pos)) parts.push(`${n1(r.rec)} rec`, `${n0(r.recYd)} rec yds`);
  if (["QB", "RB", "WR", "TE"].includes(r.pos) && r.td) parts.push(`${n1(r.td)} TD`);
  if (r.pos === "K") parts.push(`${n1(r.fg)} FG`);
  if (r.pos === "DEF" || ["DL", "LB", "DB"].includes(r.pos)) { if (r.sacks) parts.push(`${n1(r.sacks)} sacks`); if (r.tackles) parts.push(`${n1(r.tackles)} tackles`); }
  return parts.join(" · ");
}

function Shs({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[10px] text-muted">—</span>;
  return <span className={cx("num rounded px-1.5 py-0.5 text-[11px] font-bold", v >= 10 ? "bg-pos/15 text-pos" : v <= -10 ? "bg-neg/15 text-neg" : "bg-panel2 text-muted")}>{v > 0 ? "+" : ""}{v}%</span>;
}

function RankingsBody({ league, ctx, sp }: LeagueData) {
  const { set } = useQuery();
  const scope: RankScope = sp.scope === "ros" ? "ros" : sp.scope === "dynasty" ? "dynasty" : "week";
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const all = useMemo(() => rankings(ctx, scope), [ctx, scope]);
  const [pos, setPos] = useState("ALL");
  const [own, setOwn] = useState<"all" | "fa" | "mine">("all");
  const [by, setBy] = useState<"experts" | "shs">("experts");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(75);
  const positions = ["ALL", ...["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"].filter((p) => all.some((r) => r.pos === p))];
  const rows = all
    .filter((r) => (pos === "ALL" || r.pos === pos) && (own === "all" || (own === "fa" ? r.owner === "Free agent" : r.mine)) && (!q || r.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (by === "shs" ? b.pts - a.pts : a.rank - b.rank));
  const dates = ctx.consensusDates;
  const dyn = scope === "dynasty";
  const numLabel = dyn ? "Value" : "Pts";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Rankings"
        info={<>
          Ranked by <b>expert consensus (ECR)</b>: FantasyPros&apos; average of dozens of analysts, via DynastyProcess{dates ? ` (updated ${scope === "week" ? dates.weekly : dates.ecr})` : ""}.
          {" "}<b>SHS score</b> = how much the SHS numbers agree: {dyn
            ? "the SHS model's dynasty value compared with the value of the player at his expert rank"
            : "his Sleeper projection (in your scoring) compared with the projection of the player at his expert rank"}. <b className="text-pos">+20%</b> = we like him more than the experts, <b className="text-neg">−20%</b> = less.
          {" "}{dyn ? <><b>Value</b> = dynasty trade value in this league (model + market, 0–100{ctx.superflex ? ", superflex" : ""}).</> : <><b>Pts</b> = Sleeper&apos;s projection {scope === "week" ? `for Week ${w0}` : `from Week ${w0} through your final (Week ${ctx.lastWeek})`}.</>}
          {" "}Players the experts don&apos;t rank are listed after, by the SHS number.
        </>}>
        <Segmented label="Span" value={scope} onChange={(v) => { set({ scope: v === "week" ? undefined : v }, true); setLimit(75); }}
          options={[{ value: "week", label: `Week ${w0}` }, { value: "ros", label: "Rest of season" }, { value: "dynasty", label: "Dynasty" }]} />
      </PageHeader>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" className="w-full rounded-lg border border-line bg-panel2 py-2 pl-8 pr-2 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {positions.map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", pos === p ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}>{p === "ALL" ? "All" : p}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {([["experts", "Experts"], ["shs", dyn ? "SHS model" : "Projection"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setBy(k)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", by === k ? "bg-fg text-bg" : "bg-panel2 text-muted")}>{l}</button>)}
          <span className="mx-1 h-4 w-px bg-line" />
          {([["all", "Everyone"], ["fa", "Free agents"], ["mine", "My team"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setOwn(k)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", own === k ? "bg-fg text-bg" : "bg-panel2 text-muted")}>{l}</button>)}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_3.5rem] items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4rem_4.5rem] sm:px-4">
          <span>{by === "experts" ? "ECR" : "SHS"}</span><span>Player</span><span className="hidden sm:block">{dyn ? "Profile" : "Projected stats"}</span><span className="text-center">SHS</span><span className="text-right">{numLabel}</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.slice(0, limit).map((r, i) => (
            <li key={r.id} className={cx("grid grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_3.5rem] items-center gap-2 px-3 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4rem_4.5rem] sm:px-4", r.mine && "bg-acc-soft")}>
              <div className="text-center">
                <div className="num text-sm font-bold">{pos === "ALL" ? i + 1 : by === "experts" ? (r.ecrPos ?? "–") : r.shsPos}</div>
                <div className="text-[9px] font-semibold text-muted">{r.pos}{by === "experts" ? r.ecrPos ?? "" : r.shsPos}</div>
              </div>
              <div className="flex min-w-0 items-center gap-2.5">
                <PlayerImg id={r.id} name={r.name} pos={r.pos} size={34} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><PlayerLink id={r.id} name={r.name} /><InjuryChip status={r.injury} /></div>
                  <div className="flex items-center gap-1 truncate text-[11px] text-muted"><NflLogo team={r.team} size={12} />{r.pos} · {r.team ?? "FA"}{r.opp ? ` vs ${r.opp}` : ""}<span className={cx("ml-1 truncate", r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "")}>· {r.owner}</span></div>
                  <div className="truncate text-[11px] text-muted sm:hidden">{statLine(r, scope)}</div>
                </div>
              </div>
              <div className="hidden truncate text-xs text-muted sm:block">{statLine(r, scope)}</div>
              <div className="text-center"><Shs v={r.shsScore} /></div>
              <div className="text-right">
                <div className="num font-[family-name:var(--font-display)] text-xl font-bold leading-none">{(dyn ? r.value : r.pts).toFixed(dyn ? 0 : 1)}</div>
                {scope === "ros" && r.games > 0 && <div className="text-[10px] text-muted">{(r.pts / r.games).toFixed(1)}/g</div>}
              </div>
            </li>
          ))}
        </ul>
        {rows.length > limit && <button type="button" onClick={() => setLimit(limit + 75)} className="w-full border-t border-line py-3 text-sm font-semibold text-acc-ink">Show more ({rows.length - limit} left)</button>}
        {rows.length === 0 && <p className="p-5 text-sm text-muted">No players match.</p>}
      </section>
    </div>
  );
}
