"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { PlayerImg, Segmented, TabSwitch } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { InfoButton, InjuryChip, NflLogo, PageHeader, cx } from "@/components/ui";
import { AiChip, label, MovePill, rankMove, ShsExplainer, shsVerdict, useCollege, useShsWeights } from "@/components/ShsAiParts";
import { accuracy, snapshotWeek } from "@/lib/services/accuracy";
import { BacktestCard } from "@/components/Backtest";
import { playerDist } from "@/lib/engine/ranges";
import { scoringRules } from "@/lib/engine/scoring";
import { isSuperflex } from "@/lib/engine/positions";
import { Sparkline, TREND_MAX } from "@/components/charts";
import { useEffect } from "react";
import { formatLabel } from "@/lib/services/portfolio";
import { leagueOpts, pickRows, rankings, type RankOpts, type RankRow, type RankScope } from "@/lib/services/rankings";
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

function SortHead({ k, by, desc, onSort, children, className }: { k: "experts" | "ai" | "name" | "pts"; by: string; desc: boolean; onSort: (k: "experts" | "ai" | "name" | "pts") => void; children: React.ReactNode; className?: string }) {
  const on = by === k;
  return (
    <button type="button" onClick={() => onSort(k)} aria-label={`Sort by ${String(children)}`}
      className={cx("flex items-center justify-center gap-0.5 uppercase tracking-wider", on ? "text-fg" : "text-muted hover:text-fg", className)}>
      {children}<span className={cx("text-[8px]", !on && "opacity-0")}>{desc ? "▲" : "▼"}</span>
    </button>
  );
}

/** SHS AI column: "=" or up/down ticks; tap for the exact number and why. */
function Shs({ a, name, open, onToggle }: { a: ShsAi | undefined; name: string; open: boolean; onToggle: () => void }) {
  if (!a || a.pct === null) return <span className="text-[10px] text-muted">—</span>;
  return <AiChip v={a.pct} ai={a} name={name} onTap={onToggle} active={open} />;
}

