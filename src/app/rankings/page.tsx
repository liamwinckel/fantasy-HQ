"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { PlayerImg, Segmented } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { InjuryChip, NflLogo, PageHeader, cx } from "@/components/ui";
import { formatLabel } from "@/lib/services/portfolio";
import { rankings, type RankRow, type RankScope } from "@/lib/services/rankings";
import { shsAi, type ShsAi } from "@/lib/services/shsai";
import { weekWeather } from "@/lib/weather";
import { useAsync } from "@/components/AppData";
import { Fragment } from "react";

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
  return <span className={cx("num rounded px-1.5 py-0.5 text-[11px] font-bold", v >= 5 ? "bg-pos/15 text-pos" : v <= -5 ? "bg-neg/15 text-neg" : "bg-panel2 text-muted")}>{v > 0 ? "+" : ""}{v}%</span>;
}

/** Why SHS AI agrees or disagrees: each factor from −1 (worse than his rank) to +1 (better). */
function Factors({ a }: { a: ShsAi }) {
  if (!a.factors.length) return <p className="text-xs text-muted">Not enough data on this player for SHS AI factors.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {a.factors.map((f) => (
        <li key={f.key} className="text-[11px]">
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-center gap-2">
            <span className="font-semibold">{f.label}{f.weight > 1 ? " ×1.5" : ""}</span>
            <span className="relative h-2 rounded-full bg-panel2">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <span className={cx("absolute inset-y-0 rounded-full", f.value >= 0 ? "left-1/2 bg-pos" : "right-1/2 bg-neg")} style={{ width: `${Math.abs(f.value) * 50}%` }} />
            </span>
            <span className={cx("num text-right font-bold", f.value > 0.05 ? "text-pos" : f.value < -0.05 ? "text-neg" : "text-muted")}>{f.value > 0 ? "+" : ""}{f.value.toFixed(2)}</span>
          </div>
          <div className="text-muted">{f.detail}</div>
        </li>
      ))}
    </ul>
  );
}

