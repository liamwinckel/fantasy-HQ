"use client";

/**
 * League history: every season of this league on Sleeper. Trade grades, draft grades (hindsight), manager habits and
 * the league's FAAB market. All from Sleeper's free API.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { LeaguePage, useAsync, type LeagueData, Loading } from "@/components/AppData";
import { Card, Info, Notice, PageHeader, cx } from "@/components/ui";
import { Segmented } from "@/components/client";
import { Sheet } from "@/components/Sheet";
import { Search } from "lucide-react";
import { PlayerLink } from "@/components/PlayerCard";
import { formatLabel } from "@/lib/services/portfolio";
import { sleeper } from "@/lib/sleeper/client";
import {
  budgetOf, faabMarket, gradeDraft, isFaab, loadDrafts, loadHistory, managerHabits, playerName, tradeGrades,
  type DraftGrades, type FaabMarket, type History, type ManagerHabits, type TradeGrade,
} from "@/lib/services/history";
import type { LeagueContext } from "@/lib/services/league";

type Tab = "trades" | "drafts" | "managers" | "faab";

export default function HistoryPage() {
  return <LeaguePage>{(d) => <HistoryBody {...d} />}</LeaguePage>;
}

interface Loaded { h: History; trades: TradeGrade[]; drafts: DraftGrades[]; habits: ManagerHabits[]; market: FaabMarket | null }

function HistoryBody({ league, ctx }: LeagueData) {
  const q = useAsync<Loaded>(async () => {
    const h = await loadHistory(ctx);
    const ds = await loadDrafts(h);
    const trades = await tradeGrades(h, ctx);
    const drafts = await Promise.all(ds.map((d) => gradeDraft(d, h, ctx)));
    const market = h.seasons.some((s) => isFaab(s.league)) ? faabMarket(h) : null;
    return { h, trades, drafts, habits: managerHabits(h, market), market };
  }, [ctx]);
  const [tab, setTab] = useState<Tab>("trades");
  const faab = isFaab(league);
  const tabs: { value: Tab; label: string }[] = [{ value: "trades", label: "Trades" }, { value: "drafts", label: "Drafts" }, { value: "managers", label: "Managers" }, ...(q.data?.market ? [{ value: "faab" as Tab, label: "FAAB" }] : [])];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)}`} title="League History" info={<>
        Every season of this league on Sleeper{q.data ? ` (${q.data.h.seasons.map((s) => s.season).reverse().join(", ")})` : ""}: trades graded by what each side actually got, drafts graded in hindsight,
        how each manager plays the waiver wire{faab ? " and what your league really pays in FAAB" : ""}. Everything comes from Sleeper&apos;s public data for this league.
      </>} />
      {q.loading && !q.data ? <Loading label="Reading every season of this league" /> : q.error ? <Notice tone="warn">Couldn&apos;t load this league&apos;s history ({q.error}).</Notice> : q.data && (
        <>
          <div className="mx-auto w-full max-w-sm"><Segmented label="History section" options={tabs} value={tab} onChange={setTab} /></div>
          {tab === "trades" && <Trades d={q.data} ctx={ctx} />}
          {tab === "drafts" && <Drafts d={q.data} ctx={ctx} />}
          {tab === "managers" && <Managers d={q.data} ctx={ctx} />}
          {tab === "faab" && q.data.market && <Faab d={q.data} ctx={ctx} market={q.data.market} />}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
function GradeChip({ g, size = "md" }: { g: string; size?: "sm" | "md" | "lg" }) {
  const tone = g === "—" ? "bg-panel2 text-muted" : g.startsWith("A") ? "bg-pos/20 text-pos" : g.startsWith("B") ? "bg-pos/10 text-pos" : g.startsWith("C") ? "bg-panel2 text-fg" : "bg-neg/15 text-neg";
  return <span className={cx("num inline-flex items-center justify-center rounded-lg font-extrabold", tone, size === "lg" ? "h-10 w-12 text-lg" : size === "sm" ? "h-6 w-8 text-xs opacity-80" : "h-7 w-9 text-sm")}>{g}</span>;
}
const ownerName = (d: Loaded, o: string) => d.h.owners.get(o)?.name ?? "Manager";

/** Per-manager trade record from the graded trades: who wins, who loses, what they go after. */
interface TraderStats { owner: string; n: number; won: number; lost: number; even: number; net: number; picksIn: number; picksOut: number; pos: Map<string, number>; partners: Map<string, number>; best: TradeGrade | null; worst: TradeGrade | null }
function traderStats(trades: TradeGrade[]): TraderStats[] {
  const m = new Map<string, TraderStats>();
  for (const t of trades) {
    const even = 1 / t.sides.length;
    for (const s of t.sides) {
      const x = m.get(s.owner) ?? { owner: s.owner, n: 0, won: 0, lost: 0, even: 0, net: 0, picksIn: 0, picksOut: 0, pos: new Map(), partners: new Map(), best: null, worst: null };
      x.n++; x.net += s.share - even;
      if (s.share > even + 0.04) x.won++; else if (s.share < even - 0.04) x.lost++; else x.even++;
      for (const g of s.got) { if (g.pos === "PICK") x.picksIn++; else x.pos.set(g.pos, (x.pos.get(g.pos) ?? 0) + 1); }
      for (const o of t.sides) if (o.owner !== s.owner) { x.picksOut += o.got.filter((g) => g.pos === "PICK").length; x.partners.set(o.owner, (x.partners.get(o.owner) ?? 0) + 1); }
      const sh = (tt: TradeGrade | null) => tt?.sides.find((q) => q.owner === s.owner)?.share ?? 0;
      if (!x.best || s.share > sh(x.best)) x.best = t;
      if (!x.worst || s.share < sh(x.worst)) x.worst = t;
      m.set(s.owner, x);
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.net - a.net);
}
/** One line describing how a manager trades, from what they actually do. */
function tendency(x: TraderStats, habit: ManagerHabits | undefined) {
  const tags: string[] = [];
  const topPos = [...x.pos].sort((a, b) => b[1] - a[1])[0];
  if (x.picksIn >= 2 && x.picksIn > x.picksOut * 1.5) tags.push("Buys picks");
  else if (x.picksOut >= 2 && x.picksOut > x.picksIn * 1.5) tags.push("Sells picks to win now");
  if (topPos && topPos[1] >= 2) tags.push(`Targets ${topPos[0]}s`);
  if (x.n >= 3 && x.won >= x.n * 0.6) tags.push("Usually wins trades");
  else if (x.n >= 3 && x.lost >= x.n * 0.6) tags.push("Often overpays");
  if (habit?.label.includes("Trader")) tags.unshift("Active trader");
  return tags.slice(0, 3);
}

function Trades({ d, ctx }: { d: Loaded; ctx: LeagueContext }) {
  const myOwner = ctx.teams.find((t) => t.rosterId === ctx.myRosterId)?.ownerId ?? "";
  const stats = useMemo(() => traderStats(d.trades), [d.trades]);
  const seasons = [...new Set(d.trades.map((t) => t.season))];
  const [q, setQ] = useState("");
  const [season, setSeason] = useState("all");
  const [who, setWho] = useState<string>("all"); // "all" | owner id
  const [kind, setKind] = useState<"all" | "picks" | "lopsided">("all");
  const [sort, setSort] = useState<"new" | "margin">("new");
  const [open, setOpen] = useState<string | null>(null);
  if (!d.trades.length) return <Notice>No trades in this league&apos;s history yet.</Notice>;
  const margin = (t: TradeGrade) => { const sh = t.sides.map((x) => x.share).sort((a, b) => b - a); return sh[0] - (sh[1] ?? 0); };
  const needle = q.trim().toLowerCase();
  const list = d.trades
    .filter((t) => season === "all" || t.season === season)
    .filter((t) => who === "all" || t.sides.some((x) => x.owner === who))
    .filter((t) => kind === "all" || (kind === "picks" ? t.sides.some((x) => x.got.some((g) => g.pos === "PICK")) : margin(t) > 0.3))
    .filter((t) => !needle || t.sides.some((x) => ownerName(d, x.owner).toLowerCase().includes(needle) || x.got.some((g) => g.name.toLowerCase().includes(needle))))
    .sort((a, b) => (sort === "margin" ? margin(b) - margin(a) : Number(b.season) - Number(a.season) || b.week - a.week));
  const sel = open ? stats.find((x) => x.owner === open) ?? null : null;
  const chip = (on: boolean) => cx("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-acc bg-acc text-on-acc" : "border-line text-muted");
  return (
    <div className="flex flex-col gap-4">
      {/* Managers at a glance: tap one for their full trade profile */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4" data-no-swipe>
        {stats.map((x) => {
          const mine = x.owner === myOwner;
          const tags = tendency(x, d.habits.find((h) => h.owner === x.owner));
          return (
            <button key={x.owner} type="button" onClick={() => setOpen(x.owner)} className={cx("flex w-44 shrink-0 flex-col gap-1 rounded-2xl border bg-panel p-3 text-left sm:w-auto", mine ? "border-acc/60" : "border-line")}>
              <span className={cx("truncate text-sm font-bold", mine && "text-acc-ink")}>{ownerName(d, x.owner)}</span>
              <span className="num text-xs"><b className="text-pos">{x.won}W</b> · <b className="text-neg">{x.lost}L</b> · <span className="text-muted">{x.even} even</span></span>
              <span className="flex items-center justify-between text-[11px] text-muted"><span>{x.n} trade{x.n === 1 ? "" : "s"}</span><span className={cx("num font-bold", x.net >= 0 ? "text-pos" : "text-neg")}>{x.net >= 0 ? "+" : ""}{Math.round(x.net * 100)}</span></span>
              {tags[0] && <span className="truncate text-[10px] font-bold text-acc-ink">{tags[0]}</span>}
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3"><Search size={15} className="text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players or managers" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />{q && <button type="button" onClick={() => setQ("")} className="text-xs text-muted">Clear</button>}</div>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0" data-no-swipe>
          <button type="button" className={chip(who === "all")} onClick={() => setWho("all")}>Everyone</button>
          {myOwner && <button type="button" className={chip(who === myOwner)} onClick={() => setWho(myOwner)}>Mine</button>}
          <select value={who !== "all" && who !== myOwner ? who : ""} onChange={(e) => setWho(e.target.value || "all")} className={cx(chip(who !== "all" && who !== myOwner), "max-w-[9.5rem] bg-panel pr-1")} aria-label="Manager">
            <option value="">Manager…</option>
            {stats.filter((x) => x.owner !== myOwner).map((x) => <option key={x.owner} value={x.owner}>{ownerName(d, x.owner)}</option>)}
          </select>
          <span className="mx-1 w-px shrink-0 bg-line" />
          <button type="button" className={chip(season === "all")} onClick={() => setSeason("all")}>All seasons</button>
          {seasons.map((y) => <button key={y} type="button" className={chip(season === y)} onClick={() => setSeason(y)}>{y}</button>)}
          <span className="mx-1 w-px shrink-0 bg-line" />
          <button type="button" className={chip(kind === "picks")} onClick={() => setKind(kind === "picks" ? "all" : "picks")}>Picks involved</button>
          <button type="button" className={chip(kind === "lopsided")} onClick={() => setKind(kind === "lopsided" ? "all" : "lopsided")}>Lopsided</button>
          <button type="button" className={chip(sort === "margin")} onClick={() => setSort(sort === "margin" ? "new" : "margin")}>{sort === "margin" ? "Biggest wins first" : "Newest first"}</button>
        </div>
        <p className="text-xs text-muted">{list.length} of {d.trades.length} trades</p>
      </div>

      {list.map((t) => (
        <Card key={t.id} title={<span className="whitespace-nowrap">{t.season} · {t.week ? `Wk ${t.week}` : "Offseason"}</span>} right={<span className="text-xs font-bold text-acc-ink">{t.verdict}</span>} pad={false}
          info={<>{t.atBasis && <><b>At the time:</b> {t.atBasis}. </>}<b>Hindsight:</b> {t.basis}</>}>
          <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {t.sides.map((x) => (
              <div key={x.rosterId} className="flex flex-col gap-2 px-4 py-3">
                <button type="button" onClick={() => setOpen(x.owner)} className="flex items-center gap-2 text-left">
                  <span className={cx("min-w-0 flex-1 truncate font-bold", x.owner === myOwner && "text-acc-ink")}>{ownerName(d, x.owner)}</span>
                  {x.atGrade && <span className="flex flex-col items-center gap-0.5"><GradeChip g={x.atGrade} size="sm" /><span className="text-[9px] font-bold uppercase tracking-wide text-muted">Then</span></span>}
                  <span className="flex flex-col items-center gap-0.5"><GradeChip g={x.grade} /><span className="text-[9px] font-bold uppercase tracking-wide text-muted">{x.atGrade ? "Hindsight" : "Grade"}</span></span>
                </button>
                {x.titles.length > 0 && <span className="self-start rounded-md bg-acc/15 px-2 py-0.5 text-[11px] font-bold text-acc-ink">🏆 Won {x.titles.join(" & ")} title</span>}
                <ul className="flex flex-col gap-1 text-sm">
                  {x.got.map((g) => (
                    <li key={g.id} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-[10px] font-bold text-muted">{g.pos}</span>
                      <span className="min-w-0 flex-1 truncate">{g.pos === "PICK" ? g.name : <PlayerLink id={g.id} name={g.name} />}{g.note?.startsWith("traded on") ? <span className="ml-1 text-[10px] text-muted">({g.note})</span> : null}</span>
                      {g.pts > 0 && <span className="num shrink-0 text-xs text-muted">{g.pts.toFixed(0)} pts</span>}
                      {(g.value > 0 || g.then > 0) && <span className="num w-14 shrink-0 text-right text-xs font-bold">{g.then > 0 ? <span className="font-normal text-muted">{g.then.toFixed(0)}→</span> : null}{g.value.toFixed(0)}</span>}
                    </li>
                  ))}
                  {!x.got.length && <li className="text-muted">Nothing</li>}
                </ul>
                {x.got.length > 1 && <div className="text-[11px] text-muted">{x.then > 0 ? `${x.then.toFixed(0)} then · ` : ""}{x.pts.toFixed(0)} starter pts since{x.value > 0 ? ` · ${x.value.toFixed(0)} now` : ""}</div>}
              </div>
            ))}
          </div>
          {t.story && <div className="border-t border-line px-4 py-2 text-xs font-semibold text-acc-ink">{t.story}</div>}
        </Card>
      ))}
      {!list.length && <Notice>No trades match.</Notice>}

      <Sheet open={!!sel} onClose={() => setOpen(null)} title={sel ? ownerName(d, sel.owner) : ""} sub="Trade profile">
        {sel && <TraderProfile x={sel} d={d} onShow={() => { setWho(sel.owner); setOpen(null); }} />}
      </Sheet>
    </div>
  );
}

function TraderProfile({ x, d, onShow }: { x: TraderStats; d: Loaded; onShow: () => void }) {
  const habit = d.habits.find((h) => h.owner === x.owner);
  const tags = tendency(x, habit);
  const pos = [...x.pos].sort((a, b) => b[1] - a[1]);
  const partners = [...x.partners].sort((a, b) => b[1] - a[1]);
  const line = (t: TradeGrade | null) => { if (!t) return null; const me = t.sides.find((s) => s.owner === x.owner)!; return <>{t.season} wk {t.week}: got {me.got.map((g) => g.name).join(", ") || "nothing"} <b>({me.atGrade ? `${me.atGrade} → ${me.grade}` : me.grade})</b></>; };
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[["Trades", String(x.n)], ["Won", String(x.won)], ["Lost", String(x.lost)], ["Net", `${x.net >= 0 ? "+" : ""}${Math.round(x.net * 100)}`]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-panel2 py-2"><div className={cx("num text-lg font-extrabold", l === "Won" && "text-pos", l === "Lost" && "text-neg")}>{v}</div><div className="text-[11px] text-muted">{l}</div></div>
        ))}
      </div>
      {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="rounded-md bg-acc-soft px-2 py-0.5 text-xs font-bold text-acc-ink">{t}</span>)}</div>}
      <ul className="flex flex-col gap-1.5 text-muted">
        {pos.length > 0 && <li>Acquired most: <b className="text-fg">{pos.slice(0, 3).map(([p, n]) => `${p} (${n})`).join(", ")}</b></li>}
        <li>Picks: <b className="text-fg">{x.picksIn} in · {x.picksOut} out</b></li>
        {partners.length > 0 && <li>Trades most with: <b className="text-fg">{partners.slice(0, 3).map(([o, n]) => `${ownerName(d, o)} (${n})`).join(", ")}</b></li>}
        {habit && <li>Waivers: <b className="text-fg">{habit.adds} pickups{habit.faabBids ? ` · $${habit.faabSpent} FAAB` : ""}</b></li>}
        <li>Best trade: <span className="text-fg">{line(x.best)}</span></li>
        {x.worst && x.worst !== x.best && <li>Worst trade: <span className="text-fg">{line(x.worst)}</span></li>}
      </ul>
      <p className="text-[11px] text-muted">Net = how far ahead of an even split this manager has come out, summed over their trades (+100 would be one trade won outright).</p>
      <button type="button" onClick={onShow} className="rounded-xl bg-acc py-2.5 font-bold text-on-acc">Show their trades</button>
    </div>
  );
}

function Drafts({ d, ctx }: { d: Loaded; ctx: LeagueContext }) {
  // A season can have two drafts (e.g. a startup and a rookie draft), so tabs are keyed by draft, not season.
  const tabs = d.drafts.map((x) => {
    const same = d.drafts.filter((y) => y.season === x.season);
    const big = Math.max(...same.map((y) => y.rounds));
    const kind = same.length < 2 ? "" : same.every((y) => y.rounds === big) ? ` · ${same.indexOf(x) + 1}` : x.rounds === big ? " startup" : " rookie";
    return { value: x.draftId, label: `${x.season}${kind}` };
  });
  const [draftId, setDraftId] = useState(d.drafts.find((s, i) => i > 0 || d.drafts.length === 1)?.draftId ?? d.drafts[0]?.draftId ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const g = d.drafts.find((x) => x.draftId === draftId) ?? d.drafts[0];
  const myOwner = ctx.teams.find((t) => t.rosterId === ctx.myRosterId)?.ownerId ?? "";
  if (!g) return <Notice>No completed drafts found for this league on Sleeper.</Notice>;
  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 && <div className="max-w-full overflow-x-auto"><div className="mx-auto w-max"><Segmented label="Draft season" options={tabs} value={draftId} onChange={setDraftId} /></div></div>}
      <Card title={`${g.season} draft grades`} info={<>Hindsight grades. Every drafted player is scored by what he became ({g.basis.toLowerCase()}), then re-ranked. Each pick is compared
        with the player who finished at that same spot: <b className="text-fg">+</b> means you got more than the slot was worth. Keepers are left out. Grades are curved within the league.</>} pad={false}>
        <ul className="divide-y divide-line">
          {g.teams.map((t) => (
            <li key={t.owner}>
              <button type="button" onClick={() => setOpen(open === t.owner ? null : t.owner)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <GradeChip g={t.grade} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className={cx("truncate font-bold", t.owner === myOwner && "text-acc-ink")}>{ownerName(d, t.owner)}</div>
                  <div className="truncate text-xs text-muted">{t.best ? <>Steal: <b className="text-pos">{t.best.name}</b> (R{t.best.round})</> : null}{t.worst && t.worst.surplus < 0 && t.worst !== t.best ? <> · Miss: <b className="text-neg">{t.worst.name}</b> (R{t.worst.round})</> : null}</div>
                </div>
                <span className={cx("num shrink-0 text-sm font-bold", t.surplus >= 0 ? "text-pos" : "text-neg")}>{t.surplus >= 0 ? "+" : ""}{t.surplus.toFixed(0)}</span>
              </button>
              {open === t.owner && (
                <ul className="flex flex-col gap-1 bg-panel2 px-4 py-2 text-sm">
                  {t.picks.map((p) => (
                    <li key={p.pickNo} className="flex items-center gap-2">
                      <span className="num w-12 shrink-0 text-xs text-muted">{p.round}.{String(p.pickNo).padStart(2, "0")}</span>
                      <span className="w-8 shrink-0 text-[10px] font-bold text-muted">{p.pos}</span>
                      <span className="min-w-0 flex-1 truncate"><PlayerLink id={p.id} name={p.name} />{p.keeper && <span className="ml-1 text-[10px] font-bold text-acc-ink">KEEPER</span>}</span>
                      <span className="num shrink-0 text-xs text-muted">{p.outcome.toFixed(0)}</span>
                      {!p.keeper && <span className={cx("num w-12 shrink-0 text-right text-xs font-bold", p.surplus >= 0 ? "text-pos" : "text-neg")}>{p.surplus >= 0 ? "+" : ""}{p.surplus.toFixed(0)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Managers({ d, ctx }: { d: Loaded; ctx: LeagueContext }) {
  const myOwner = ctx.teams.find((t) => t.rosterId === ctx.myRosterId)?.ownerId ?? "";
  return (
    <div className="flex flex-col gap-3">
      <Card pad={false}>
        <ul className="divide-y divide-line">
          {d.habits.map((m) => {
            const partner = [...m.partners].sort((a, b) => b[1] - a[1])[0];
            return (
              <li key={m.owner} className="flex flex-col gap-1 px-4 py-3">
                <div className={cx("truncate font-bold", m.owner === myOwner && "text-acc-ink")}>{m.name}</div>
                <div className="flex flex-wrap gap-1">{m.label.split(" · ").map((l) => <span key={l} className="rounded-md bg-acc-soft px-2 py-0.5 text-[11px] font-bold text-acc-ink">{l}</span>)}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                  <span><b className="text-fg">{m.trades}</b> trade{m.trades === 1 ? "" : "s"}</span>
                  <span><b className="text-fg">{m.adds}</b> pickup{m.adds === 1 ? "" : "s"}</span>
                  {m.faabBids > 0 && <span><b className="text-fg">${m.faabSpent}</b> FAAB spent</span>}
                  {m.avgWin !== null && <span>avg winning bid <b className="text-fg">{Math.round(m.avgWin * 100)}%</b></span>}
                  {partner && <span>trades most with <b className="text-fg">{d.h.owners.get(partner[0])?.name ?? "?"}</b> ({partner[1]})</span>}
                  <span>{m.seasons} season{m.seasons === 1 ? "" : "s"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="text-center text-xs text-muted">Managers tagged <b>Trader</b> are the likeliest to say yes: start with them in the <Link href="/trade-finder" className="underline">Trade Finder</Link>.</p>
    </div>
  );
}

function Faab({ d, ctx, market: m }: { d: Loaded; ctx: LeagueContext; market: FaabMarket }) {
  const left = useAsync(() => sleeper.rosters(ctx.league.league_id).then((r) => r.data), [ctx]);
  const B = budgetOf(ctx.league);
  const pct = (v: number) => `$${Math.round(v * B)}`;
  const top = useMemo(() => [...m.wins].sort((a, b) => b.pct - a.pct).slice(0, 10), [m]);
  return (
    <div className="flex flex-col gap-4">
      <Card title="What your league pays" info={<>Winning waiver bids from {m.seasons} season{m.seasons === 1 ? "" : "s"} of this league, shown in today&apos;s ${B} budget. {m.fromLeague ? "" : "There isn't much history yet, so typical FAAB prices fill in for now."}</>}>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[["Typical", 0.5], ["Strong add", 0.8], ["Must-add", 0.93]].map(([l, p]) => (
            <div key={l as string} className="rounded-xl bg-panel2 py-3"><div className="num text-2xl font-extrabold">{pct(m.q(p as number))}</div><div className="text-[11px] text-muted">{l}</div></div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          {m.wins.length} winning bids{m.contestedMedian !== null ? <> · contested claims (2+ bidders) went for a median <b className="text-fg">{pct(m.contestedMedian)}</b></> : null}
          {m.overbidMedian !== null ? <> · the winner beat the runner-up by a median <b className="text-fg">{pct(m.overbidMedian)}</b></> : null}.
        </p>
      </Card>
      {left.data && (
        <Card title="Budgets left" pad={false}>
          <ul className="divide-y divide-line">
            {[...left.data].map((r) => ({ r, left: B - Number((r.settings as Record<string, unknown>).waiver_budget_used ?? 0) })).sort((a, b) => b.left - a.left).map(({ r, left: l }) => (
              <li key={r.roster_id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className={cx("min-w-0 flex-1 truncate font-semibold", r.roster_id === ctx.myRosterId && "text-acc-ink")}>{ctx.teams.find((t) => t.rosterId === r.roster_id)?.name ?? `Team ${r.roster_id}`}</span>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-acc" style={{ width: `${(100 * l) / B}%` }} /></div>
                <span className="num w-12 text-right font-bold">${l}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Biggest bids" pad={false}>
        <ul className="divide-y divide-line">
          {top.map((b, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate"><PlayerLink id={b.pid} name={playerName(d.h, ctx, b.pid)} className="font-semibold" /> <span className="text-xs text-muted">{b.season} wk {b.week} · {d.h.owners.get(b.owner)?.name ?? "?"}{b.bidders > 1 ? ` · ${b.bidders} bids` : ""}</span></span>
              <span className="num shrink-0 text-right"><b>${Math.round(b.pct * B)}</b><span className="block text-[10px] text-muted">{Math.round(b.pct * 100)}% of budget</span></span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
