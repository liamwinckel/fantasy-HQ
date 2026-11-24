"use client";

/**
 * Mock draft room, laid out like Sleeper's: the board fills the screen, the player list is a drawer at the bottom
 * you drag up and down. Opens straight onto the board; start (or pause) whenever you like. Settings never reset a
 * draft unless you change its structure and choose to.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { Notice, cx } from "@/components/ui";
import { PlayerPhoto } from "@/components/client";
import { Sheet } from "@/components/Sheet";
import { usePlayerCard } from "@/components/PlayerCard";
import { Pause, Play, Search, Settings2 } from "lucide-react";
import { consensus } from "@/lib/nflverse";
import { loadKeeperPlan } from "@/lib/services/keeperData";
import { available, botPick, buildMock, clockPick, defaultType, gradeDraft, mockModes, MODE_LABEL, suggestions, type DraftType, type MockMode, type MockPick, type MockState } from "@/lib/services/mockDraft";

export default function MockDraftPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

interface Cfg { mode: MockMode; type: DraftType; rounds: number; slot: number; speed: "fast" | "normal" | "slow"; noise: "low" | "normal" | "high"; autoMe: boolean; keepers: boolean }
const STRUCT: (keyof Cfg)[] = ["mode", "type", "rounds", "slot", "keepers"];

/** Solid position colours for draft cells and badges. */
const POS_FILL: Record<string, string> = {
  QB: "bg-[#ff5d8f] text-black", RB: "bg-[#3ddc97] text-black", WR: "bg-[#4cc3ff] text-black", TE: "bg-[#ffb547] text-black",
  K: "bg-[#b38cff] text-black", DEF: "bg-[#9aa4b2] text-black", DL: "bg-[#f97362] text-black", LB: "bg-[#f9a8d4] text-black", DB: "bg-[#93c5fd] text-black",
};

function Body({ setup, league, ctx }: LeagueData) {
  const modes = mockModes(ctx);
  const cons = useAsync(() => consensus(), []);
  const keeper = useAsync(() => (ctx.format === "keeper" ? loadKeeperPlan(setup.settings, league, ctx) : Promise.resolve(null)), [setup, league, ctx]);
  const defRounds = (mode: MockMode) => mode === "rookie" ? Math.max(1, ...ctx.picks.filter((p) => p.season === [...new Set(ctx.picks.map((x) => x.season))].sort()[0]).map((p) => p.round)) : mode === "startup" ? ctx.league.roster_positions.length : ctx.league.settings.draft_rounds || ctx.league.roster_positions.length;
  const [cfg, setCfg] = useState<Cfg>(() => ({ mode: modes[0], type: defaultType(modes[0]), rounds: defRounds(modes[0]), slot: 1, speed: "normal", noise: "normal", autoMe: false, keepers: true }));
  const [state, setState] = useState<MockState | null>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const [settings, setSettings] = useState(false);
  const rand = useRef(rng(Date.now() % 100000));
  const ready = cfg.mode === "rookie" ? !!cons.data : cfg.mode === "keeper" ? !!keeper.data : true;
  const rookieMissing = cfg.mode === "rookie" && cons.data && !cons.data.data.rookies?.length;

  const build = (c: Cfg) => {
    rand.current = rng(Date.now() % 100000);
    setState(buildMock(ctx, c.mode, { slot: c.slot, board: c.mode === "keeper" ? keeper.data?.board.map((b) => (c.keepers ? b : { ...b, keeper: null })) : undefined, rookies: cons.data?.data.rookies, type: c.type, rounds: c.rounds }));
    setStarted(false); setPaused(false); setTick((x) => x + 1);
  };
  // Open straight onto the board.
  useEffect(() => {
    if (!ready || state) return;
    if (rookieMissing && modes.includes("startup")) { const c: Cfg = { ...cfg, mode: "startup", type: "snake", rounds: defRounds("startup") }; setCfg(c); build(c); }
    else if (!rookieMissing) build(cfg);
  }, [ready, rookieMissing]); // eslint-disable-line react-hooks/exhaustive-deps

  const pk = state ? clockPick(state) : null;
  const mine = !!(state && pk && pk.owner === state.me);
  // Computer teams (and you, with auto-pick on) pick while the draft is running.
  useEffect(() => {
    if (!state || !pk || !started || paused) return;
    if (mine && !cfg.autoMe) return;
    const t = setTimeout(() => {
      const id = mine ? suggestions(state, 1)[0]?.p.id : botPick(state, rand.current, pk, cfg.noise === "low" ? 0.5 : cfg.noise === "high" ? 1.8 : 1);
      if (id) { pk.playerId = id; setTick((x) => x + 1); }
    }, cfg.speed === "fast" ? 60 : cfg.speed === "slow" ? 900 : 280);
    return () => clearTimeout(t);
  }, [state, pk, tick, started, paused, cfg.speed, cfg.noise, cfg.autoMe, mine]);

  const refresh = () => setTick((x) => x + 1);
  if (!state) return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 py-10 text-center">
      <h1 className="h-display text-3xl">Mock Draft</h1>
      {rookieMissing ? <Notice tone="warn">Rookie rankings arrive with the next data refresh.</Notice> : <p className="text-sm text-muted">Setting up the board…</p>}
    </div>
  );
  return (
    <>
      <Room ctx={ctx} state={state} pk={pk} tick={tick} started={started} paused={paused}
        onStart={() => { setStarted(true); setPaused(false); }} onPause={() => setPaused((p) => !p)} onSettings={() => setSettings(true)} refresh={refresh} />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} cfg={cfg} modes={modes} teams={ctx.teamsCount} defRounds={defRounds}
        onLive={(c) => setCfg(c)} onApply={(c) => { setCfg(c); build(c); setSettings(false); }}
        onRestart={() => { build(cfg); setSettings(false); }} />
    </>
  );
}

