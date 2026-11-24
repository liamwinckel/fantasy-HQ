"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { TeamLink } from "@/components/TeamPeek";
import { PlayerImg } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { Card, InjuryChip, NflLogo, PageHeader, Tag, cx, signed, Info } from "@/components/ui";
import { formatLabel } from "@/lib/services/portfolio";
import { defenseTable, playerStats, scheduleTable, SOS_POS, teamStats, type PlayerStatRow, type SosPos } from "@/lib/services/stats";

const TABS = [
  { id: "sos", label: "Strength of schedule" },
  { id: "dvp", label: "Defense vs position" },
  { id: "players", label: "Player stats" },
  { id: "teams", label: "Fantasy teams" },
] as const;

export default function StatsPage() {
  return <LeaguePage>{(d) => <StatsBody {...d} />}</LeaguePage>;
}

function StatsBody({ league, ctx, sp }: LeagueData) {
  const { set } = useQuery();
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "sos";
  const def = useMemo(() => defenseTable(ctx), [ctx]);
  const sched = useMemo(() => scheduleTable(ctx, def), [ctx, def]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}`} title="Stats & Schedule" />
      <div className="flex flex-wrap justify-center gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => set({ tab: t.id }, true)}
            className={cx("shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors", tab === t.id ? "border-acc bg-acc text-on-acc" : "border-line text-muted hover:text-fg")}>{t.label}</button>
        ))}
      </div>
      {tab === "sos" && <Sos ctx={ctx} sched={sched} />}
      {tab === "dvp" && <Dvp def={def} />}
      {tab === "players" && <Players ctx={ctx} />}
      {tab === "teams" && <Teams ctx={ctx} />}
    </div>
  );
}

type Ctx = LeagueData["ctx"];
const heat = (f: number | undefined) => {
  if (f === undefined) return undefined;
  const d = Math.max(-0.3, Math.min(0.3, f - 1)) / 0.3; // −1 hard … +1 easy
  return d >= 0 ? `color-mix(in srgb, var(--pos) ${Math.round(d * 55)}%, transparent)` : `color-mix(in srgb, var(--neg) ${Math.round(-d * 55)}%, transparent)`;
};

function PosChips({ pos, setPos, options }: { pos: string; setPos: (p: string) => void; options: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", pos === p ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}>{p === "ALL" ? "All" : p}</button>)}
    </div>
  );
}

function Sos({ ctx, sched }: { ctx: Ctx; sched: ReturnType<typeof scheduleTable> }) {
  const [pos, setPos] = useState<SosPos>("RB");
  const [sort, setSort] = useState<"ros" | "playoffs" | "team">("ros");
  const rows = [...sched.rows].sort((a, b) => sort === "team" ? a.team.localeCompare(b.team) : sort === "ros" ? (a.rosRank[pos] ?? 99) - (b.rosRank[pos] ?? 99) : (a.playoffRank[pos] ?? 99) - (b.playoffRank[pos] ?? 99));
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  const starters = me ? (ctx.lineups.get(me.rosterId)?.optimal.map((s) => s.playerId).filter(Boolean) as string[]) : [];
  const byTeam = new Map(sched.rows.map((r) => [r.team, r]));
  const defF = (opp: string | null, p: string) => (opp ? defTableFactor(ctx, opp, p) : undefined);
  return (
    <>
      {me && starters.length > 0 && (
        <Card title="Your starters' schedule" info={<>For each starter, how easy (+%) or hard (−%) each upcoming NFL opponent is: how many more or fewer fantasy points that defence allows to his position than an average defence.</>} right={<Tag kind="MODEL" />} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-3 py-2 font-semibold sm:px-5">Player</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell" title="Remaining schedule vs an average one (+ = easier)">Rest of season</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell" title="Fantasy playoff weeks">Playoffs</th>
                {sched.weeks.map((w) => <th key={w} className={cx("px-1 py-2 text-center font-semibold", w >= ctx.playoffStart && "text-acc-ink")}><span className="hidden sm:inline">Wk </span>{w}</th>)}
              </tr></thead>
              <tbody>
                {starters.map((id) => {
                  const p = ctx.players.get(id)!;
                  const r = p.team ? byTeam.get(p.team) : undefined;
                  const sp = p.pos as SosPos;
                  return (
                    <tr key={id} className="border-t border-line">
                      <td className="max-w-32 px-3 py-2 sm:max-w-none sm:px-5"><div className="flex items-center gap-2"><span className="hidden sm:block"><PlayerImg id={id} name={p.name} pos={p.pos} size={28} /></span><div className="min-w-0"><PlayerLink id={id} name={p.name} className="block max-w-full text-xs font-semibold sm:text-sm" /><div className="text-[11px] text-muted">{p.pos} · {p.team} · <span className="sm:hidden">RoS {r?.ros[sp] ? signed((r.ros[sp]! - 1) * 100, 0) + "%" : "—"}</span></div></div></div></td>
                      <td className="num hidden px-2 py-2 text-right sm:table-cell">{r?.ros[sp] ? signed((r.ros[sp]! - 1) * 100, 0) + "%" : "—"}</td>
                      <td className="num hidden px-2 py-2 text-right sm:table-cell">{r?.playoffs[sp] ? signed((r.playoffs[sp]! - 1) * 100, 0) + "%" : "—"}</td>
                      {sched.weeks.map((w) => {
                        const opp = r?.weeks[w] ?? null;
                        return <td key={w} className="px-0.5 py-1.5"><span style={{ background: heat(defF(opp, sp)) }} className="flex h-8 items-center justify-center rounded-md text-[11px] font-semibold">{opp ? <NflLogo team={opp} size={18} textFallback /> : <span className="text-muted">BYE</span>}</span></td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Info className="border-t border-line px-5 py-2.5">Green = that defense gives up more fantasy points to the position than average (easier), red = fewer (harder). Based on this season&apos;s points in your league&apos;s scoring.</Info>
        </Card>
      )}

      <Card title="NFL strength of schedule" info={<>Upcoming opponents for each NFL team at the chosen position: green = defences that allow more fantasy points than average (good matchups), red = fewer.</>} right={<PosChips pos={pos} setPos={(p) => setPos(p as SosPos)} options={SOS_POS} />} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="cursor-pointer px-3 py-2 font-semibold sm:px-5" onClick={() => setSort("team")}>Team</th>
              <th className="cursor-pointer px-2 py-2 text-right font-semibold" onClick={() => setSort("ros")}>RoS {sort === "ros" && "▲"}</th>
              <th className="hidden cursor-pointer px-2 py-2 text-right font-semibold sm:table-cell" onClick={() => setSort("playoffs")}>Playoff rank {sort === "playoffs" && "▲"}</th>
              {sched.weeks.map((w) => <th key={w} className={cx("px-1 py-2 text-center font-semibold", w >= ctx.playoffStart && "text-acc-ink")}><span className="hidden sm:inline">Wk </span>{w}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.team} className="border-t border-line">
                  <td className="px-3 py-1.5 sm:px-5"><span className="flex items-center gap-1.5 font-semibold"><NflLogo team={r.team} size={20} />{r.team}</span></td>
                  <td className="num px-2 py-1.5 text-right"><b>{r.rosRank[pos] ?? "—"}</b> <span className="text-[11px] text-muted">{r.ros[pos] ? signed((r.ros[pos]! - 1) * 100, 0) + "%" : ""}</span></td>
                  <td className="num hidden px-2 py-1.5 text-right sm:table-cell"><b>{r.playoffRank[pos] ?? "—"}</b> <span className="text-[11px] text-muted">{r.playoffs[pos] ? signed((r.playoffs[pos]! - 1) * 100, 0) + "%" : ""}</span></td>
                  {sched.weeks.map((w) => {
                    const opp = r.weeks[w];
                    return <td key={w} className="px-0.5 py-1"><span style={{ background: heat(opp ? defTableFactor(ctx, opp, pos) : undefined) }} className="flex h-7 items-center justify-center rounded-md">{opp ? <NflLogo team={opp} size={16} textFallback /> : <span className="text-[10px] text-muted">BYE</span>}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Info className="border-t border-line px-5 py-2.5">Rank 1 = easiest remaining schedule for {pos}s on that team (opponents give up the most fantasy points to {pos}s). Yellow weeks are your fantasy playoffs.</Info>
      </Card>
    </>
  );
}

const defCache = new WeakMap<object, ReturnType<typeof defenseTable>>();
function defTableFactor(ctx: Ctx, team: string, pos: string) {
  let d = defCache.get(ctx);
  if (!d) { d = defenseTable(ctx); defCache.set(ctx, d); }
  return d.find((x) => x.team === team)?.factor[pos as SosPos];
}

function Dvp({ def }: { def: ReturnType<typeof defenseTable> }) {
  const [sortPos, setSortPos] = useState<SosPos>("WR");
  const rows = [...def].sort((a, b) => (a.rank[sortPos] ?? 99) - (b.rank[sortPos] ?? 99));
  return (
    <Card title="Fantasy points allowed per game" info={<>Average fantasy points each NFL defence has allowed per game to each position this season, in your league&apos;s scoring.</>} right={<span className="text-[11px] text-muted">your league&apos;s scoring · tap a column to sort</span>} pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-5 py-2 font-semibold">Defense</th>
            {SOS_POS.map((p) => <th key={p} onClick={() => setSortPos(p)} className={cx("cursor-pointer px-2 py-2 text-center font-semibold", sortPos === p && "text-acc-ink")}>vs {p} {sortPos === p && "▲"}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team} className="border-t border-line">
                <td className="px-3 py-1.5 sm:px-5"><span className="flex items-center gap-1.5 font-semibold"><NflLogo team={r.team} size={20} />{r.team}</span></td>
                {SOS_POS.map((p) => (
                  <td key={p} className="px-1 py-1">
                    <span style={{ background: heat(r.factor[p]) }} className="flex flex-col items-center rounded-md py-1">
                      <span className="num text-sm font-bold">{r.allowed[p]?.toFixed(1) ?? "—"}</span>
                      <span className="text-[10px] text-muted">#{r.rank[p] ?? "—"}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Info className="border-t border-line px-5 py-2.5">#1 = gives up the most to that position (best matchup). Green = above average, red = below.</Info>
    </Card>
  );
}

type Col = { key: keyof PlayerStatRow; label: string; title?: string; fmt?: (r: PlayerStatRow) => string; pos?: string[] };
const COLS: Col[] = [
  { key: "total", label: "Pts", title: "Fantasy points this season, your league's scoring" },
  { key: "ppg", label: "Pts/g" },
  { key: "last4", label: "Last 4", title: "Points per game, last 4 games" },
  { key: "games", label: "G" },
  { key: "projWeek", label: "Proj wk", title: "Sleeper projection this week", fmt: (r) => r.projWeek.toFixed(1) },
  { key: "rosPpg", label: "RoS/g", title: "Sleeper rest-of-season projection per game", fmt: (r) => r.rosPpg.toFixed(1) },
  { key: "snapPct", label: "Snap %", fmt: (r) => (r.snapPct === null ? "—" : `${r.snapPct}`) },
  { key: "passYd", label: "Pass yds", pos: ["QB"] },
  { key: "passTd", label: "Pass TD", pos: ["QB"] },
  { key: "int", label: "INT", pos: ["QB"] },
  { key: "car", label: "Car", pos: ["QB", "RB"] },
  { key: "rushYd", label: "Rush yds", pos: ["QB", "RB", "WR"] },
  { key: "tgt", label: "Tgt", pos: ["RB", "WR", "TE"] },
  { key: "tgtShare", label: "Tgt %", pos: ["RB", "WR", "TE"], fmt: (r) => (r.tgtShare === null ? "—" : `${r.tgtShare}`) },
  { key: "rec", label: "Rec", pos: ["RB", "WR", "TE"] },
  { key: "recYd", label: "Rec yds", pos: ["RB", "WR", "TE"] },
  { key: "td", label: "TD", pos: ["RB", "WR", "TE"] },
  { key: "value", label: "Trade value", title: "SHS trade value, 0–100 in this league", fmt: (r) => r.value.toFixed(0) },
];

function Players({ ctx }: { ctx: Ctx }) {
  const all = useMemo(() => playerStats(ctx), [ctx]);
  const [pos, setPos] = useState("ALL");
  const [own, setOwn] = useState<"all" | "fa" | "mine">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: keyof PlayerStatRow; dir: 1 | -1 }>({ key: "total", dir: -1 });
  const [limit, setLimit] = useState(60);
  const positions = ["ALL", ...["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"].filter((p) => all.some((r) => r.pos === p))];
  const cols = COLS.filter((c) => !c.pos || pos === "ALL" ? !c.pos || c.key === "tgt" || c.key === "rushYd" : c.pos.includes(pos));
  const rows = all
    .filter((r) => (pos === "ALL" || r.pos === pos) && (own === "all" || (own === "fa" ? r.owner === "Free agent" : r.mine)) && (!q || r.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => ((Number(a[sort.key] ?? -1) - Number(b[sort.key] ?? -1)) * sort.dir));
  const click = (key: keyof PlayerStatRow) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }));
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <label className="relative min-w-40 flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" className="w-full rounded-lg border border-line bg-panel2 py-2 pl-8 pr-2 text-sm" />
        </label>
        <PosChips pos={pos} setPos={setPos} options={positions} />
        <div className="flex gap-1">
          {([["all", "Everyone"], ["fa", "Free agents"], ["mine", "My team"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setOwn(k)} className={cx("rounded-full px-3 py-1 text-xs font-semibold", own === k ? "bg-fg text-bg" : "bg-panel2 text-muted")}>{l}</button>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="sticky left-0 z-10 bg-panel px-4 py-2 font-semibold">Player</th>
            {cols.map((c) => (
              <th key={c.key} title={c.title} onClick={() => click(c.key)} className={cx("cursor-pointer whitespace-nowrap px-2 py-2 text-right font-semibold", sort.key === c.key && "text-acc-ink")}>
                <span className="inline-flex items-center gap-0.5">{c.label}{sort.key === c.key && (sort.dir === -1 ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}</span>
              </th>
            ))}
            <th className="px-4 py-2 font-semibold">Owner</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <tr key={r.id} className={cx("border-t border-line", r.mine && "bg-acc-soft")}>
                <td className="sticky left-0 z-10 bg-panel px-4 py-1.5">
                  <div className="flex items-center gap-2">
                    <PlayerImg id={r.id} name={r.name} pos={r.pos} size={28} />
                    <div className="min-w-0"><div className="flex items-center gap-1"><PlayerLink id={r.id} name={r.name} className="max-w-40 font-semibold" /><InjuryChip status={r.injury} /></div><div className="flex items-center gap-1 text-[11px] text-muted"><NflLogo team={r.team} size={12} />{r.pos} · {r.team ?? "FA"}</div></div>
                  </div>
                </td>
                {cols.map((c) => <td key={c.key} className="num whitespace-nowrap px-2 py-1.5 text-right">{c.fmt ? c.fmt(r) : String(r[c.key] ?? "—")}</td>)}
                <td className={cx("whitespace-nowrap px-4 py-1.5 text-xs", r.mine ? "font-semibold text-acc-ink" : r.owner === "Free agent" ? "font-semibold text-pos" : "text-muted")}>{r.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-muted">
        <span>{rows.length} players · stats: NFLverse · points: your league&apos;s scoring · projections: Sleeper</span>
        {rows.length > limit && <button type="button" onClick={() => setLimit(limit + 60)} className="font-semibold text-acc-ink">Show more</button>}
      </div>
    </Card>
  );
}

function Teams({ ctx }: { ctx: Ctx }) {
  const rows = useMemo(() => teamStats(ctx), [ctx]);
  const max = Math.max(1, ...rows.flatMap((r) => r.weekly));
  return (
    <Card title="Fantasy team scoring" info={<>Every fantasy team&apos;s points scored and allowed per week this season.</>} right={<Tag kind="ACTUAL" />} pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 font-semibold sm:px-5">Team</th>
            <th className="px-2 py-2 font-semibold">Record</th>
            <th className="px-2 py-2 text-right font-semibold">PF</th>
            <th className="px-2 py-2 text-right font-semibold">PA</th>
            <th className="hidden px-2 py-2 text-right font-semibold md:table-cell">Avg</th>
            <th className="hidden px-2 py-2 text-right font-semibold md:table-cell">High</th>
            <th className="hidden px-2 py-2 text-right font-semibold md:table-cell">Low</th>
            <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell" title="Your record if you played every team every week">All-play</th>
            <th className="px-2 py-2 text-right font-semibold" title="Actual wins minus all-play expected wins. + = lucky schedule, − = unlucky">Luck</th>
            <th className="hidden px-5 py-2 font-semibold lg:table-cell">Weekly scores</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rosterId} className={cx("border-t border-line", r.rosterId === ctx.myRosterId && "bg-acc-soft")}>
                <td className="max-w-36 px-3 py-2 sm:max-w-none sm:px-5"><TeamLink rosterId={r.rosterId} name={r.name} avatar={r.avatar} size={24} className="max-w-full text-xs font-semibold sm:text-sm" /></td>
                <td className="num px-2 py-2">{r.record}</td>
                <td className="num px-2 py-2 text-right font-semibold">{r.pf.toFixed(1)}</td>
                <td className="num px-2 py-2 text-right">{r.pa.toFixed(1)}</td>
                <td className="num hidden px-2 py-2 text-right md:table-cell">{r.avg.toFixed(1)}</td>
                <td className="num hidden px-2 py-2 text-right md:table-cell">{r.high.toFixed(1)}</td>
                <td className="num hidden px-2 py-2 text-right md:table-cell">{r.low.toFixed(1)}</td>
                <td className="num hidden px-2 py-2 text-right sm:table-cell">{r.allPlay.w}–{r.allPlay.l} <span className="text-[11px] text-muted">{r.allPlay.pct}%</span></td>
                <td className={cx("num px-2 py-2 text-right font-semibold", r.luck > 0.5 ? "text-pos" : r.luck < -0.5 ? "text-neg" : "text-muted")}>{signed(r.luck)}</td>
                <td className="hidden px-5 py-2 lg:table-cell">
                  <svg viewBox={`0 0 ${r.weekly.length * 8} 24`} width={r.weekly.length * 8} height={24} aria-label="Weekly scores">
                    {r.weekly.map((v, i) => <rect key={i} x={i * 8 + 1} y={24 - (v / max) * 22} width={6} height={Math.max(1, (v / max) * 22)} rx={1} fill="var(--acc)" opacity={0.85}><title>{`Week ${i + 1}: ${v.toFixed(1)}`}</title></rect>)}
                  </svg>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Info className="border-t border-line px-5 py-2.5">Tap a team for its roster. Regular-season weeks played so far.</Info>
    </Card>
  );
}
