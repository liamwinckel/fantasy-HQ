"use client";

/** Mock draft simulator: your league's format, rounds, roster spots, order (and keepers / traded picks). */
import { useEffect, useMemo, useRef, useState } from "react";
import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { Card, Notice, PageHeader, cx } from "@/components/ui";
import { PlayerPhoto } from "@/components/client";
import { Search } from "lucide-react";
import { consensus } from "@/lib/nflverse";
import { loadKeeperPlan } from "@/lib/services/keeperData";
import { available, botPick, buildMock, clockPick, defaultType, gradeDraft, mockModes, MODE_LABEL, nextPick, rosterOf, suggestions, type DraftType, type MockMode, type MockPick, type MockState } from "@/lib/services/mockDraft";
import { Sheet } from "@/components/Sheet";
import { usePlayerCard } from "@/components/PlayerCard";
import { ChevronDown, Settings2 } from "lucide-react";
import { POS_TINT } from "../keepers/KeeperBoard";

export default function MockDraftPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function Body({ setup, league, ctx }: LeagueData) {
  const modes = mockModes(ctx);
  const [mode, setMode] = useState<MockMode>(modes[0]);
  const [slot, setSlot] = useState(1);
  const [type, setType] = useState<DraftType | null>(null);
  const [rounds, setRounds] = useState<number | null>(null);
  const [speed, setSpeed] = useState<"fast" | "normal" | "slow">("normal");
  const [state, setState] = useState<MockState | null>(null);
  const [tick, setTick] = useState(0);
  const cons = useAsync(() => consensus(), []);
  const keeper = useAsync(() => (ctx.format === "keeper" ? loadKeeperPlan(setup.settings, league, ctx) : Promise.resolve(null)), [setup, league, ctx]);
  const rand = useRef(rng(Date.now() % 100000));
  const ready = mode === "rookie" ? !!cons.data : mode === "keeper" ? !!keeper.data : true;

  const start = () => {
    rand.current = rng(Date.now() % 100000);
    setState(buildMock(ctx, mode, { slot, board: keeper.data?.board, rookies: cons.data?.data.rookies, type: type ?? defaultType(mode), rounds: rounds ?? undefined }));
  };
  // Computer teams pick until it's your turn.
  const pk = state ? clockPick(state) : null;
  useEffect(() => {
    if (!state || !pk || pk.owner === state.me) return;
    const t = setTimeout(() => { const id = botPick(state, rand.current); if (id) { pk.playerId = id; setTick((x) => x + 1); } }, speed === "fast" ? 60 : speed === "slow" ? 900 : 280);
    return () => clearTimeout(t);
  }, [state, pk, tick, speed]);
  const draft = (id: string) => { if (id !== "__refresh" && state && pk && pk.owner === state.me) pk.playerId = id; setTick((x) => x + 1); };
  const autoMine = () => { if (!state) return; const s = suggestions(state, 1)[0]; if (s) draft(s.p.id); };

  const defRounds = mode === "rookie" ? Math.max(1, ...ctx.picks.filter((p) => p.season === [...new Set(ctx.picks.map((x) => x.season))].sort()[0]).map((p) => p.round)) : mode === "startup" ? ctx.league.roster_positions.length : ctx.league.settings.draft_rounds || ctx.league.roster_positions.length;
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1.5 text-xs text-muted">Draft type</div>
                <div className="grid grid-cols-2 gap-1.5">{(["snake", "linear"] as DraftType[]).map((t) => <button key={t} type="button" onClick={() => setType(t)} className={cx("rounded-lg border py-2 text-sm font-bold capitalize", (type ?? defaultType(mode)) === t ? "border-acc bg-acc text-on-acc" : "border-line bg-panel2")}>{t}</button>)}</div>
                <p className="mt-1 text-[11px] text-muted">{(type ?? defaultType(mode)) === "snake" ? "Order reverses every round." : "Same order every round (typical for rookie drafts)."}</p>
              </div>
              <div>
                <div className="mb-1.5 text-xs text-muted">Rounds</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setRounds(Math.max(1, (rounds ?? defRounds) - 1))} className="h-10 w-10 rounded-lg border border-line bg-panel2 text-lg font-bold">−</button>
                  <span className="num w-10 text-center text-lg font-bold">{rounds ?? defRounds}</span>
                  <button type="button" onClick={() => setRounds(Math.min(30, (rounds ?? defRounds) + 1))} className="h-10 w-10 rounded-lg border border-line bg-panel2 text-lg font-bold">+</button>
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs text-muted">Computer pick speed</div>
              <div className="grid grid-cols-3 gap-1.5">{(["fast", "normal", "slow"] as const).map((v) => <button key={v} type="button" onClick={() => setSpeed(v)} className={cx("rounded-lg border py-2 text-sm font-bold capitalize", speed === v ? "border-acc bg-acc text-on-acc" : "border-line bg-panel2")}>{v}</button>)}</div>
            </div>
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
  const [listOpen, setListOpen] = useState(true);
  const [cell, setCell] = useState<MockPick | null>(null);
  const [assign, setAssign] = useState<MockPick | null>(null);
  const [, force] = useState(0);
  const { open: openPlayer } = usePlayerCard();
  const mine = pk?.owner === state.me;
  const name = (rid: number) => state.teams.find((t) => t.rosterId === rid)?.name ?? `Team ${rid}`;
  const sugg = useMemo(() => (mine ? suggestions(state, 4) : []), [mine, state, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const avail = useMemo(() => available(state).filter((p) => (pos === "ALL" || p.pos === pos) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 80), [state, pos, q, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = !pk;
  const grades = useMemo(() => (done ? gradeDraft(ctx, state) : null), [done, ctx, state, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const myNext = state.picks.find((p) => p.owner === state.me && !p.playerId);
  const away = myNext && pk ? myNext.overall - pk.overall : 0;
  const positions = [...new Set([...state.pool.values()].map((p) => p.pos))];
  // Picking from the list: fills the slot being edited, otherwise the pick on the clock (yours).
  const choose = (id: string) => {
    if (assign) { assign.playerId = id; assign.manual = assign.overall !== pk?.overall; setAssign(null); force((x) => x + 1); onDraft("__refresh"); return; }
    onDraft(id);
  };
  const cellPlayer = cell?.playerId ? state.pool.get(cell.playerId) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className={cx("flex items-center justify-between gap-3 rounded-xl border px-4 py-3", assign ? "border-acc bg-acc/15" : mine ? "border-acc bg-acc/15" : "border-line bg-panel")}>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted">{MODE_LABEL[state.mode]} · {state.type} · {done ? "complete" : `pick ${pk!.label}`}</div>
          <div className="truncate text-lg font-extrabold">{assign ? `Choose a player for ${assign.label}` : done ? "Draft complete" : mine ? "You're on the clock" : `${name(pk!.owner)} is picking…`}</div>
          {!assign && !done && !mine && myNext && <div className="text-xs text-muted">Your next pick: {myNext.label} ({away} away)</div>}
        </div>
        <div className="flex shrink-0 gap-2">
          {assign ? <button type="button" onClick={() => setAssign(null)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">Cancel</button>
            : mine && <button type="button" onClick={onAuto} className="rounded-lg border border-line bg-panel2 px-3 py-2 text-xs font-bold">Auto-pick</button>}
          <button type="button" onClick={onRestart} aria-label="Draft settings" className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold"><Settings2 size={14} />{done ? "New" : "Settings"}</button>
        </div>
      </div>

      <Board state={state} name={name} onCell={setCell} current={pk?.overall ?? null} />

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

      {/* Players: collapsible, like Sleeper's draft room */}
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <button type="button" onClick={() => setListOpen(!listOpen)} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="text-sm font-bold">Players <span className="font-normal text-muted">· {available(state).length} available</span></span>
          <ChevronDown size={18} className={cx("transition-transform", listOpen && "rotate-180")} />
        </button>
        {listOpen && (
          <>
            {(mine || assign) && sugg.length > 0 && !assign && (
              <div className="grid grid-cols-2 gap-2 border-t border-line p-3 sm:grid-cols-4">
                {sugg.map((s, i) => (
                  <button key={s.p.id} type="button" onClick={() => choose(s.p.id)} className={cx("flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-transform active:scale-95", i === 0 ? "border-acc bg-acc-soft" : "border-line bg-panel2/60")}>
                    {s.p.inApp ? <PlayerPhoto id={s.p.id} name={s.p.name} pos={s.p.pos} size={52} /> : <span className={cx("flex h-13 w-13 items-center justify-center rounded-full text-sm font-bold", POS_FILL[s.p.pos])}>{s.p.pos}</span>}
                    <b className="w-full truncate text-sm">{s.p.name}</b>
                    <span className="text-[10px] text-muted">{s.p.pos} · {s.p.team ?? "—"} · ADP {Math.round(s.p.adp)}</span>
                    <span className="text-[10px] font-semibold text-acc-ink">{s.why}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
              <div className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-line bg-panel2 px-2"><Search size={14} className="text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
              <div className="flex gap-1 overflow-x-auto">{["ALL", ...positions].map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", pos === p ? "border-acc bg-acc text-on-acc" : "border-line text-muted")}>{p}</button>)}</div>
            </div>
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_4.5rem] gap-2 border-y border-line px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted"><span>ADP</span><span>Player</span><span className="text-right">Value</span><span /></div>
            <ul className="divide-y divide-line">
              {avail.map((p) => (
                <li key={p.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_4.5rem] items-center gap-2 px-3 py-2">
                  <span className="num text-xs text-muted">{Math.round(p.adp)}</span>
                  <button type="button" onClick={() => p.inApp && openPlayer(p.id)} className="flex min-w-0 items-center gap-2 text-left">
                    {p.inApp ? <PlayerPhoto id={p.id} name={p.name} pos={p.pos} size={28} /> : <span className="h-7 w-7 shrink-0 rounded-full bg-panel2" />}
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="text-[10px] text-muted"><span className={cx("rounded px-1 font-bold", POS_FILL[p.pos])}>{p.pos}</span> {p.team ?? ""}</span></span>
                  </button>
                  <span className="num text-right text-xs font-bold">{p.value.toFixed(0)}</span>
                  <button type="button" disabled={!mine && !assign} onClick={() => choose(p.id)} className="rounded-lg bg-acc px-2 py-1.5 text-xs font-extrabold text-on-acc disabled:bg-panel2 disabled:text-muted">{assign ? "Place" : "Draft"}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Sheet open={!!cell} onClose={() => setCell(null)} title={cell ? `Pick ${cell.label}` : ""} sub={cell ? `${name(cell.owner)}${cell.owner !== cell.orig ? ` (via ${name(cell.orig)})` : ""}` : ""}>
        {cell && (
          <div className="flex flex-col gap-2 pb-4">
            {cellPlayer ? (
              <>
                <div className="mb-2 flex items-center gap-3 rounded-xl bg-panel2 p-3">
                  {cellPlayer.inApp ? <PlayerPhoto id={cellPlayer.id} name={cellPlayer.name} pos={cellPlayer.pos} size={48} /> : null}
                  <div><b>{cellPlayer.name}</b><div className="text-xs text-muted">{cellPlayer.pos} · {cellPlayer.team ?? "—"}{cell.keeper ? " · keeper" : ""}</div></div>
                </div>
                {cellPlayer.inApp && <button type="button" onClick={() => { openPlayer(cellPlayer.id); setCell(null); }} className="rounded-xl border border-line py-3 text-sm font-bold">View player profile</button>}
                <button type="button" onClick={() => { cell.playerId = null; cell.keeper = false; cell.manual = false; setCell(null); onDraft("__refresh"); }} className="rounded-xl border border-neg/60 py-3 text-sm font-bold text-neg">Remove from this pick</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { const id = botPick(state, Math.random, cell); if (id) { cell.playerId = id; cell.manual = cell.overall !== pk?.overall; } setCell(null); onDraft("__refresh"); }} className="rounded-xl bg-acc py-3 text-sm font-extrabold text-on-acc">CPU auto-pick (by ADP)</button>
                <button type="button" onClick={() => { setAssign(cell); setListOpen(true); setCell(null); }} className="rounded-xl border border-line py-3 text-sm font-bold">Choose a player for this pick</button>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** Solid position colours for draft cells. */
const POS_FILL: Record<string, string> = {
  QB: "bg-[#ff5d8f] text-black", RB: "bg-[#3ddc97] text-black", WR: "bg-[#4cc3ff] text-black", TE: "bg-[#ffb547] text-black",
  K: "bg-[#b38cff] text-black", DEF: "bg-[#9aa4b2] text-black", DL: "bg-[#f97362] text-black", LB: "bg-[#f9a8d4] text-black", DB: "bg-[#93c5fd] text-black",
};

/** Draft board: one column per draft slot with the team name on top, one row per round. Tap any pick. */
function Board({ state, name, onCell, current }: { state: MockState; name: (rid: number) => string; onCell: (p: MockPick) => void; current: number | null }) {
  const cols = state.columns.length;
  const scroller = useRef<HTMLDivElement>(null);
  // Keep the pick on the clock in view.
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-current='1']");
    if (el && scroller.current) {
      const box = scroller.current.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom || r.left < box.left + 40 || r.right > box.right) scroller.current.scrollTo({ top: el.offsetTop - 60, left: el.offsetLeft - 60, behavior: "smooth" });
    }
  }, [current]);
  return (
    <div ref={scroller} className="max-h-[62vh] overflow-auto rounded-xl border border-line bg-panel" style={{ touchAction: "pan-x pan-y", overscrollBehavior: "contain" }} data-no-swipe>
      <table className="border-separate border-spacing-1 p-1 text-[11px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 bg-panel" />
            {state.columns.map((rid, i) => (
              <th key={rid} className="sticky top-0 z-20 bg-panel p-0">
                <div className={cx("w-[5.5rem] rounded-md px-1.5 py-1 text-left", rid === state.me ? "bg-acc text-on-acc" : "bg-panel2 text-fg")}>
                  <div className="num text-[9px] opacity-70">{i + 1}</div><div className="truncate text-[11px] font-bold">{name(rid)}</div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: state.rounds }, (_, i) => i + 1).map((r) => (
            <tr key={r}>
              <td className="sticky left-0 z-10 bg-panel pr-0.5 text-center text-[10px] font-bold text-muted">R{r}<div className="text-[9px] font-normal">{state.type === "snake" ? (r % 2 ? "→" : "←") : "→"}</div></td>
              {Array.from({ length: cols }, (_, c) => state.picks.find((p) => p.round === r && p.col === c)).map((p, c) => {
                if (!p) return <td key={c} />;
                const pl = p.playerId ? state.pool.get(p.playerId) : null;
                const isCur = p.overall === current;
                return (
                  <td key={c} className="p-0 align-top">
                    <button type="button" onClick={() => onCell(p)} data-current={isCur ? "1" : undefined}
                      className={cx("h-14 w-[5.5rem] rounded-md px-1.5 py-1 text-left transition-transform active:scale-95", pl ? POS_FILL[pl.pos] ?? "bg-panel2" : p.owner === state.me ? "bg-acc/25" : "bg-panel2", isCur && "ring-2 ring-acc")}>
                      <div className="flex justify-between text-[9px] font-semibold opacity-75"><span className="num">{p.label}</span>{pl ? <span>{pl.pos}{p.keeper ? " · K" : ""}</span> : isCur ? <span className="text-acc-ink">clock</span> : null}</div>
                      {pl ? <div className="truncate text-[11px] font-bold leading-tight">{pl.name.split(" ").slice(0, -1).join(" ").slice(0, 1)}. {pl.name.split(" ").slice(-1)}</div> : null}
                      <div className="truncate text-[9px] opacity-70">{pl ? pl.team ?? "" : p.owner !== p.orig ? `→ ${name(p.owner)}` : ""}</div>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