function SettingsSheet({ open, onClose, cfg, modes, teams, defRounds, onLive, onApply, onRestart }: { open: boolean; onClose: () => void; cfg: Cfg; modes: MockMode[]; teams: number; defRounds: (m: MockMode) => number; onLive: (c: Cfg) => void; onApply: (c: Cfg) => void; onRestart: () => void }) {
  const [d, setD] = useState(cfg);
  useEffect(() => { if (open) setD(cfg); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = STRUCT.some((k) => d[k] !== cfg[k]);
  const set = (p: Partial<Cfg>) => { const n = { ...d, ...p }; setD(n); if (!STRUCT.some((k) => k in p)) onLive({ ...cfg, ...Object.fromEntries(Object.entries(p)) }); };
  const Seg = <T extends string>({ v, opts, on }: { v: T; opts: [T, string][]; on: (x: T) => void }) => (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0,1fr))` }}>
      {opts.map(([k, l]) => <button key={k} type="button" onClick={() => on(k)} className={cx("rounded-lg border py-2 text-sm font-bold", v === k ? "border-acc bg-acc text-on-acc" : "border-line bg-panel2")}>{l}</button>)}
    </div>
  );
  const Row = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => <div><div className="mb-1.5 text-xs font-semibold">{label}{sub && <span className="ml-1 font-normal text-muted">{sub}</span>}</div>{children}</div>;
  return (
    <Sheet open={open} onClose={onClose} title="Draft settings" sub="Speed, randomness and auto-pick apply now. Format changes reset the board.">
      <div className="flex flex-col gap-4 pb-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted">While drafting</div>
        <Row label="Computer pick speed"><Seg v={d.speed} opts={[["fast", "Fast"], ["normal", "Normal"], ["slow", "Slow"]]} on={(x) => set({ speed: x })} /></Row>
        <Row label="Computer randomness" sub="how far teams stray from ADP"><Seg v={d.noise} opts={[["low", "By the book"], ["normal", "Realistic"], ["high", "Chaotic"]]} on={(x) => set({ noise: x })} /></Row>
        <Row label="Auto-pick for me" sub="SHS picks your best value"><Seg v={d.autoMe ? "on" : "off"} opts={[["off", "Off"], ["on", "On"]]} on={(x) => set({ autoMe: x === "on" })} /></Row>
        <div className="mt-2 text-[11px] font-bold uppercase tracking-widest text-muted">Format</div>
        {modes.length > 1 && <Row label="Draft"><Seg v={d.mode} opts={modes.map((m) => [m, MODE_LABEL[m]] as [MockMode, string])} on={(x) => setD({ ...d, mode: x, type: defaultType(x), rounds: defRounds(x) })} /></Row>}
        <Row label="Order"><Seg v={d.type} opts={[["snake", "Snake"], ["linear", "Linear"]]} on={(x) => setD({ ...d, type: x })} /></Row>
        <Row label="Rounds">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setD({ ...d, rounds: Math.max(1, d.rounds - 1) })} className="h-10 w-10 rounded-lg border border-line bg-panel2 text-lg font-bold">−</button>
            <span className="num w-10 text-center text-lg font-bold">{d.rounds}</span>
            <button type="button" onClick={() => setD({ ...d, rounds: Math.min(30, d.rounds + 1) })} className="h-10 w-10 rounded-lg border border-line bg-panel2 text-lg font-bold">+</button>
          </div>
        </Row>
        {(d.mode === "redraft" || d.mode === "startup") && <Row label="Your draft slot"><div className="flex flex-wrap gap-1.5">{Array.from({ length: teams }, (_, i) => i + 1).map((n) => <button key={n} type="button" onClick={() => setD({ ...d, slot: n })} className={cx("num h-9 w-9 rounded-lg border text-sm font-bold", d.slot === n ? "border-acc bg-acc text-on-acc" : "border-line bg-panel2")}>{n}</button>)}</div></Row>}
        {d.mode === "keeper" && <Row label="Keepers on the board"><Seg v={d.keepers ? "on" : "off"} opts={[["on", "Placed"], ["off", "None"]]} on={(x) => setD({ ...d, keepers: x === "on" })} /></Row>}
        <button type="button" disabled={!changed} onClick={() => onApply(d)} className="rounded-xl bg-acc py-3 text-sm font-extrabold text-on-acc disabled:opacity-30">{changed ? "Apply format (resets the board)" : "Format unchanged"}</button>
        <button type="button" onClick={onRestart} className="rounded-xl border border-neg/60 py-3 text-sm font-bold text-neg">Restart this draft</button>
      </div>
    </Sheet>
  );
}

function Room({ ctx, state, pk, tick, started, paused, onStart, onPause, onSettings, refresh }: { ctx: LeagueData["ctx"]; state: MockState; pk: MockPick | null; tick: number; started: boolean; paused: boolean; onStart: () => void; onPause: () => void; onSettings: () => void; refresh: () => void }) {
  const [cell, setCell] = useState<MockPick | null>(null);
  const [assign, setAssign] = useState<MockPick | null>(null);
  const { open: openPlayer } = usePlayerCard();
  const mine = pk?.owner === state.me;
  const done = !pk;
  const name = (rid: number) => state.teams.find((t) => t.rosterId === rid)?.name ?? `Team ${rid}`;
  const grades = useMemo(() => (done ? gradeDraft(ctx, state) : null), [done, ctx, state, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const myNext = state.picks.find((p) => p.owner === state.me && !p.playerId);
  const place = (id: string) => {
    const target = assign ?? (mine ? pk : null);
    if (!target) return;
    target.playerId = id;
    target.manual = target.overall !== pk?.overall;
    setAssign(null); refresh();
  };
  const cellPlayer = cell?.playerId ? state.pool.get(cell.playerId) : null;
  const status = assign ? `Choose a player for pick ${assign.label}` : done ? "Draft complete" : !started ? "Ready when you are" : paused ? "Paused" : mine ? "You're on the clock" : `${name(pk!.owner)} is picking…`;

  return (
    <div className="flex flex-col gap-2 pb-[calc(var(--drawer,140px)+12px)]">
      <div className={cx("flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5", assign || (mine && started) ? "border-acc bg-acc/15" : "border-line bg-panel")}>
        <div className="min-w-0">
          <div className="truncate text-[10px] font-bold uppercase tracking-widest text-muted">{MODE_LABEL[state.mode]} · {state.type} · {state.rounds} rds{pk ? ` · pick ${pk.label}` : ""}</div>
          <div className="truncate text-base font-extrabold">{status}</div>
          {started && !done && !mine && myNext && pk && <div className="text-[11px] text-muted">Your next pick: {myNext.label} ({myNext.overall - pk.overall} away)</div>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {assign ? <button type="button" onClick={() => setAssign(null)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">Cancel</button>
            : !done && (!started ? <button type="button" onClick={onStart} className="flex items-center gap-1 rounded-lg bg-acc px-3 py-2 text-xs font-extrabold text-on-acc"><Play size={14} />Start</button>
              : <button type="button" onClick={onPause} aria-label={paused ? "Resume" : "Pause"} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line">{paused ? <Play size={15} /> : <Pause size={15} />}</button>)}
          <button type="button" onClick={onSettings} aria-label="Draft settings" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line"><Settings2 size={16} /></button>
        </div>
      </div>

      <Board state={state} name={name} onCell={setCell} current={pk?.overall ?? null} />

      {grades && (
        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="mb-2 text-sm font-bold">Draft grades <span className="font-normal text-muted">· {state.mode === "redraft" || state.mode === "keeper" ? "best lineup, pts/g" : "total value"}</span></div>
          <ul className="grid gap-1 sm:grid-cols-2">{grades.map((g) => (
            <li key={g.rosterId} className={cx("flex items-center gap-2 rounded-lg px-2 py-1", g.rosterId === state.me && "bg-acc-soft")}>
              <span className={cx("flex h-7 w-7 items-center justify-center rounded-md text-xs font-extrabold", g.grade === "A" ? "bg-acc text-on-acc" : g.grade === "B" ? "bg-fg text-bg" : "bg-panel2 text-muted")}>{g.grade}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</span><span className="num text-xs text-muted">{g.score.toFixed(1)}</span>
            </li>))}</ul>
        </div>
      )}

      <PlayerDrawer state={state} tick={tick} canPick={!!assign || (mine && !done)} assignLabel={assign?.label ?? null} onPick={place} onProfile={(id) => openPlayer(id)} pickNow={mine && started} />

      <Sheet open={!!cell} onClose={() => setCell(null)} title={cell ? `Pick ${cell.label}` : ""} sub={cell ? `${name(cell.owner)}${cell.owner !== cell.orig ? ` (via ${name(cell.orig)})` : ""}` : ""}>
        {cell && (
          <div className="flex flex-col gap-2 pb-4">
            {cellPlayer ? (
              <>
                <div className="mb-2 flex items-center gap-3 rounded-xl bg-panel2 p-3">
                  {cellPlayer.inApp && <PlayerPhoto id={cellPlayer.id} name={cellPlayer.name} pos={cellPlayer.pos} size={48} />}
                  <div><b>{cellPlayer.name}</b><div className="text-xs text-muted">{cellPlayer.pos} · {cellPlayer.team ?? "—"}{cell.keeper ? " · keeper" : ""} · ADP {Math.round(cellPlayer.adp)}</div></div>
                </div>
                {cellPlayer.inApp && <button type="button" onClick={() => { openPlayer(cellPlayer.id); setCell(null); }} className="rounded-xl border border-line py-3 text-sm font-bold">View player profile</button>}
                <button type="button" onClick={() => { cell.playerId = null; cell.keeper = false; cell.manual = false; setCell(null); refresh(); }} className="rounded-xl border border-neg/60 py-3 text-sm font-bold text-neg">Remove from this pick</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { const id = botPick(state, Math.random, cell); if (id) { cell.playerId = id; cell.manual = cell.overall !== pk?.overall; } setCell(null); refresh(); }} className="rounded-xl bg-acc py-3 text-sm font-extrabold text-on-acc">CPU auto-pick (by ADP)</button>
                <button type="button" onClick={() => { setAssign(cell); setCell(null); }} className="rounded-xl border border-line py-3 text-sm font-bold">Choose a player for this pick</button>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

/**
 * Player list drawer: docked at the bottom, drag the handle (or header) to resize between peek, half and tall.
 * Never covers the whole board.
 */
function PlayerDrawer({ state, tick, canPick, assignLabel, onPick, onProfile, pickNow }: { state: MockState; tick: number; canPick: boolean; assignLabel: string | null; onPick: (id: string) => void; onProfile: (id: string) => void; pickNow: boolean }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [h, setH] = useState(150);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const snaps = () => [150, Math.round(window.innerHeight * 0.45), Math.round(window.innerHeight * 0.68)];
  useEffect(() => { document.documentElement.style.setProperty("--drawer", `${h}px`); return () => { document.documentElement.style.removeProperty("--drawer"); }; }, [h]);
  // Your turn or choosing a player: open to half height.
  useEffect(() => { if ((pickNow || assignLabel) && h < 200) setH(snaps()[1]); }, [pickNow, assignLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, h }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (!drag.current) return; const [lo, , hi] = snaps(); setH(Math.max(lo - 40, Math.min(hi, drag.current.h + (drag.current.y - e.clientY)))); };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const moved = Math.abs(e.clientY - drag.current.y);
    const s = snaps();
    if (moved < 6) setH(h < s[1] ? s[1] : s[0]); // tap toggles
    else setH(s.reduce((b, x) => (Math.abs(x - h) < Math.abs(b - h) ? x : b), s[0]));
    drag.current = null;
  };
  const sugg = useMemo(() => (canPick ? suggestions(state, 3) : []), [canPick, state, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => available(state).filter((p) => (pos === "ALL" || p.pos === pos) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 150), [state, pos, q, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const positions = [...new Set([...state.pool.values()].map((p) => p.pos))];
  const total = useMemo(() => available(state).length, [state, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="kb-dock fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),8px)+70px)] z-30 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-b-0 border-line bg-panel shadow-[0_-8px_30px_rgba(0,0,0,0.45)] md:bottom-0" style={{ height: h, transition: drag.current ? "none" : "height 220ms cubic-bezier(.2,.8,.2,1)" }}>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-2">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between text-sm"><b>{assignLabel ? `Pick ${assignLabel}: choose a player` : pickNow ? "Your pick" : "Players"}</b><span className="text-xs text-muted">{total} available · by ADP</span></div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-panel2 px-2"><Search size={14} className="text-muted" /><input value={q} onFocus={() => h < 300 && setH(snaps()[2])} onChange={(e) => setQ(e.target.value)} placeholder="Search players" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
      </div>
      <div className="flex shrink-0 gap-1 overflow-x-auto px-3 pb-2" data-no-swipe>{["ALL", ...positions].map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", pos === p ? "border-acc bg-acc text-on-acc" : "border-line text-muted")}>{p}</button>)}</div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {sugg.length > 0 && !q && (
          <div className="flex gap-2 overflow-x-auto border-y border-line bg-acc-soft/40 px-3 py-2" data-no-swipe>
            {sugg.map((s, i) => (
              <button key={s.p.id} type="button" onClick={() => onPick(s.p.id)} className={cx("flex w-40 shrink-0 items-center gap-2 rounded-xl border p-2 text-left", i === 0 ? "border-acc bg-panel" : "border-line bg-panel")}>
                {s.p.inApp ? <PlayerPhoto id={s.p.id} name={s.p.name} pos={s.p.pos} size={36} /> : <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", POS_FILL[s.p.pos])}>{s.p.pos}</span>}
                <span className="min-w-0"><b className="block truncate text-xs">{s.p.name}</b><span className="block truncate text-[10px] text-acc-ink">{i === 0 ? "SHS pick · " : ""}{s.why}</span></span>
              </button>
            ))}
          </div>
        )}
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem_4rem] items-center gap-2 px-3 py-2">
              <span className="num text-xs text-muted">{Math.round(p.adp)}</span>
              <button type="button" onClick={() => p.inApp && onProfile(p.id)} className="flex min-w-0 items-center gap-2 text-left">
                {p.inApp ? <PlayerPhoto id={p.id} name={p.name} pos={p.pos} size={30} /> : <span className="h-[30px] w-[30px] shrink-0 rounded-full bg-panel2" />}
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="text-[10px] text-muted"><span className={cx("rounded px-1 font-bold", POS_FILL[p.pos])}>{p.pos}</span> {p.team ?? ""}</span></span>
              </button>
              <span className="num text-right text-xs"><b>{p.value.toFixed(0)}</b><span className="block text-[9px] text-muted">value</span></span>
              <button type="button" disabled={!canPick} onClick={() => onPick(p.id)} className="rounded-lg bg-acc py-1.5 text-xs font-extrabold text-on-acc disabled:bg-panel2 disabled:text-muted">{assignLabel ? "Place" : "Draft"}</button>
            </li>
          ))}
          {!list.length && <li className="px-3 py-4 text-sm text-muted">No players match.</li>}
        </ul>
      </div>
    </div>
  );
}

/**
 * Board panning: a drag moves the board along one axis only (whichever way you start), with a little momentum,
 * so it never wanders diagonally like a web page.
 */
function useAxisPan(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sx = 0, sy = 0, sl = 0, st = 0, axis: "x" | "y" | null = null, lastT = 0, lastP = 0, v = 0, raf = 0;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelAnimationFrame(raf);
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; sl = el.scrollLeft; st = el.scrollTop; axis = null; v = 0; lastT = performance.now(); lastP = 0;
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!axis) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; }
      e.preventDefault();
      const d = axis === "x" ? dx : dy, now = performance.now();
      v = (d - lastP) / Math.max(1, now - lastT); lastP = d; lastT = now;
      if (axis === "x") el.scrollLeft = sl - dx; else el.scrollTop = st - dy;
    };
    const end = () => {
      if (!axis) return;
      const ax = axis;
      let vel = v * 16;
      const step = () => { if (Math.abs(vel) < 0.5) return; if (ax === "x") el.scrollLeft -= vel; else el.scrollTop -= vel; vel *= 0.94; raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
      axis = null;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end); cancelAnimationFrame(raf); };
  }, [ref]);
}

/** Draft board: one column per draft slot with the team name on top, one row per round. Tap any pick. */
function Board({ state, name, onCell, current }: { state: MockState; name: (rid: number) => string; onCell: (p: MockPick) => void; current: number | null }) {
  const cols = state.columns.length;
  const scroller = useRef<HTMLDivElement>(null);
  useAxisPan(scroller);
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-current='1']");
    if (el && scroller.current) {
      const box = scroller.current.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom || r.left < box.left + 40 || r.right > box.right) scroller.current.scrollTo({ top: el.offsetTop - 60, left: el.offsetLeft - 60, behavior: "smooth" });
    }
  }, [current]);
  return (
    <div ref={scroller} className="overflow-auto rounded-xl border border-line bg-panel" style={{ touchAction: "none", overscrollBehavior: "contain", maxHeight: "calc(100dvh - var(--drawer,150px) - 230px)", minHeight: 220 }} data-no-swipe>
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
              <td className="sticky left-0 z-10 bg-panel pr-0.5 text-center text-[10px] font-bold text-muted">R{r}<div className="text-[9px] font-normal">{state.type === "snake" && r % 2 === 0 ? "←" : "→"}</div></td>
              {Array.from({ length: cols }, (_, c) => state.picks.find((p) => p.round === r && p.col === c)).map((p, c) => {
                if (!p) return <td key={c} />;
                const pl = p.playerId ? state.pool.get(p.playerId) : null;
                const isCur = p.overall === current;
                return (
                  <td key={c} className="p-0 align-top">
                    <button type="button" onClick={() => onCell(p)} data-current={isCur ? "1" : undefined}
                      className={cx("h-14 w-[5.5rem] rounded-md px-1.5 py-1 text-left", pl ? POS_FILL[pl.pos] ?? "bg-panel2" : p.owner === state.me ? "bg-acc/25" : "bg-panel2", isCur && "ring-2 ring-acc")}>
                      <div className="flex justify-between text-[9px] font-semibold opacity-75"><span className="num">{p.label}</span>{pl ? <span>{pl.pos}{p.keeper ? " · K" : ""}</span> : isCur ? <span className="text-acc-ink">clock</span> : null}</div>
                      {pl && <div className="truncate text-[11px] font-bold leading-tight">{pl.name.split(" ")[0].slice(0, 1)}. {pl.name.split(" ").slice(1).join(" ")}</div>}
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
