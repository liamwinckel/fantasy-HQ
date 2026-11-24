"use client";

/**
 * Home: every league as its own widget, stacked. Each shows this week's matchup (both teams, projected or live
 * scores, win chance) plus standing, PF, PA, playoff odds and power rank. Tapping a widget opens that league's matchup.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp, Loading } from "@/components/AppData";
import { Onboarding } from "@/components/Onboarding";
import { Logo, Notice, cx } from "@/components/ui";
import { getLeagueContext, type LeagueContext } from "@/lib/services/league";
import { formatLabel } from "@/lib/services/portfolio";
import { gameView } from "@/lib/services/views";
import { powerRankings } from "@/lib/engine/power";
import { ord } from "@/lib/engine/classify";
import { effectiveMode } from "@/lib/settings";
import type { League } from "@/lib/sleeper/types";

const PALETTE = ["#b7791f", "#2f855a", "#3557c4", "#7c3aed", "#c2410c", "#0e7490", "#be185d", "#4d7c0f"];
const colourOf = (id: string) => PALETTE[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];

type Slot = { ctx: LeagueContext | null; error: string | null };

export default function Home() {
  const app = useApp();
  const { setup } = app;
  const [slots, setSlots] = useState<Record<string, Slot>>({});

  useEffect(() => {
    if (!setup?.settings.userId) return;
    let live = true;
    setSlots({});
    for (const l of setup.leagues) {
      getLeagueContext(l.league_id, { userId: setup.settings.userId, mode: effectiveMode(setup.settings, l.league_id, l.settings.type) })
        .then((ctx) => live && setSlots((s) => ({ ...s, [l.league_id]: { ctx, error: null } })))
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-acc-ink">{week ? `Week ${week}` : "This week"}</div>
        <h1 className="h-display text-4xl leading-none">My leagues</h1>
        <p className="mt-1 text-xs text-muted">
          {games.length ? <>Favoured in <b className="text-fg">{favoured} of {games.length}</b> · </> : null}Tap a league to open its matchup
        </p>
      </div>
      {setup.leagues.map((l) => <LeagueWidget key={l.league_id} league={l} slot={slots[l.league_id]} />)}
    </div>
  );
}

function LeagueWidget({ league, slot }: { league: League; slot: Slot | undefined }) {
  const { selectLeague } = useApp();
  const colour = colourOf(league.league_id);
  const avatar = league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null;
  const ctx = slot?.ctx ?? null;
  const me = ctx?.teams.find((t) => t.rosterId === ctx.myRosterId);
  const href = `/matchup/?league=${league.league_id}`;

  const shell = (body: React.ReactNode, sub: string, right?: React.ReactNode) => (
    <Link href={href} onClick={() => selectLeague(league.league_id)} aria-label={`Open ${league.name}`}
      className="block overflow-hidden rounded-3xl border border-line bg-panel transition-transform active:scale-[0.99]">
      <div style={{ backgroundImage: `linear-gradient(160deg, ${colour}66 0%, ${colour}1f 45%, transparent 80%)` }}>
        <div className="flex items-center gap-3 px-4 pb-1 pt-3.5">
          <Logo src={avatar} name={league.name} size={36} square />
          <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-bold">{league.name}</div><div className="truncate text-[11px] text-muted">{sub}</div></div>
          {right}
        </div>
        {body}
      </div>
    </Link>
  );

  const baseSub = `${league.total_rosters} teams · ${formatLabel(league)}`;
  if (!slot) return shell(<div className="mx-4 mb-4 mt-3 h-24 animate-pulse rounded-2xl bg-panel2" />, baseSub);
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

  const right = (
    <div className="text-right">
      <div className="h-display text-[26px] leading-none">{record}</div>
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
        <div className="num h-display mt-1.5 text-[34px] leading-none">{fmt(myScore)}</div>
        <div className="truncate text-[10px] text-muted">{g.a.name}</div>
      </div>
      <div className="relative h-[84px]">
        <svg width="120" height="66" viewBox="0 0 120 66" className="absolute left-0 top-0" role="img" aria-label={win === null ? "Win chance unavailable" : `Win chance ${Math.round(win)} percent`}>
          <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={9} strokeLinecap="round" />
          {win !== null && <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke={winStroke} strokeWidth={9} strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(1, win)} 100`} />}
        </svg>
        <div className="absolute inset-x-0 top-[30px] text-center">
          <div className={cx("num h-display text-[36px] leading-none", winTone)}>{win === null ? "—" : `${Math.round(win)}%`}</div>
          <div className={cx("text-[10px] font-extrabold uppercase tracking-[0.08em]", winTone)}>{started ? `Live · ${verdict}` : verdict}</div>
        </div>
      </div>
      <div className="min-w-0 text-right">
        <span className="inline-flex"><Logo src={g.b.avatar} name={g.b.name} size={34} /></span>
        <div className="num h-display mt-1.5 text-[34px] leading-none text-muted">{fmt(oppScore)}</div>
        <div className="truncate text-[10px] text-muted">{g.b.name}</div>
      </div>
    </div>
  );

  const cell = (label: string, value: string, tone = "") => (
    <div className="rounded-xl bg-panel2 py-2 text-center"><div className={cx("num text-sm font-bold", tone)}>{value}</div><div className="text-[10px] text-muted">{label}</div></div>
  );
  return (
    <>
      {shell(
        <>
          {matchup}
          <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
            {cell("PF", me.pointsFor.toFixed(0))}
            {cell("PA", me.pointsAgainst.toFixed(0))}
            {cell("Playoffs", po === undefined ? "—" : `${po.toFixed(0)}%`, po === undefined ? "" : po >= 75 ? "text-pos" : po <= 35 ? "text-neg" : "")}
            {cell("Power", power ? `#${power.rank}` : "—")}
          </div>
        </>,
        `${ctx.teamsCount} teams · ${ctx.scoring} · ${formatLabel(league)}`,
        right,
      )}
    </>
  );
}
