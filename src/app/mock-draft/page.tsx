"use client";

/** Mock draft simulator: your league's format, rounds, roster spots, order (and keepers / traded picks). */
import { useEffect, useMemo, useRef, useState } from "react";
import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { Card, Notice, PageHeader, cx } from "@/components/ui";
import { PlayerPhoto } from "@/components/client";
import { Search } from "lucide-react";
import { consensus } from "@/lib/nflverse";
import { loadKeeperPlan } from "@/lib/services/keeperData";
import { available, botPick, buildMock, gradeDraft, mockModes, MODE_LABEL, nextPick, rosterOf, suggestions, type MockMode, type MockState } from "@/lib/services/mockDraft";
import { POS_TINT } from "../keepers/KeeperBoard";

export default function MockDraftPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function Body({ setup, league, ctx }: LeagueData) {
  const modes = mockModes(ctx);
  const [mode, setMode] = useState<MockMode>(modes[0]);
  const [slot, setSlot] = useState(1);
  const [state, setState] = useState<MockState | null>(null);
  const [tick, setTick] = useState(0);
  const cons = useAsync(() => consensus(), []);
  const keeper = useAsync(() => (ctx.format === "keeper" ? loadKeeperPlan(setup.settings, league, ctx) : Promise.resolve(null)), [setup, league, ctx]);
  const rand = useRef(rng(Date.now() % 100000));
  const ready = mode === "rookie" ? !!cons.data : mode === "keeper" ? !!keeper.data : true;

  const start = () => {
    rand.current = rng(Date.now() % 100000);
    setState(buildMock(ctx, mode, { slot, board: keeper.data?.board, rookies: cons.data?.data.rookies }));
  };
  // Computer teams pick until it's your turn.
  const pk = state ? nextPick(state) : null;
  useEffect(() => {
    if (!state || !pk || pk.owner === state.me) return;
    const t = setTimeout(() => { const id = botPick(state, rand.current); if (id) { pk.playerId = id; setTick((x) => x + 1); } }, 260);
    return () => clearTimeout(t);
  }, [state, pk, tick]);
  const draft = (id: string) => { if (!state || !pk || pk.owner !== state.me) return; pk.playerId = id; setTick((x) => x + 1); };
  const autoMine = () => { if (!state) return; const s = suggestions(state, 1)[0]; if (s) draft(s.p.id); };

  if (!state) {
    const teams = ctx.teamsCount;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <PageHeader eyebrow={league.name} title="Mock Draft" info={<>Practice your draft in this league&apos;s exact format: its rounds, roster spots and draft order{ctx.format === "keeper" ? ", with every team's keepers already in the picks they cost (yours from your Keeper Planner, others predicted) and traded picks applied" : ""}{ctx.format === "dynasty" ? ". Rookie drafts use next season's rookie picks (who owns each, including trades) and the expert dynasty rookie rankings" : ""}. Other teams draft close to where players usually go (expert ADP), with some randomness, fill their starting lineups and leave kickers and defences late. Your suggestions are ranked by SHS value and what your lineup still needs.</>} />
        <Card title="Set up">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {modes.map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={cx("rounded-xl border p-3 text-left", mode === m ? "border-acc bg-acc/10" : "border-line")}>
                  <b className="block text-sm">{MODE_LABEL[m]}</b>
                  <span className="text-[11px] text-muted">{m === "redraft" ? `${ctx.league.settings.draft_rounds || ctx.league.roster_positions.length} rounds · snake` : m === "keeper" ? "Keepers already placed" : m === "rookie" ? "Next season's rookie picks" : "Every player, dynasty values"}</span>
                </button>
              ))}
            </div>
            {(mode === "redraft" || mode === "startup") && (
              <div>
                <div className="mb-1.5 text-xs text-muted">Your draft slot</div>
                <div className="flex flex-wrap gap-1.5">{Array.from({ length: teams }, (_, i) => i + 1).map((n) => <button key={n} type="button" onClick={() => setSlot(n)} className={cx("num h-9 w-9 rounded-lg border text-sm font-bold", slot === n ? "border-acc bg-acc text-on-acc" : "border-line bg-panel2")}>{n}</button>)}</div>
              </div>
            )}
            {mode === "keeper" && <p className="text-xs text-muted">Uses the order, traded picks and keepers from your Keeper Planner.</p>}
            {mode === "rookie" && cons.data && !(cons.data.data.rookies?.length) && <Notice tone="warn">Rookie rankings arrive with the next data refresh.</Notice>}
            <button type="button" disabled={!ready || (mode === "rookie" && !cons.data?.data.rookies?.length)} onClick={start} className="rounded-xl bg-acc py-3 text-base font-extrabold text-on-acc disabled:opacity-40">{ready ? "Start draft" : "Loading…"}</button>
          </div>
        </Card>
      </div>
    );
  }
  return <Room ctx={ctx} state={state} pk={pk} onDraft={draft} onAuto={autoMine} onRestart={() => setState(null)} tick={tick} />;
}

