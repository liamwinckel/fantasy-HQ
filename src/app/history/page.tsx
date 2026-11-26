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
function GradeChip({ g, size = "md" }: { g: string; size?: "md" | "lg" }) {
  const tone = g.startsWith("A") ? "bg-pos/20 text-pos" : g.startsWith("B") ? "bg-pos/10 text-pos" : g.startsWith("C") ? "bg-panel2 text-fg" : "bg-neg/15 text-neg";
  return <span className={cx("num inline-flex items-center justify-center rounded-lg font-extrabold", tone, size === "lg" ? "h-10 w-12 text-lg" : "h-7 w-9 text-sm")}>{g}</span>;
}
const ownerName = (d: Loaded, o: string) => d.h.owners.get(o)?.name ?? "Manager";

function Trades({ d, ctx }: { d: Loaded; ctx: LeagueContext }) {
  const myOwner = ctx.teams.find((t) => t.rosterId === ctx.myRosterId)?.ownerId ?? "";
  const [who, setWho] = useState<"mine" | "all">("all");
  const list = d.trades.filter((t) => who === "all" || t.sides.some((s) => s.owner === myOwner));
  const myRecord = d.trades.filter((t) => t.sides.some((s) => s.owner === myOwner));
  const won = myRecord.filter((t) => { const me = t.sides.find((s) => s.owner === myOwner)!; return me.share > 1 / t.sides.length + 0.04; }).length;
  const lost = myRecord.filter((t) => { const me = t.sides.find((s) => s.owner === myOwner)!; return me.share < 1 / t.sides.length - 0.04; }).length;
  if (!d.trades.length) return <Notice>No trades in this league&apos;s history yet.</Notice>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{myRecord.length ? <>Your trades: <b className="text-pos">{won} won</b> · <b className="text-neg">{lost} lost</b> · {myRecord.length - won - lost} even</> : "You haven't traded in this league."}</p>
        <Segmented size="md" label="Whose trades" options={[{ value: "all", label: "All" }, { value: "mine", label: "Mine" }]} value={who} onChange={setWho} />
      </div>
      {list.map((t) => (
        <Card key={t.id} title={<span>{t.season} · Week {t.week}</span>} right={<span className="text-xs font-bold text-acc-ink">{t.verdict}</span>} pad={false}>
          <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {t.sides.map((s) => (
              <div key={s.rosterId} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center gap-2"><GradeChip g={s.grade} /><span className={cx("min-w-0 flex-1 truncate font-bold", s.owner === myOwner && "text-acc-ink")}>{ownerName(d, s.owner)}</span></div>
                <ul className="flex flex-col gap-1 text-sm">
                  {s.got.map((g) => (
                    <li key={g.id} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-[10px] font-bold text-muted">{g.pos}</span>
                      <span className="min-w-0 flex-1 truncate">{g.pos === "PICK" ? g.name : <PlayerLink id={g.id} name={g.name} />}</span>
                      {g.pts > 0 && <span className="num shrink-0 text-xs text-muted">{g.pts.toFixed(0)} pts</span>}
                      {g.value > 0 && <span className="num w-10 shrink-0 text-right text-xs font-bold">{g.value.toFixed(0)}</span>}
                    </li>
                  ))}
                  {!s.got.length && <li className="text-muted">Nothing</li>}
                </ul>
                <div className="text-[11px] text-muted">{s.pts.toFixed(0)} starter pts since{s.value > 0 ? ` · ${s.value.toFixed(0)} value today` : ""}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-line px-4 py-2 text-[11px] text-muted">Graded on: {t.basis}</div>
        </Card>
      ))}
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
      {tabs.length > 1 && <div className="mx-auto max-w-full overflow-x-auto"><Segmented label="Draft season" options={tabs} value={draftId} onChange={setDraftId} /></div>}
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
