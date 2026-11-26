"use client";

/**
 * Home: every league as its own widget, stacked. Each shows this week's matchup (both teams, projected or live
 * scores, win chance), standing and recent form. Tapping a widget opens that league's matchup; three buttons at the
 * bottom open its stats (PF / PA), overview (playoff odds) and league analyzer (power rank). Two views: full cards or
 * slim strips. Press and hold a league to drag it into a new order (saved on this device).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutList, Rows3 } from "lucide-react";
import { Reorder } from "@/components/Reorder";
import { useApp, Loading } from "@/components/AppData";
import { Onboarding } from "@/components/Onboarding";
import { Logo, Notice, cx } from "@/components/ui";
import { EASE, Roll, firstTime, useGrow } from "@/components/motion";
import { Sparkline } from "@/components/charts";
import { getLeagueContext, type LeagueContext } from "@/lib/services/league";
import { formatLabel } from "@/lib/services/portfolio";
import { gameView } from "@/lib/services/views";
import { powerRankings } from "@/lib/engine/power";
import { ord } from "@/lib/engine/classify";
import { effectiveMode } from "@/lib/settings";
import type { League } from "@/lib/sleeper/types";
import { leagueColour as colourOf } from "@/lib/leagueColour";
import { HomeCheck } from "@/components/HomeCheck";


type Slot = { ctx: LeagueContext | null; error: string | null };
const ORDER_KEY = "fhq-home-order", VIEW_KEY = "fhq-home-view";
function load<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } }
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
// Survives leaving and coming back to Home, so returning shows the widgets at once instead of loading skeletons.
const seen: Record<string, Slot> = {};

export default function Home() {
  const app = useApp();
  const { setup } = app;
  const [slots, setSlots] = useState<Record<string, Slot>>(() => ({ ...seen }));
  const [order, setOrder] = useState<string[]>(() => load<string[]>(ORDER_KEY, []));
  const [view, setView] = useState<"cards" | "strips">(() => load(VIEW_KEY, "cards"));
  const saveOrder = (k: string[]) => { setOrder(k); save(ORDER_KEY, k); };
  const saveView = (v: "cards" | "strips") => { setView(v); save(VIEW_KEY, v); };

  useEffect(() => {
    if (!setup?.settings.userId) return;
    let live = true;
    for (const l of setup.leagues) {
      getLeagueContext(l.league_id, { userId: setup.settings.userId, mode: effectiveMode(setup.settings, l.league_id, l.settings.type) })
        .then((ctx) => { seen[l.league_id] = { ctx, error: null }; if (live) setSlots((s) => (s[l.league_id]?.ctx === ctx ? s : { ...s, [l.league_id]: seen[l.league_id] })); })
        .catch((e) => live && setSlots((s) => ({ ...s, [l.league_id]: { ctx: null, error: (e as Error).message } })));
    }
    return () => { live = false; };
  }, [setup, app.synced]);

  if (!setup) return app.setupError ? <Notice tone="warn">{app.setupError}</Notice> : <Loading label="Connecting to Sleeper" />;
  if (!setup.settings.userId) return <Onboarding suggested="L1am" />;
  if (!setup.leagues.length) return <Notice tone="warn">No leagues found for {setup.settings.username}. Add one in <Link href="/settings" className="underline">Settings</Link>.</Notice>;

  const ready = setup.leagues.map((l) => slots[l.league_id]?.ctx).filter(Boolean) as LeagueContext[];
  const games = ready.map((c) => (c.myRosterId !== null && !c.seasonOver ? gameView(c, c.myRosterId, Math.min(c.currentWeek, c.lastWeek)) : null)).filter((g) => g?.b && g.winProbA !== null);
  const favoured = games.filter((g) => (g!.winProbA ?? 0) >= 50).length;
  const week = ready[0] ? Math.min(ready[0].currentWeek, ready[0].lastWeek) : null;

  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? 1e6 : i; };
  const leagues = [...setup.leagues].sort((a, b) => rank(a.league_id) - rank(b.league_id));
  const viewBtn = (v: "cards" | "strips", Icon: typeof Rows3, label: string) => (
    <button type="button" onClick={() => saveView(v)} aria-pressed={view === v} aria-label={label}
      className={cx("flex h-8 w-9 items-center justify-center rounded-full transition-colors", view === v ? "bg-acc text-on-acc" : "text-muted")}><Icon size={16} /></button>
  );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-acc-ink">{week ? `Week ${week}` : "This week"}</div>
          <h1 className="h-display text-4xl leading-none">My leagues</h1>
          <p className="mt-1 text-xs text-muted">
            {games.length ? <>Favoured in <b className="text-fg">{favoured} of {games.length}</b> · </> : null}Hold and drag to reorder
          </p>
        </div>
        <div role="group" aria-label="Home view" className="flex shrink-0 rounded-full border border-line bg-panel p-0.5">
          {viewBtn("cards", Rows3, "Full cards")}{viewBtn("strips", LayoutList, "Compact strips")}
        </div>
      </div>
      {ready.length > 0 && <HomeCheck ctxs={ready} />}
      <Reorder key={view} className={cx("flex flex-col", view === "cards" ? "gap-4" : "gap-2")} onReorder={(k) => saveOrder(k)}
        items={leagues.map((l, i) => ({ key: l.league_id, node: view === "cards" ? <LeagueWidget league={l} slot={slots[l.league_id]} index={i} /> : <LeagueStrip league={l} slot={slots[l.league_id]} index={i} /> }))} />
    </div>
  );
}

function LeagueWidget({ league, slot, index }: { league: League; slot: Slot | undefined; index: number }) {
  const { selectLeague } = useApp();
  const router = useRouter();
  const colour = colourOf(league.league_id);
  const avatar = league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null;
  const ctx = slot?.ctx ?? null;
  const me = ctx?.teams.find((t) => t.rosterId === ctx.myRosterId);
  const href = `/matchup/?league=${league.league_id}`;

  const [enter] = useState(() => firstTime(`home:${league.league_id}`));
  const go = (to: string) => { selectLeague(league.league_id); router.push(to); };
  const shell = (body: React.ReactNode, sub: string, right?: React.ReactNode, foot?: React.ReactNode) => (
    <div className={cx(enter && "fhq-rise", "overflow-hidden rounded-3xl border border-line bg-panel")} style={{ animationDelay: `${index * 80}ms` }}>
      <div role="link" tabIndex={0} aria-label={`Open ${league.name} matchup`} onClick={() => go(href)} onKeyDown={(e) => e.key === "Enter" && go(href)}
        className="cursor-pointer transition-transform active:scale-[0.99]" style={{ backgroundImage: `linear-gradient(160deg, ${colour}66 0%, ${colour}1f 45%, transparent 80%)` }}>
        <div className="flex items-center gap-3 px-4 pb-1 pt-3.5">
          <Logo src={avatar} name={league.name} size={36} square />
          <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-bold">{league.name}</div><div className="truncate text-[11px] text-muted">{sub}</div></div>
          {right}
        </div>
        {body}
      </div>
      {foot}
    </div>
  );

  const baseSub = `${league.total_rosters} teams · ${formatLabel(league)}`;
  if (!slot) return shell(<WidgetSkeleton />, baseSub);
  if (!ctx) return shell(<p className="px-4 pb-4 pt-2 text-sm text-muted">Couldn&apos;t load this league: {slot.error}</p>, baseSub);
  if (!me) return shell(<p className="px-4 pb-4 pt-2 text-sm text-muted">You don&apos;t own a team here.</p>, baseSub);

  const week = Math.min(ctx.currentWeek, ctx.lastWeek);
  const g = gameView(ctx, me.rosterId, week);
  const started = !ctx.seasonOver && ctx.matchupsThisWeek.some((m) => m.points > 0);
  const myScore = started ? g.a.actual : g.a.projected;
  const oppScore = g.b ? (started ? g.b.actual : g.b.projected) : null;
  const win = g.winProbA;
  const winTone = win === null ? "text-muted" : win >= 60 ? "text-pos" : win <= 40 ? "text-neg" : "text-acc-ink";
  const winStroke = win === null ? "var(--muted)" : win >= 60 ? "var(--pos)" : win <= 40 ? "var(--neg)" : "var(--acc)";
  const verdict = win === null ? "" : win >= 60 ? "Favoured" : win <= 40 ? "Underdog" : "Coin flip";
  const power = powerRankings(ctx).find((p) => p.rosterId === me.rosterId);
  const po = ctx.sim.playoffOdds[me.rosterId];
  const seats = ctx.league.settings.playoff_teams ?? 0;
  const seedTone = me.rank <= 2 ? "text-pos" : seats && me.rank > seats ? "text-neg" : "text-fg";
  const record = `${me.wins}–${me.losses}${me.ties ? `–${me.ties}` : ""}`;
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(1));
  const delay = `${index * 80 + 150}ms`;

  const right = (
    <div className="text-right">
      <div className="h-display text-[26px] leading-none"><Roll text={record} id={`h:${league.league_id}:rec`} /></div>
      <span className={cx("rounded-full bg-panel/70 px-2 py-0.5 text-[10px] font-extrabold", seedTone)}>{ord(me.rank)}{seats && me.rank > seats ? " · out" : ""}</span>
    </div>
  );

  const matchup = ctx.seasonOver ? (
    <p className="px-4 pb-3 pt-2 text-sm text-muted">Season complete · finished {ord(me.rank)}.</p>
  ) : !g.b ? (
    <p className="px-4 pb-3 pt-2 text-sm text-muted">{week >= ctx.playoffStart ? "Bye or eliminated this week." : "No opponent this week."}</p>
  ) : (
    <div className="grid grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] items-end px-4 pb-3.5 pt-2.5">
      <div className="min-w-0">
        <Logo src={g.a.avatar} name={g.a.name} size={34} />
        <div className="num h-display mt-1.5 text-[34px] leading-none"><Roll text={fmt(myScore)} id={`h:${league.league_id}:me`} /></div>
        <div className="truncate text-[10px] text-muted">{g.a.name}</div>
      </div>
      <div className="relative h-[84px]">
        <svg width="120" height="66" viewBox="0 0 120 66" className="absolute left-0 top-0" role="img" aria-label={win === null ? "Win chance unavailable" : `Win chance ${Math.round(win)} percent`}>
          <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={9} strokeLinecap="round" />
          {win !== null && <Gauge win={win} stroke={winStroke} delay={enter ? delay : "0ms"} id={`h:${league.league_id}:g`} />}
        </svg>
        <div className="absolute inset-x-0 top-[30px] text-center">
          <div className={cx("num h-display text-[36px] leading-none", winTone)}>{win === null ? "—" : <Roll text={`${Math.round(win)}%`} ms={900} id={`h:${league.league_id}:win`} />}</div>
          <div className={cx("text-[10px] font-extrabold uppercase tracking-[0.08em]", winTone)}>{started ? `Live · ${verdict}` : verdict}</div>
        </div>
      </div>
      <div className="min-w-0 text-right">
        <span className="inline-flex"><Logo src={g.b.avatar} name={g.b.name} size={34} /></span>
        <div className="num h-display mt-1.5 text-[34px] leading-none text-muted"><Roll text={fmt(oppScore)} id={`h:${league.league_id}:op`} /></div>
        <div className="truncate text-[10px] text-muted">{g.b.name}</div>
      </div>
    </div>
  );

  // Your weekly scoring (finished weeks) with the league average per week, for the trend line.
  const done = Array.from({ length: ctx.seasonOver ? ctx.lastWeek : Math.max(0, ctx.currentWeek - 1) }, (_, i) => i + 1)
    .map((w) => { const ms = ctx.matchupsByWeek[w - 1] ?? []; const mine = ms.find((m) => m.roster_id === me.rosterId); return mine && mine.points > 0 ? { pts: mine.points, avg: ms.reduce((a, m) => a + m.points, 0) / Math.max(1, ms.length) } : null; })
    .filter(Boolean) as { pts: number; avg: number }[];
  const recent = done.slice(-7);
  // Fixed scale per league: from the lowest to the highest weekly score any team has posted this season, so the line
  // shows where your weeks sit among everyone's, not just against your own best and worst.
  const allScores = ctx.matchupsByWeek.slice(0, done.length).flat().map((m) => m.points).filter((v) => v > 0);
  const scoreLo = allScores.length ? Math.min(...allScores) : 0, scoreHi = allScores.length ? Math.max(...allScores) : 1;
  const seasonAvg = done.reduce((a, x) => a + x.pts, 0) / Math.max(1, done.length);
  const last3 = done.slice(-3).reduce((a, x) => a + x.pts, 0) / Math.max(1, Math.min(3, done.length));
  const form = done.length >= 4 ? (last3 / seasonAvg - 1) * 100 : null;
  // PF / PA with where they rank in the league (1st = most).
  const pfRank = [...ctx.teams].sort((a, b) => b.pointsFor - a.pointsFor).findIndex((t) => t.rosterId === me.rosterId) + 1;
  const paRank = [...ctx.teams].sort((a, b) => b.pointsAgainst - a.pointsAgainst).findIndex((t) => t.rosterId === me.rosterId) + 1;
  const q = `?league=${league.league_id}`;
  const btn = (to: string, label: string, children: React.ReactNode, wide = false) => (
    <Link href={to} onClick={(e) => { e.stopPropagation(); selectLeague(league.league_id); }} aria-label={label}
      className={cx("flex flex-col items-center justify-center rounded-xl bg-panel2 px-2 py-2 text-center transition-colors active:bg-line hover:bg-line/60", wide && "col-span-2")}>{children}</Link>
  );
  const foot = (
    <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
      {btn(`/stats/${q}`, `Stats: points for ${me.pointsFor.toFixed(0)}, ${ord(pfRank)}; against ${me.pointsAgainst.toFixed(0)}, ${ord(paRank)}`, (
        <div className="flex w-full justify-around gap-2">
          <span><span className="num block text-sm font-bold"><Roll text={me.pointsFor.toFixed(0)} id={`h:${league.league_id}:PF`} /></span><span className="text-[10px] text-muted">PF · {ord(pfRank)}</span></span>
          <span className="w-px self-stretch bg-line" aria-hidden />
          <span><span className="num block text-sm font-bold"><Roll text={me.pointsAgainst.toFixed(0)} id={`h:${league.league_id}:PA`} /></span><span className="text-[10px] text-muted">PA · {ord(paRank)}</span></span>
        </div>
      ), true)}
      {btn(`/matchup/${q}&view=overview`, `Playoff odds ${po === undefined ? "unknown" : `${po.toFixed(0)}%`}: open league overview`, (
        <><span className={cx("num text-sm font-bold", po === undefined ? "" : po >= 75 ? "text-pos" : po <= 35 ? "text-neg" : "")}>{po === undefined ? "—" : <Roll text={`${po.toFixed(0)}%`} id={`h:${league.league_id}:Playoffs`} />}</span><span className="text-[10px] text-muted">Playoffs</span></>
      ))}
      {btn(`/league/${q}`, `Power rank ${power ? power.rank : "unknown"}: open league analyzer`, (
        <><span className="num text-sm font-bold">{power ? <Roll text={`#${power.rank}`} id={`h:${league.league_id}:Power`} /> : "—"}</span><span className="text-[10px] text-muted">Power</span></>
      ))}
    </div>
  );
  return (
    <>
      {shell(
        <>
          {matchup}
          {recent.length >= 3 && (
            <div className="flex items-center gap-3 px-4 pb-3">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">Last {recent.length} wks <span className="normal-case tracking-normal">· dashed = league avg</span></div>
                <Sparkline values={recent.map((x) => x.pts)} min={scoreLo} max={scoreHi} refLine={recent.reduce((a, x) => a + x.avg, 0) / recent.length} width={220} height={30} label={`Your last ${recent.length} weekly scores: ${recent.map((x) => x.pts.toFixed(1)).join(", ")}. Scale runs from the league's lowest (${scoreLo.toFixed(0)}) to highest (${scoreHi.toFixed(0)}) weekly score this season; dashed line is the league average.`} />
              </div>
              {form !== null && (
                <div className="shrink-0 text-right">
                  <div className={cx("num h-display text-2xl leading-none", form >= 0 ? "text-pos" : "text-neg")}>{form >= 0 ? "▲" : "▼"} <Roll text={`${Math.abs(form).toFixed(0)}%`} id={`h:${league.league_id}:form`} /></div>
                  <div className="text-[9px] text-muted">last 3 vs season</div>
                </div>
              )}
            </div>
          )}
        </>,
        `${ctx.teamsCount} teams · ${ctx.scoring} · ${formatLabel(league)}`,
        right,
        foot,
      )}
    </>
  );
}

/** The win-chance arc sweeps from empty to its value the first time the widget is on screen. */
function Gauge({ win, stroke, delay, id }: { win: number; stroke: string; delay: string; id: string }) {
  const [ref, v] = useGrow<SVGPathElement>(Math.max(1, win), id);
  return (
    <path ref={ref} d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke={stroke} strokeWidth={9} strokeLinecap="round" pathLength={100}
      strokeDasharray={`${v} 100`} style={{ transition: `stroke-dasharray 1000ms ${EASE} ${delay}` }} />
  );
}