/** Why SHS AI agrees or disagrees: each factor from −1 (worse than his rank) to +1 (better). */
export function Factors({ a }: { a: ShsAi }) {
  if (!a.factors.length && !a.market) return <p className="text-xs text-muted">Not enough data on this player for SHS AI factors.</p>;
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  const rowsF = [
    ...(a.market ? [{ key: "market", label: "Betting markets", value: a.market.value, weight: 1, detail: `Markets imply ${a.market.pts.toFixed(1)} pts in your scoring (${a.market.covered.map((c) => MKT[c] ?? c).join(", ")})` }] : []),
    ...a.factors,
  ];
  return (
    <>
    {a.mode === "custom"
      ? <p className="mb-2 text-[11px] text-muted">Custom mix: {pc(a.blend.expert)} expert rank{a.blend.sleeper ? ` · ${pc(a.blend.sleeper)} projection` : ""}{a.blend.market ? ` · ${pc(a.blend.market)} betting lines` : ""} · {pc(a.blend.factors)} SHS factors</p>
      : <p className="mb-2 text-[11px] text-muted">SHS formula: his expert-rank value, moved only by what has beaten the experts in past seasons{a.blend.market ? `, with ${pc(a.blend.market)} from betting lines` : ""}. {a.parts.filter((x) => Math.abs(x.effect) >= 0.005).map((x) => `${label(x.key)} ${x.effect > 0 ? "+" : "−"}${Math.abs(Math.round(x.effect * 1000) / 10)}%`).join(" · ") || "Nothing moved him."} Dim rows are tracked but have no proven edge.</p>}
    <ul className="flex flex-col gap-1.5">
      {rowsF.map((f) => (
        <li key={f.key} className={cx("text-[11px]", a.mode !== "custom" && f.key !== "market" && !a.parts.some((x) => x.key === f.key) && "opacity-50")}>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-center gap-2">
            <span className="font-semibold">{f.label}{a.mode === "custom" && f.key !== "market" && f.weight !== 1 ? ` ×${f.weight}` : ""}</span>
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
    </>
  );
}
const MKT: Record<string, string> = { pass_yd: "pass yds", rush_yd: "rush yds", rec_yd: "rec yds", rr_yd: "rush+rec yds", rec: "receptions", td: "anytime TD", pass_td: "pass TDs", rush_td: "rush TDs", rec_td: "rec TDs", pass_int: "INTs" };

function RankingsBody({ league, ctx, sp }: LeagueData) {
  const { set } = useQuery();
  const scope: RankScope = sp.scope === "ros" ? "ros" : sp.scope === "dynasty" ? "dynasty" : "week";
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  // View modifiers (format / scoring); empty = this league's settings.
  const [mods, setMods] = useState<RankOpts>({});
  const lo = useMemo(() => leagueOpts(ctx), [ctx]);
  const opt = { ...lo, ...mods };
  const all = useMemo(() => rankings(ctx, scope, mods), [ctx, scope, mods]);
  const pickList = useMemo(() => (scope === "dynasty" ? pickRows(ctx, mods) : []), [ctx, scope, mods]);
  // Dynasty list includes this league's rookie picks, slotted by value among the players.
  const list = useMemo(() => (scope === "dynasty" ? [...all, ...pickList].sort((a, b) => b.value - a.value) : all), [all, pickList, scope]);
  const wx = useAsync(() => (scope === "week" ? weekWeather(ctx.games, w0) : Promise.resolve(null)), [ctx, scope, w0]);
  const college = useCollege(ctx, scope === "dynasty" ? all.slice(0, 400) : []);
  const weights = useShsWeights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ai = useMemo(() => shsAi(ctx, all, scope, wx.data, { college }), [ctx, all, scope, wx.data, college, weights]);
  // Save this week's rankings (before kickoff) so SHS AI can be graded against what actually happens.
  useEffect(() => { if (scope === "week" && !wx.loading) snapshotWeek(ctx, all, ai).catch(() => {}); }, [ctx, all, ai, scope, wx.loading]);
  const acc = useAsync(() => accuracy(ctx), [ctx]);
  const dists = useMemo(() => (scope === "week" ? new Map(all.filter((r) => r.pts > 0.5).map((r) => [r.id, playerDist(ctx, r.id, Math.min(ctx.currentWeek, ctx.lastWeek))])) : new Map<string, ReturnType<typeof playerDist>>()), [ctx, all, scope]);
  const [aiInfo, setAiInfo] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [pos, setPos] = useState("ALL");
  const [own, setOwn] = useState<"all" | "fa">("all");
  // Tap a column title to sort by it; tap again to flip the order.
  const [by, setBy] = useState<"experts" | "ai" | "name" | "pts">("experts");
  const [desc, setDesc] = useState(false);
  const sortBy = (k: typeof by) => { if (k === by) setDesc(!desc); else { setBy(k); setDesc(false); } };
  const [q, setQ] = useState("");
  const [about, setAbout] = useState(false);
  const [limit, setLimit] = useState(75);
  const dynScope = scope === "dynasty";
  const IDP = ["DL", "LB", "DB"];
  const hasIdp = all.some((r) => IDP.includes(r.pos));
  const positions = ["ALL", ...["QB", "RB", "WR", "TE", "K", "DEF"].filter((p) => all.some((r) => r.pos === p)), ...(hasIdp ? ["IDP", ...IDP.filter((p) => all.some((r) => r.pos === p))] : []), ...(pickList.length ? ["PICK"] : [])];
  const posMatch = (rp: string) => pos === "ALL" || rp === pos || (pos === "IDP" && IDP.includes(rp));
  const rules = scoringRules(ctx.league.scoring_settings as Record<string, number>);
  // Ranks come from the full list, so filters (position, owner, search) never renumber players.
  const ranked = useMemo(() => {
    const ecr = scope === "dynasty" ? list : [...all].sort((a, b) => a.rank - b.rank);
    const byAi = [...all].sort((a, b) => (a.ecrPos === null ? 1 : 0) - (b.ecrPos === null ? 1 : 0) || ai.get(b.id)!.rating - ai.get(a.id)!.rating);
    return { ecr, ai: byAi, ecrN: new Map(ecr.map((r, i) => [r.id, i + 1])), aiN: new Map(byAi.map((r, i) => [r.id, i + 1])) };
  }, [all, ai, list, scope]);
  const base = by === "ai" ? ranked.ai : by === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name))
    : by === "pts" ? [...list].sort((a, b) => (scope === "dynasty" ? b.value - a.value : b.pts - a.pts)) : ranked.ecr;
  // Last 6 games of league-scored points for each player's trend line.
  // Last 6 games on a scale shared by every player at the position; dashed line = this league's startable line there.
  const trend = (id: string, pos: string) => {
    const l = (ctx.logs.get(id) ?? []).slice(-6).map((g) => g.pts);
    const ref = ctx.replacement[pos];
    return l.length >= 3 ? <Sparkline values={l} width={48} height={16} max={TREND_MAX[pos] ?? 30} refLine={ref} label={`Last ${l.length} games: ${l.map((v) => v.toFixed(1)).join(", ")}. Dashed line ≈ ${ref?.toFixed(1) ?? "—"} pts, the startable line for a ${pos} in this league.`} /> : null;
  };
  const ptsN = useMemo(() => new Map([...list].sort((a, b) => (dynScope ? b.value - a.value : b.pts - a.pts)).map((r, i) => [r.id, i + 1])), [list, dynScope]);
  const rows = (desc ? [...base].reverse() : base)
    .filter((r) => posMatch(r.pos) && (own === "all" || r.owner === "Free agent") && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const dates = ctx.consensusDates;
  const dyn = scope === "dynasty";
  const numLabel = dyn ? "Value" : "Pts";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Rankings"
        info={<>
          <b>ECR</b> (default order) = FantasyPros&apos; expert consensus, the average of dozens of analysts, via DynastyProcess{dates ? ` (updated ${scope === "week" ? dates.weekly : dates.ecr})` : ""}.
          {" "}<b>{dyn ? "Value" : "Pts"}</b> = {dyn ? <>dynasty trade value in this league (0–100{ctx.superflex ? ", superflex" : ""})</> : <>Sleeper&apos;s projection in your scoring, {scope === "week" ? `Week ${w0}` : `Weeks ${w0}–${ctx.lastWeek}`}</>}.
          {" "}<b>SHS</b> = SHS AI&apos;s agreement with the experts: <b className="text-pos">+</b> = better than his expert rank, <b className="text-neg">−</b> = worse. Tap the ⓘ on the SHS column for what goes into it, or a player to see each factor.
        </>}>
        <TabSwitch label="Rankings span" value={scope} onChange={(v) => { set({ scope: v === "week" ? undefined : v }, true); setLimit(75); }}
          options={[{ value: "week", label: "Week", sub: `Week ${w0}` }, { value: "ros", label: "Season", sub: `Weeks ${w0}–${ctx.lastWeek}` }, { value: "dynasty", label: "Dynasty", sub: "Long term" }]} />
        <Modifiers scope={scope} opt={opt} lo={lo} set={(m) => setMods({ ...mods, ...m })} reset={() => setMods({})} />
      </PageHeader>

      {/* SHS AI results in one compact strip; tap a row for the full detail. */}
      {(scope === "week" || acc.data) && (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {scope === "week" && <BacktestCard ctx={ctx} compact />}
          {acc.data && <TrackRow a={acc.data} />}
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-3 flex flex-col gap-2 border-b border-line bg-bg/95 px-3 py-2.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-panel sm:p-3">
        <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" className="w-full rounded-lg border border-line bg-panel2 py-2 pl-8 pr-2 text-sm" />
        </label>
        <button type="button" onClick={() => setAbout(!about)} aria-expanded={about} aria-label="About these rankings"
          className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold", about ? "border-acc bg-acc text-on-acc" : "border-line bg-panel2 text-muted")}>i</button>
        </div>
        {about && <div className="fhq-in flex flex-col gap-1.5 rounded-lg bg-panel2/60 p-2.5">
        {dates && (
          <p className="text-[11px] text-muted">Expert ranks as of <b className="text-fg">{scope === "week" ? dates.weekly : dates.ecr}</b> (FantasyPros via DynastyProcess, refreshed weekly{dyn ? "; dynasty order = FantasyPros dynasty " + (isSuperflex(ctx.league.roster_positions) ? "superflex" : "overall") + " list" : ""}). FantasyPros&apos; own site updates daily, so recent moves can lag a few days.</p>
        )}
        {!dyn && (
          <p className="text-[11px] leading-relaxed text-muted">
            Points use this league&apos;s scoring: <span className="font-semibold text-fg">{rules.join(" · ")}</span>.
            {by === "pts" ? " Ordered by projected points in that scoring." : " Expert order is converted to your scoring across positions; tap the Pts column to rank purely by points."}
            {" "}Trend lines = his last 6 games on the same scale for every player at his position; dashed = the startable line at that position in this league; end dot green if his latest game cleared it.
          </p>
        )}
        </div>}
        <div className="flex items-center gap-2">
          <Segmented label="Players shown" value={own} onChange={(v) => setOwn(v)} options={[{ value: "all", label: "All players" }, { value: "fa", label: "Free agents" }]} />
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" data-no-swipe>
            {positions.map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", pos === p ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}>{p === "ALL" ? "All" : p === "DEF" ? "DST" : p === "PICK" ? "Picks" : p}</button>)}
          </div>
        </div>
      </div>


      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.75rem_3.5rem] items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4.5rem_4.5rem] sm:px-4">
          <SortHead k="experts" by={by} desc={desc} onSort={sortBy}>ECR</SortHead>
          <SortHead k="name" by={by} desc={desc} onSort={sortBy} className="justify-start">Player</SortHead>
          <span className="hidden sm:block">{dyn ? "Profile" : "Projected stats"}</span>
          <span className="flex items-center justify-center gap-0.5"><SortHead k="ai" by={by} desc={desc} onSort={sortBy}>SHS</SortHead><InfoButton open={aiInfo} onClick={() => setAiInfo(!aiInfo)} label="What is SHS AI?" /></span>
          <SortHead k="pts" by={by} desc={desc} onSort={sortBy} className="justify-end">{numLabel}</SortHead>
        </div>
        {aiInfo && <div className="fhq-in border-b border-line bg-panel2/40 px-3 py-3 sm:px-4"><ShsExplainer scope={scope} /></div>}
        <ul className="divide-y divide-line">
          {rows.slice(0, limit).map((r) => r.pos === "PICK" ? (
            <li key={r.id} className={cx("grid grid-cols-[2.5rem_minmax(0,1fr)_3.75rem_3.5rem] items-center gap-2 px-3 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4.5rem_4.5rem] sm:px-4", r.mine && "bg-acc-soft")}>
              <div className="text-center"><div className="num text-sm font-bold">{ranked.ecrN.get(r.id)}</div><div className="text-[9px] font-semibold text-muted">PICK</div></div>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-acc/50 bg-acc-soft text-[10px] font-extrabold text-acc-ink">{r.name.split(" ")[1] ?? "PK"}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{r.name}</div>
                  <div className="truncate text-[11px] text-muted"><span className={cx(r.mine && "font-semibold text-acc-ink")}>{r.owner}</span>{r.opp ? ` · ${r.opp}` : ""}{r.ecrAll ? ` · experts rank it like #${Math.round(r.ecrAll)} overall` : " · pick model"}</div>
                </div>
              </div>
              <div className="hidden text-xs text-muted sm:block">Rookie pick</div>
              <div />
              <div className="text-right"><div className="num font-[family-name:var(--font-display)] text-xl font-bold leading-none">{r.value.toFixed(0)}</div></div>
            </li>
          ) : (
            <Fragment key={r.id}>
            <li onClick={() => setOpen(open === r.id ? null : r.id)} className={cx("cursor-pointer", "grid grid-cols-[2.5rem_minmax(0,1fr)_3.75rem_3.5rem] items-center gap-2 px-3 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)_4.5rem_4.5rem] sm:px-4", r.mine && "bg-acc-soft")}>
              <div className="text-center">
                <div className="num text-sm font-bold">{by === "ai" ? ranked.aiN.get(r.id) : by === "pts" ? ptsN.get(r.id) : r.ecrPos !== null ? ranked.ecrN.get(r.id) : "–"}</div>
                <div className="text-[9px] font-semibold text-muted">{r.pos}{by === "ai" ? ai.get(r.id)!.rank : by === "pts" ? r.shsPos : r.ecrPos ?? "–"}</div>
              </div>
              <div className="flex min-w-0 items-center gap-2.5">
                <PlayerImg id={r.id} name={r.name} pos={r.pos} size={34} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><PlayerLink id={r.id} name={r.name} className="min-w-0" /><InjuryChip status={r.injury} /></div>
                  <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] text-muted"><NflLogo team={r.team} size={12} />{r.pos} · {r.team ?? "FA"}{r.opp ? ` vs ${r.opp}` : ""}<span className={cx("ml-1 truncate", r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "")}>· {r.owner}</span></div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">{trend(r.id, r.pos)}<span className="truncate sm:hidden">{statLine(r, scope)}</span></div>
                </div>
              </div>
              <div className="hidden truncate text-xs text-muted sm:block">{statLine(r, scope)}</div>
              <div className="flex justify-center"><Shs a={ai.get(r.id)} name={r.name} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} /></div>
              <div className="text-right">
                <div className="num font-[family-name:var(--font-display)] text-xl font-bold leading-none">{(dyn ? r.value : r.pts).toFixed(dyn ? 0 : 1)}</div>
                {scope === "ros" && r.games > 0 && <div className="text-[10px] text-muted">{(r.pts / r.games).toFixed(1)}/g</div>}
                {scope === "week" && r.pts > 0.5 && (() => { const d = dists.get(r.id); return d ? <div className="num text-[10px] text-muted" title="Floor (1 week in 10 worse) – ceiling (1 in 10 better)">{d.floor.toFixed(0)}–{d.ceiling.toFixed(0)}</div> : null; })()}
              </div>
            </li>
            {open === r.id && (
              <li className="fhq-in bg-panel2/40 px-3 py-3 sm:px-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2"><b>Experts {r.pos}{r.ecrPos ?? "–"} → SHS AI {r.pos}{ai.get(r.id)!.rank}</b><MovePill move={rankMove(ai.get(r.id))} /></span>
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

/** Live track record as one row; tap for the numbers. */
function TrackRow({ a }: { a: NonNullable<Awaited<ReturnType<typeof accuracy>>> }) {
  const [open, setOpen] = useState(false);
  const d = Math.round((a.shs - a.experts) * 10) / 10;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-panel2">
        <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", d > 0 ? "bg-pos" : d < 0 ? "bg-neg" : "bg-muted")} />
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Live track record</span><span className="block truncate text-[11px] text-muted">{a.weeks.length} week{a.weeks.length === 1 ? "" : "s"} · SHS AI {a.shs.toFixed(1)}% vs experts {a.experts.toFixed(1)}%</span></span>
        <span className={cx("num shrink-0 text-sm font-bold", d > 0 ? "text-pos" : d < 0 ? "text-neg" : "text-muted")}>{d > 0 ? `+${d}` : d}</span>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Live track record" sub="Saved on this device before kickoff each week">
        <TrackRecord a={a} />
      </Sheet>
    </>
  );
}

function TrackRecord({ a }: { a: NonNullable<Awaited<ReturnType<typeof accuracy>>> }) {
  const best = Math.max(a.experts, a.shs, a.sleeper);
  const cell = (l: string, v: number) => (
    <div className={cx("rounded-lg px-2 py-1.5 text-center", v === best ? "bg-pos/15" : "bg-panel2")}>
      <div className={cx("num text-lg font-bold leading-none", v === best && "text-pos")}>{v.toFixed(1)}%</div><div className="mt-0.5 text-[10px] text-muted">{l}</div>
    </div>
  );
  return (
    <section className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted">Live track record (incl. betting lines & weather)</h2>
        <span className="text-[11px] text-muted">{a.weeks.length} week{a.weeks.length === 1 ? "" : "s"} · {a.pairs.toLocaleString()} matchups</span>
      </div>
      <div className="grid grid-cols-3 gap-2">{cell("Experts", a.experts)}{cell("SHS AI", a.shs)}{cell("Projection", a.sleeper)}</div>
      <p className="mt-2 text-[11px] text-muted">How often each ranking put the higher scorer first, comparing every pair of players at a position (saved on this device before kickoff each week).{a.weeks.length >= 3 ? " SHS AI is now tuning its factor weights from these results." : " Factor auto-tuning starts after 3 graded weeks."}</p>
    </section>
  );
}

/**
 * Format / scoring modifiers under the Week · Season · Dynasty switch. They start at this league's settings (marked
 * with a dot) and only change this list. Dynasty: 1QB or superflex lists and TE premium. Week / season: points per
 * reception, TE premium and passing TD points (projections are re-scored).
 */
function Modifiers({ scope, opt, lo, set, reset }: { scope: RankScope; opt: Required<RankOpts>; lo: Required<RankOpts>; set: (m: RankOpts) => void; reset: () => void }) {
  const changed = opt.sf !== lo.sf || opt.tep !== lo.tep || opt.ppr !== lo.ppr || opt.passTd !== lo.passTd;
  const group = <T extends string | number | boolean>(label: string, value: T, league: T, options: [T, string][], on: (v: T) => void) => (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">{label}</span>
      <div className="flex rounded-full border border-line bg-panel2 p-0.5">
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" onClick={() => on(v)} aria-pressed={value === v}
            className={cx("relative flex-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold transition-colors", value === v ? "bg-fg text-bg" : "text-muted")}>
            {l}{league === v && <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-acc" aria-label="league setting" />}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className={cx("grid gap-2", scope === "dynasty" ? "grid-cols-2" : "grid-cols-3")}>
        {scope === "dynasty" && group("Format", opt.sf, lo.sf, [[false, "1QB"], [true, "Superflex"]], (v) => set({ sf: v }))}
        {scope !== "dynasty" && group("PPR", opt.ppr, lo.ppr, ([[0, "0"], [0.5, "½"], [1, "1"]] as [number, string][]).concat([0, 0.5, 1].includes(lo.ppr) ? [] : [[lo.ppr, String(lo.ppr)]]).sort((a, b) => a[0] - b[0]), (v) => set({ ppr: v }))}
        {group("TE premium", opt.tep, lo.tep, ([[0, "None"], [0.5, "+.5"], [1, "+1"]] as [number, string][]).concat([0, 0.5, 1].includes(lo.tep) ? [] : [[lo.tep, `+${lo.tep}`]]).sort((a, b) => a[0] - b[0]), (v) => set({ tep: v }))}
        {scope !== "dynasty" && group("Pass TD", opt.passTd, lo.passTd, ([[4, "4 pt"], [6, "6 pt"]] as [number, string][]).concat([4, 6].includes(lo.passTd) ? [] : [[lo.passTd, `${lo.passTd} pt`]]).sort((a, b) => a[0] - b[0]), (v) => set({ passTd: v }))}
      </div>
      <p className="text-[10px] text-muted">
        <span className="mr-1 inline-block h-1 w-1 rounded-full bg-acc align-middle" />= your league&apos;s setting.{" "}
        {scope === "dynasty" ? "Superflex uses FantasyPros' superflex dynasty list. TE premium has no expert list, so TEs are raised by how much the premium adds to their scoring (more catches, bigger boost)." : "Changing these re-scores every projection."}
        {changed && <button type="button" onClick={reset} className="ml-1 font-semibold text-acc-ink underline">Back to league settings</button>}
      </p>
    </div>
  );
}