function RankingsBody({ league, ctx, sp }: LeagueData) {
  const { set } = useQuery();
  const scope: RankScope = sp.scope === "ros" ? "ros" : sp.scope === "dynasty" ? "dynasty" : "week";
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const all = useMemo(() => rankings(ctx, scope), [ctx, scope]);
  const wx = useAsync(() => (scope === "week" ? weekWeather(ctx.games, w0) : Promise.resolve(null)), [ctx, scope, w0]);
  const ai = useMemo(() => shsAi(ctx, all, scope, wx.data), [ctx, all, scope, wx.data]);
  const [open, setOpen] = useState<string | null>(null);
  const [pos, setPos] = useState("ALL");
  const [own, setOwn] = useState<"all" | "fa" | "mine">("all");
  const [by, setBy] = useState<"experts" | "ai" | "pts">("experts");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(75);
  const positions = ["ALL", ...["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"].filter((p) => all.some((r) => r.pos === p))];
  const rows = all
    .filter((r) => (pos === "ALL" || r.pos === pos) && (own === "all" || (own === "fa" ? r.owner === "Free agent" : r.mine)) && (!q || r.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (by === "pts" ? b.pts - a.pts : by === "ai" ? ai.get(b.id)!.rating - ai.get(a.id)!.rating : a.rank - b.rank));
  const dates = ctx.consensusDates;
  const dyn = scope === "dynasty";
  const numLabel = dyn ? "Value" : "Pts";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Rankings"
        info={<>
          <b>ECR</b> (default order) = FantasyPros&apos; expert consensus, the average of dozens of analysts, via DynastyProcess{dates ? ` (updated ${scope === "week" ? dates.weekly : dates.ecr})` : ""}.
          {" "}<b>{dyn ? "Value" : "Pts"}</b> = {dyn ? <>dynasty trade value in this league (0–100{ctx.superflex ? ", superflex" : ""})</> : <>Sleeper&apos;s projection in your scoring, {scope === "week" ? `Week ${w0}` : `Weeks ${w0}–${ctx.lastWeek}`}</>}.
          {" "}<b>SHS AI</b> = 75% ECR + 25% SHS factors, shown as how far it moves him: <b className="text-pos">+</b> = the factors say he&apos;s better than his expert rank, <b className="text-neg">−</b> = worse (±25% max).
          {" "}Factors: points per game, snap share, advanced metrics (opportunity share, efficiency, usage trend) and the projection{scope === "week" ? "; plus weather (Open-Meteo forecast at kickoff), injuries to him and his QB or teammates, defensive matchup and the Vegas team total" : scope === "ros" ? "; plus schedule ahead and injury outlook" : "; plus age cliff, team situation & outlook, coaching stability, usage, and combine & draft profile"}.
          {" "}Tap a player to see each factor.
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
          {([["experts", "ECR"], ["ai", "SHS AI"], ["pts", dyn ? "Value" : "Projection"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setBy(k)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", by === k ? "bg-fg text-bg" : "bg-panel2 text-muted")}>{l}</button>)}
          <span className="mx-1 h-4 w-px bg-line" />
          {([["all", "Everyone"], ["fa", "Free agents"], ["mine", "My team"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setOwn(k)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", own === k ? "bg-fg text-bg" : "bg-panel2 text-muted")}>{l}</button>)}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_3.5rem] items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4rem_4.5rem] sm:px-4">
          <span>{by === "experts" ? "ECR" : by === "ai" ? "AI" : "#"}</span><span>Player</span><span className="hidden sm:block">{dyn ? "Profile" : "Projected stats"}</span><span className="text-center">SHS AI</span><span className="text-right">{numLabel}</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.slice(0, limit).map((r, i) => (
            <Fragment key={r.id}>
            <li onClick={() => setOpen(open === r.id ? null : r.id)} className={cx("cursor-pointer", "grid grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_3.5rem] items-center gap-2 px-3 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4rem_4.5rem] sm:px-4", r.mine && "bg-acc-soft")}>
              <div className="text-center">
                <div className="num text-sm font-bold">{pos === "ALL" ? i + 1 : by === "experts" ? (r.ecrPos ?? "–") : by === "ai" ? ai.get(r.id)!.rank : r.shsPos}</div>
                <div className="text-[9px] font-semibold text-muted">{r.pos}{by === "experts" ? r.ecrPos ?? "" : by === "ai" ? ai.get(r.id)!.rank : r.shsPos}</div>
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
              <div className="text-center"><Shs v={ai.get(r.id)?.pct ?? null} /></div>
              <div className="text-right">
                <div className="num font-[family-name:var(--font-display)] text-xl font-bold leading-none">{(dyn ? r.value : r.pts).toFixed(dyn ? 0 : 1)}</div>
                {scope === "ros" && r.games > 0 && <div className="text-[10px] text-muted">{(r.pts / r.games).toFixed(1)}/g</div>}
              </div>
            </li>
            {open === r.id && (
              <li className="fhq-in bg-panel2/40 px-3 py-3 sm:px-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span><b>SHS AI {ai.get(r.id)?.pct !== null ? `${ai.get(r.id)!.pct! > 0 ? "+" : ""}${ai.get(r.id)!.pct}%` : "—"}</b> <span className="text-muted">· ECR {r.pos}{r.ecrPos ?? "–"} → SHS AI {r.pos}{ai.get(r.id)!.rank}</span></span>
                  <span className="text-muted">bars: − worse than his rank · + better</span>
                </div>
                <Factors a={ai.get(r.id)!} />
              </li>
            )}
            </Fragment>
          ))}
        </ul>
        {rows.length > limit && <button type="button" onClick={() => setLimit(limit + 75)} className="w-full border-t border-line py-3 text-sm font-semibold text-acc-ink">Show more ({rows.length - limit} left)</button>}
        {rows.length === 0 && <p className="p-5 text-sm text-muted">No players match.</p>}
      </section>
    </div>
  );
}