/** Loading placeholder shaped like the widget: two teams and scores, the empty gauge, four stat boxes. */
function WidgetSkeleton() {
  return (
    <div className="sk-late" aria-hidden>
      <div className="grid grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] items-end px-4 pb-3.5 pt-2.5">
        <div><div className="sk h-[34px] w-[34px] rounded-full" /><div className="sk mt-2 h-8 w-24" /></div>
        <svg width="120" height="84" viewBox="0 0 120 84"><path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={9} strokeLinecap="round" /></svg>
        <div className="flex flex-col items-end"><div className="sk h-[34px] w-[34px] rounded-full" /><div className="sk mt-2 h-8 w-24" /></div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">{[0, 1, 2, 3].map((i) => <div key={i} className="sk h-11 rounded-xl" />)}</div>
    </div>
  );
}

/** Compact view: one slim strip per league (logo, name, both scores, win chance). Tap to open the matchup. */
function LeagueStrip({ league, slot, index }: { league: League; slot: Slot | undefined; index: number }) {
  const { selectLeague } = useApp();
  const router = useRouter();
  const [enter] = useState(() => firstTime(`strip:${league.league_id}`));
  const colour = colourOf(league.league_id);
  const avatar = league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null;
  const ctx = slot?.ctx ?? null;
  const me = ctx?.teams.find((t) => t.rosterId === ctx.myRosterId);
  const go = () => { selectLeague(league.league_id); router.push(`/matchup/?league=${league.league_id}`); };
  let mine: string | null = null, theirs: string | null = null, opp = "", win: number | null = null, live = false;
  if (ctx && me && !ctx.seasonOver) {
    const g = gameView(ctx, me.rosterId, Math.min(ctx.currentWeek, ctx.lastWeek));
    live = ctx.matchupsThisWeek.some((m) => m.points > 0);
    const a = live ? g.a.actual : g.a.projected, b = g.b ? (live ? g.b.actual : g.b.projected) : null;
    mine = a != null ? a.toFixed(1) : null; theirs = b != null ? b.toFixed(1) : null; opp = g.b?.name ?? ""; win = g.winProbA;
  }
  const tone = win === null ? "bg-panel2 text-muted" : win >= 60 ? "bg-pos/15 text-pos" : win <= 40 ? "bg-neg/15 text-neg" : "bg-acc/15 text-acc-ink";
  return (
    <div role="link" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()} aria-label={`Open ${league.name} matchup`}
      className={cx(enter && "fhq-rise", "relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-line bg-panel py-2.5 pl-4 pr-3 transition-transform active:scale-[0.99]")}
      style={{ animationDelay: `${index * 50}ms` }}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: colour }} aria-hidden />
      <Logo src={avatar} name={league.name} size={30} square />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{league.name}</div>
        <div className="truncate text-[11px] text-muted">{!slot ? "Loading…" : !ctx ? "Couldn't load" : !me ? "No team" : ctx.seasonOver ? "Season complete" : opp ? `${me.wins}–${me.losses}${me.ties ? `–${me.ties}` : ""} · vs ${opp}` : "No game this week"}</div>
      </div>
      {mine !== null && theirs !== null && (
        <div className="num shrink-0 text-right leading-tight">
          <div className="text-[15px] font-bold"><Roll text={mine} id={`s:${league.league_id}:me`} /></div>
          <div className="text-[11px] text-muted"><Roll text={theirs} id={`s:${league.league_id}:op`} /></div>
        </div>
      )}
      <span className={cx("num w-14 shrink-0 rounded-full py-1 text-center text-xs font-extrabold", tone)}>
        {win === null ? "—" : <>{live && <span className="mr-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current align-middle" />}<Roll text={`${Math.round(win)}%`} id={`s:${league.league_id}:win`} /></>}
      </span>
    </div>
  );
}
