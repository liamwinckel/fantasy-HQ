"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { PlayerImg, Segmented } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { InjuryChip, NflLogo, PageHeader, Tag, cx } from "@/components/ui";
import { formatLabel } from "@/lib/services/portfolio";
import { rankings, type RankRow } from "@/lib/services/rankings";

export default function RankingsPage() {
  return <LeaguePage>{(d) => <RankingsBody {...d} />}</LeaguePage>;
}

const n0 = (x: number) => (x ? String(Math.round(x)) : "–");
const n1 = (x: number) => (x ? x.toFixed(1) : "–");

/** One compact stat line per position, so phones never need to scroll sideways. */
function statLine(r: RankRow) {
  const parts: string[] = [];
  if (r.pos === "QB") parts.push(`${n0(r.passYd)} pass yds`, `${n1(r.passTd)} pass TD`);
  if (["QB", "RB", "WR", "TE"].includes(r.pos) && r.rushYd) parts.push(`${n0(r.rushYd)} rush yds`);
  if (["RB", "WR", "TE"].includes(r.pos)) parts.push(`${n1(r.rec)} rec`, `${n0(r.recYd)} rec yds`);
  if (["QB", "RB", "WR", "TE"].includes(r.pos) && r.td) parts.push(`${n1(r.td)} TD`);
  if (r.pos === "K") parts.push(`${n1(r.fg)} FG`);
  if (r.pos === "DEF" || ["DL", "LB", "DB"].includes(r.pos)) { if (r.sacks) parts.push(`${n1(r.sacks)} sacks`); if (r.tackles) parts.push(`${n1(r.tackles)} tackles`); }
  return parts.join(" · ");
}

function RankingsBody({ league, ctx, sp }: LeagueData) {
  const { set } = useQuery();
  const scope = sp.scope === "ros" ? "ros" : "week";
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const all = useMemo(() => rankings(ctx, scope), [ctx, scope]);
  const [pos, setPos] = useState("ALL");
  const [own, setOwn] = useState<"all" | "fa" | "mine">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(75);
  const positions = ["ALL", ...["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"].filter((p) => all.some((r) => r.pos === p))];
  const rows = all.filter((r) => (pos === "ALL" || r.pos === pos) && (own === "all" || (own === "fa" ? r.owner === "Free agent" : r.mine)) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const isQB = pos === "QB";
  const skill = ["RB", "WR", "TE"].includes(pos);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Rankings"
        info={<>Sleeper&apos;s projections, scored with your league&apos;s settings. <b>This week</b> = Week {w0}. <b>Rest of season</b> = Week {w0} through your fantasy final (Week {ctx.lastWeek}), byes and injuries included. Stats are projected totals for the same span. TD = rushing + receiving touchdowns.</>}>
        <Segmented label="Span" size="lg" value={scope} onChange={(v) => set({ scope: v === "week" ? undefined : v }, true)}
          options={[{ value: "week", label: `Week ${w0}` }, { value: "ros", label: "Rest of season" }]} />
      </PageHeader>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" className="w-full rounded-lg border border-line bg-panel2 py-2 pl-8 pr-2 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {positions.map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", pos === p ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}>{p === "ALL" ? "All" : p}</button>)}
          <span className="mx-1 h-4 w-px bg-line" />
          {([["all", "Everyone"], ["fa", "Free agents"], ["mine", "My team"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setOwn(k)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", own === k ? "bg-fg text-bg" : "bg-panel2 text-muted")}>{l}</button>)}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className={cx("grid items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-4",
          "grid-cols-[2rem_minmax(0,1fr)_3.5rem]", isQB ? "md:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_4rem_3.5rem_4.5rem_3.5rem_4.5rem]" : skill ? "md:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_4.5rem_3.5rem_4.5rem_3.5rem_4.5rem]" : "md:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_4.5rem]")}>
          <span>#</span><span>Player</span>
          {isQB && <><span className="hidden text-right md:block">Pass yds</span><span className="hidden text-right md:block">Pass TD</span><span className="hidden text-right md:block">INT</span><span className="hidden text-right md:block">Rush yds</span><span className="hidden text-right md:block">Rush TD</span></>}
          {skill && <><span className="hidden text-right md:block">Rush yds</span><span className="hidden text-right md:block">Rec</span><span className="hidden text-right md:block">Rec yds</span><span className="hidden text-right md:block">TD</span><span className="hidden text-right md:block">Owner</span></>}
          {!isQB && !skill && <span className="hidden text-right md:block">Owner</span>}
          <span className="flex items-center justify-end gap-1">Pts <Tag kind="SLEEPER" /></span>
        </div>
        <ul className="divide-y divide-line">
          {rows.slice(0, limit).map((r) => (
            <li key={r.id} className={cx("grid items-center gap-2 px-3 py-2 sm:px-4", "grid-cols-[2rem_minmax(0,1fr)_3.5rem]",
              isQB ? "md:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_4rem_3.5rem_4.5rem_3.5rem_4.5rem]" : skill ? "md:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_4.5rem_3.5rem_4.5rem_3.5rem_4.5rem]" : "md:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_4.5rem]", r.mine && "bg-acc-soft")}>
              <div className="text-center"><div className="num text-sm font-bold">{pos === "ALL" ? r.rank : r.posRank}</div>{pos === "ALL" && <div className="text-[9px] font-semibold text-muted">{r.pos}{r.posRank}</div>}</div>
              <div className="flex min-w-0 items-center gap-2.5">
                <PlayerImg id={r.id} name={r.name} pos={r.pos} size={34} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><PlayerLink id={r.id} name={r.name} /><InjuryChip status={r.injury} /></div>
                  <div className="flex items-center gap-1 truncate text-[11px] text-muted"><NflLogo team={r.team} size={12} />{r.pos} · {r.team ?? "FA"}{r.opp ? ` vs ${r.opp}` : ""}<span className={cx("ml-1 truncate md:hidden", r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "")}>· {r.owner}</span></div>
                  <div className="truncate text-[11px] text-muted md:hidden">{statLine(r)}</div>
                </div>
              </div>
              {isQB && <><Num v={n0(r.passYd)} /><Num v={n1(r.passTd)} /><Num v={n1(r.int)} /><Num v={n0(r.rushYd)} /><Num v={n1(r.td)} /></>}
              {skill && <><Num v={n0(r.rushYd)} /><Num v={n1(r.rec)} /><Num v={n0(r.recYd)} /><Num v={n1(r.td)} /></>}
              {(skill || (!isQB && !skill)) && <span className={cx("hidden truncate text-right text-xs md:block", r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "text-muted")}>{r.owner}</span>}
              <div className="text-right"><div className="num font-[family-name:var(--font-display)] text-xl font-bold leading-none">{r.pts.toFixed(1)}</div>{scope === "ros" && <div className="text-[10px] text-muted">{r.games ? `${(r.pts / r.games).toFixed(1)}/g` : ""}</div>}</div>
            </li>
          ))}
        </ul>
        {rows.length > limit && <button type="button" onClick={() => setLimit(limit + 75)} className="w-full border-t border-line py-3 text-sm font-semibold text-acc-ink">Show more ({rows.length - limit} left)</button>}
        {rows.length === 0 && <p className="p-5 text-sm text-muted">No projected players match.</p>}
      </section>
    </div>
  );
}

const Num = ({ v }: { v: string }) => <span className="num hidden text-right text-sm md:block">{v}</span>;