function Room({ ctx, state, pk, onDraft, onAuto, onRestart, tick }: { ctx: LeagueData["ctx"]; state: MockState; pk: ReturnType<typeof nextPick>; onDraft: (id: string) => void; onAuto: () => void; onRestart: () => void; tick: number }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [view, setView] = useState<"players" | "board" | "team">("players");
  const mine = pk?.owner === state.me;
  const name = (rid: number) => state.teams.find((t) => t.rosterId === rid)?.name ?? `Team ${rid}`;
  const sugg = useMemo(() => (mine ? suggestions(state, 4) : []), [mine, state, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const avail = useMemo(() => available(state).filter((p) => (pos === "ALL" || p.pos === pos) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 80), [state, pos, q, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = !pk;
  const grades = useMemo(() => (done ? gradeDraft(ctx, state) : null), [done, ctx, state, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const myNext = state.picks.find((p) => p.owner === state.me && !p.playerId);
  const away = myNext && pk ? myNext.overall - pk.overall : 0;
  const positions = [...new Set([...state.pool.values()].map((p) => p.pos))];

  return (
    <div className="flex flex-col gap-4">
      <div className={cx("sticky top-0 z-20 -mx-3 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border", mine ? "border-acc bg-acc/15" : "border-line bg-panel/90")}>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted">{MODE_LABEL[state.mode]} · {done ? "complete" : `pick ${pk!.label}`}</div>
          <div className="truncate text-lg font-extrabold">{done ? "Draft complete" : mine ? "You're on the clock" : `${name(pk!.owner)} is picking…`}</div>
          {!done && !mine && myNext && <div className="text-xs text-muted">Your next pick: {myNext.label} ({away} away)</div>}
        </div>
        <div className="flex shrink-0 gap-2">
          {mine && <button type="button" onClick={onAuto} className="rounded-lg border border-line bg-panel2 px-3 py-2 text-xs font-bold">Auto-pick</button>}
          <button type="button" onClick={onRestart} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">{done ? "New draft" : "Restart"}</button>
        </div>
      </div>

      {grades && (
        <Card title="Draft grades" info={<>{state.mode === "redraft" || state.mode === "keeper" ? "Each team's best starting lineup from its picks (and keepers), in projected points per game." : "Total dynasty value of each team's picks."} A = top 15%, B = next 25%, C = next 35%, D = the rest.</>}>
          <ul className="flex flex-col gap-1.5">{grades.map((g) => (
            <li key={g.rosterId} className={cx("flex items-center gap-3 rounded-lg px-2 py-1.5", g.rosterId === state.me && "bg-acc-soft")}>
              <span className={cx("flex h-8 w-8 items-center justify-center rounded-lg text-sm font-extrabold", g.grade === "A" ? "bg-acc text-on-acc" : g.grade === "B" ? "border border-acc-ink text-acc-ink" : "bg-panel2 text-muted")}>{g.grade}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</span>
              <span className="num text-xs text-muted">{g.score.toFixed(1)} {state.mode === "redraft" || state.mode === "keeper" ? "pts/g" : "value"}</span>
            </li>))}</ul>
        </Card>
      )}

      <div className="flex gap-2">{(["players", "board", "team"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cx("flex-1 rounded-lg border py-2 text-xs font-bold", view === v ? "border-acc bg-acc text-on-acc" : "border-line text-muted")}>{v === "players" ? "Players" : v === "board" ? "Board" : "My team"}</button>)}</div>

      {view === "players" && (
        <>
          {mine && sugg.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sugg.map((s, i) => (
                <button key={s.p.id} type="button" onClick={() => onDraft(s.p.id)} className={cx("flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-transform active:scale-95", i === 0 ? "border-acc bg-acc-soft" : "border-line bg-panel")}>
                  {s.p.inApp ? <PlayerPhoto id={s.p.id} name={s.p.name} pos={s.p.pos} size={56} /> : <span className={cx("flex h-14 w-14 items-center justify-center rounded-full border text-sm font-bold", POS_TINT[s.p.pos])}>{s.p.pos}</span>}
                  <b className="w-full truncate text-sm">{s.p.name}</b>
                  <span className="text-[10px] text-muted">{s.p.pos} · {s.p.team ?? "—"} · ADP {Math.round(s.p.adp)}</span>
                  <span className="text-[10px] font-semibold text-acc-ink">{i === 0 ? "Best pick · " : ""}{s.why}</span>
                </button>
              ))}
            </div>
          )}
          <Card pad={false}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <div className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-line bg-panel2 px-2"><Search size={14} className="text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
              <div className="flex gap-1 overflow-x-auto">{["ALL", ...positions].map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", pos === p ? "border-acc bg-acc text-on-acc" : "border-line text-muted")}>{p}</button>)}</div>
            </div>
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_4.5rem] gap-2 border-b border-line px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted"><span>ADP</span><span>Player</span><span className="text-right">Value</span><span /></div>
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {avail.map((p) => (
                <li key={p.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_4.5rem] items-center gap-2 px-3 py-2">
                  <span className="num text-xs text-muted">{Math.round(p.adp)}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    {p.inApp ? <PlayerPhoto id={p.id} name={p.name} pos={p.pos} size={28} /> : <span className="h-7 w-7 shrink-0 rounded-full bg-panel2" />}
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="text-[10px] text-muted"><span className={cx("rounded border px-1", POS_TINT[p.pos])}>{p.pos}</span> {p.team ?? ""}</span></span>
                  </span>
                  <span className="num text-right text-xs font-bold">{p.value.toFixed(0)}</span>
                  <button type="button" disabled={!mine} onClick={() => onDraft(p.id)} className="rounded-lg bg-acc px-2 py-1.5 text-xs font-extrabold text-on-acc disabled:bg-panel2 disabled:text-muted">Draft</button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {view === "board" && <Board state={state} name={name} />}
      {view === "team" && (
        <Card title="Your team">
          <ul className="flex flex-col gap-1.5">
            {state.picks.filter((p) => p.owner === state.me).map((p) => { const pl = p.playerId ? state.pool.get(p.playerId) : null; return (
              <li key={p.overall} className="flex items-center gap-2 text-sm">
                <span className="num w-10 text-xs text-muted">{p.label}</span>
                {pl ? <><span className={cx("rounded border px-1 text-[10px] font-bold", POS_TINT[pl.pos])}>{pl.pos}</span><b className="truncate">{pl.name}</b>{p.keeper && <span className="text-[10px] text-acc-ink">keeper</span>}</> : <span className="text-muted">—</span>}
              </li>); })}
          </ul>
          <p className="mt-2 text-xs text-muted">{rosterOf(state, state.me).length} players · needs: {state.slots.join(", ")}</p>
        </Card>
      )}
    </div>
  );
}

function Board({ state, name }: { state: MockState; name: (rid: number) => string }) {
  const cols = Math.max(...state.picks.map((p) => p.slot));
  return (
    <Card pad={false}>
      <div className="overflow-x-auto overscroll-x-contain" data-no-swipe>
        <table className="border-separate border-spacing-1 p-2 text-[11px]">
          <tbody>
            {Array.from({ length: state.rounds }, (_, i) => i + 1).map((r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 bg-panel pr-1 font-bold text-muted">R{r}</td>
                {state.picks.filter((p) => p.round === r).sort((a, b) => (r % 2 === 0 && state.mode !== "keeper" && state.mode !== "rookie" ? b.slot - a.slot : a.slot - b.slot)).slice(0, cols).map((p) => { const pl = p.playerId ? state.pool.get(p.playerId) : null; return (
                  <td key={p.overall} className="align-top">
                    <div className={cx("h-14 w-24 rounded-md border px-1.5 py-1", pl ? POS_TINT[pl.pos] ?? "border-line bg-panel2" : p.owner === state.me ? "border-acc/60 bg-acc-soft/40" : "border-line bg-panel2/40", p.owner === state.me && pl && "ring-2 ring-acc", p.keeper && "border-dashed")}>
                      <div className="flex justify-between text-[9px] opacity-75"><span className="num">{p.label}</span>{pl && <span>{pl.pos}</span>}</div>
                      <div className="truncate font-semibold">{pl ? pl.name : ""}</div>
                      <div className="truncate text-[9px] opacity-70">{p.keeper ? "keeper · " : ""}{name(p.owner)}</div>
                    </div>
                  </td>); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
