"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, Search } from "lucide-react";
import { PlayerLink } from "@/components/PlayerCard";
import { PlayerImg, Segmented } from "@/components/client";
import { Card, ClassBadge, InjuryChip, Logo, NflLogo, Tag, cx, signed, Info } from "@/components/ui";
import { evaluateTrade, type BalanceSuggestion, type PositionShift, type PowerShift, type TradeResult } from "@/lib/engine/trade";
import { getLeagueContext } from "@/lib/services/league";
import { useApp } from "@/components/AppData";
import { rankings } from "@/lib/services/rankings";
import { shsAi, type ShsAi } from "@/lib/services/shsai";
import { useShsWeights } from "@/components/ShsAiParts";
import { Sheet } from "@/components/Sheet";

type Tier = "early" | "mid" | "late";
/** Trade values on a 0–999 scale (top asset = 999) for finer distinctions. */
const tv = (x: number) => Math.round(x * 9.99).toLocaleString();

export interface Asset {
  id: string; kind: "player" | "pick"; name: string; pos: string; team: string | null; sub: string; value: number; injury: string | null;
  tier?: Tier; tierValues?: Record<Tier, number>; values: Record<View, number>;
}
/** Which values to trade on. Keeper = rest of season plus next season's keep value. */
export type View = "redraft" | "keeper" | "dynasty";
const VIEW_LABEL: Record<View, string> = { redraft: "Redraft", keeper: "Keeper", dynasty: "Dynasty" };
export interface TeamOpt {
  rosterId: number; name: string; manager: string; avatar: string | null; record: string; cls: string | null; conf: number | null;
  overridden: boolean; playoff: number; title: number; assets: Asset[];
}

export function TradeAnalyzer({ leagueId, views, me, teams: rawTeams, initialPartner, initialA, initialB }: {
  leagueId: string; views: View[]; me: number; teams: TeamOpt[]; initialPartner: number; initialA: string[]; initialB: string[];
}) {
  const { ctx: baseCtx, setup } = useApp();
  const [view, setView] = useState<View>(views[0]);
  const mode: "redraft" | "dynasty" = view === "dynasty" ? "dynasty" : "redraft";
  // Same league, valued the chosen way: pure redraft in a keeper league drops next season's keep value.
  const ctx = useMemo(() => {
    if (!baseCtx || view !== "redraft" || baseCtx.format !== "keeper") return baseCtx;
    return { ...baseCtx, values: new Map([...baseCtx.values].map(([id, v]) => [id, { ...v, redraft: v.redraftOnly ?? v.redraft }])) };
  }, [baseCtx, view]);
  const teams = useMemo(() => rawTeams.map((t) => ({ ...t, assets: t.assets.map((a) => ({ ...a, value: a.values[view] })).sort((a, b) => b.value - a.value) })), [rawTeams, view]);
  const [partner, setPartner] = useState(initialPartner);
  const [aSends, setA] = useState<string[]>(initialA);
  const [bSends, setB] = useState<string[]>(initialB);
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [result, setResult] = useState<TradeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = teams.find((t) => t.rosterId === me)!;
  const theirs = teams.find((t) => t.rosterId === partner);
  // SHS AI on the same horizon as the league: dynasty for dynasty, rest of season for redraft/keeper.
  const shsW = useShsWeights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ai = useMemo(() => {
    if (!ctx) return new Map<string, ShsAi>();
    const scope = mode === "dynasty" ? "dynasty" : "ros";
    return shsAi(ctx, rankings(ctx, scope), scope, null);
  }, [ctx, mode, shsW]);

  useEffect(() => {
    if (!aSends.length && !bSends.length) { setResult(null); return; }
    if (!ctx) return;
    let live = true;
    const t = setTimeout(async () => {
      setBusy(true);
      setErr(null);
      try {
        const manualTiers = Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k.slice(2), v]));
        // Pick positions you set by hand re-price the picks, which needs a fresh league model.
        const c = Object.keys(manualTiers).length && setup?.settings.userId ? await getLeagueContext(leagueId, { userId: setup.settings.userId, mode, manualTiers }) : ctx;
        const r = evaluateTrade(c, { teamA: me, teamB: partner, aSends, bSends, mode });
        if (live) setResult(r);
      } catch (e) {
        if (live) setErr((e as Error).message);
      } finally {
        if (live) setBusy(false);
      }
    }, 120);
    return () => { live = false; clearTimeout(t); };
  }, [aSends, bSends, partner, mode, tiers, leagueId, ctx, me, setup]);

  const apply = (s: BalanceSuggestion) => {
    if (s.side === "a") setA(s.action === "add" ? [...aSends, s.assetId] : aSends.filter((x) => x !== s.assetId));
    else setB(s.action === "add" ? [...bSends, s.assetId] : bSends.filter((x) => x !== s.assetId));
  };

  const [step, setStep] = useState<"build" | "analysis">("build");
  const [pickSide, setPickSide] = useState<"a" | "b">("a");
  const valueOf = (a: Asset) => (a.kind === "pick" && mode === "dynasty" && tiers[a.id] && a.tierValues ? a.tierValues[tiers[a.id]] : a.value);
  const sumOf = (team: TeamOpt | undefined, ids: string[]) => ids.reduce((t, id) => { const x = team?.assets.find((z) => z.id === id); return t + (x ? valueOf(x) : 0); }, 0);
  const sendTotal = result ? result.market.aSends : sumOf(mine, aSends);
  // What you get counts after any roster spots it costs you (cuts to make room).
  const getTotal = result ? Math.max(0, result.market.bSends - result.rosterSpots.a.cost) : sumOf(theirs, bSends);
  const ready = aSends.length + bSends.length > 0;
  const partnerName = theirs?.name ?? "Partner";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-1 text-[11px] uppercase tracking-wider text-muted sm:w-auto">
          Values
          <Segmented label="Trade values" options={views.map((v) => ({ value: v, label: VIEW_LABEL[v] }))} value={view} onChange={setView} />
        </div>
        <label className="flex w-full flex-col gap-1 text-[11px] uppercase tracking-wider text-muted sm:w-auto">
          Trade partner
          <select value={partner} onChange={(e) => { setPartner(Number(e.target.value)); setB([]); setStep("build"); }}
            className="w-full min-w-0 rounded-lg border border-line bg-panel px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-fg sm:w-auto sm:min-w-64">
            {teams.filter((t) => t.rosterId !== me).map((t) => <option key={t.rosterId} value={t.rosterId}>{t.name} · {t.record}{t.cls ? ` · ${t.cls}` : ""}</option>)}
          </select>
        </label>
      </div>

      {/* Value bar: both totals and who's winning, pinned while you scroll. */}
      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-line bg-panel/95 px-3 py-2.5 shadow-lg backdrop-blur sm:mx-0 sm:px-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-bold uppercase tracking-wider text-muted">You send</div>
            <div className="num h-display text-2xl leading-none sm:text-3xl">{tv(sendTotal)}</div>
          </div>
          <div className="text-center text-[10px] font-bold uppercase tracking-wider text-muted">{result ? (result.market.aSends !== result.market.aSendsRaw || result.market.bSends !== result.market.bSendsRaw ? "package value" : "value") : "value"}</div>
          <div className="min-w-0 text-right">
            <div className="truncate text-[10px] font-bold uppercase tracking-wider text-muted">You get</div>
            <div className="num h-display text-2xl leading-none text-acc-ink sm:text-3xl">{tv(getTotal)}</div>
          </div>
        </div>
        <MiniSpectrum balance={result?.balance ?? null} partner={partnerName} />
      </div>

      {step === "build" && (
        <>
          <div className="grid min-w-0 grid-cols-2 items-start gap-2 sm:gap-4">
            <DealColumn title="You send" team={mine} selected={aSends} onChange={setA} tiers={tiers} setTiers={setTiers} mode={mode} valueOf={valueOf} active={pickSide === "a"} onPick={() => setPickSide("a")} />
            {theirs && <DealColumn title="You get" team={theirs} selected={bSends} onChange={setB} tiers={tiers} setTiers={setTiers} mode={mode} valueOf={valueOf} active={pickSide === "b"} onPick={() => setPickSide("b")} />}
          </div>
          {theirs && <Picker team={pickSide === "a" ? mine : theirs} tabs={[{ v: "a", label: "Your roster" }, { v: "b", label: `${partnerName}` }]} side={pickSide} setSide={setPickSide}
            selected={pickSide === "a" ? aSends : bSends} onAdd={(id) => (pickSide === "a" ? setA([...aSends, id]) : setB([...bSends, id]))} mode={mode} />}
          <div className="sticky bottom-24 z-20 flex justify-center md:bottom-4">
            <button type="button" disabled={!ready || !result} onClick={() => { setStep("analysis"); document.getElementById("fhq-scroll")?.scrollTo({ top: 0 }); }}
              className="rounded-full bg-acc px-6 py-3 text-sm font-extrabold text-on-acc shadow-lg transition-transform active:scale-95 disabled:opacity-40">
              {!ready ? "Add players to start" : busy || !result ? "Analyzing…" : "Analyze trade →"}
            </button>
          </div>
        </>
      )}

      {err && <div className="rounded-lg border border-neg px-3 py-2 text-sm text-neg">{err}</div>}
      {step === "analysis" && result && (
        <>
          <button type="button" onClick={() => setStep("build")} className="self-start rounded-full border border-line px-4 py-2 text-sm font-semibold">← Edit trade</button>
          <DealSummary mine={mine} theirs={theirs} aSends={aSends} bSends={bSends} valueOf={valueOf} />
          <ValueStack r={result} partner={partnerName} assets={[...aSends.map((id) => mine.assets.find((x) => x.id === id)), ...bSends.map((id) => theirs?.assets.find((x) => x.id === id))].filter((x): x is Asset => !!x)} aSends={aSends} valueOf={valueOf} />
          <AiTake ai={ai} aSends={aSends} bSends={bSends} teams={teams} me={me} partner={partner} partnerName={partnerName} mode={mode} />
          <Result r={result} view={view} partner={partnerName} busy={busy} onApply={(s) => { apply(s); }} me={me} partnerId={partner} />
        </>
      )}
    </div>
  );
}

/** One side of the deal: just the assets in it, compact and the same row height on both sides. */
function DealColumn({ title, team, selected, onChange, tiers, setTiers, mode, valueOf, active, onPick }: {
  title: string; team: TeamOpt; selected: string[]; onChange: (v: string[]) => void; tiers: Record<string, Tier>; setTiers: (t: Record<string, Tier>) => void;
  mode: "redraft" | "dynasty"; valueOf: (a: Asset) => number; active: boolean; onPick: () => void;
}) {
  const byId = new Map(team.assets.map((a) => [a.id, a]));
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-panel p-2 transition-colors sm:p-3", active ? "border-acc/60" : "border-line")}>
      <button type="button" onClick={onPick} className="flex min-w-0 items-center gap-2 px-0.5 text-left">
        <Logo src={team.avatar} name={team.name} size={26} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{title}</div>
          <div className="truncate text-sm font-bold">{team.name}</div>
        </div>
        {team.cls && <span className="hidden sm:block"><ClassBadge cls={team.cls} /></span>}
      </button>
      {selected.map((id) => {
        const a = byId.get(id);
        if (!a) return null;
        return (
          <div key={id} className="fhq-in flex h-12 items-center gap-1.5 rounded-lg bg-panel2 px-2">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1 text-xs font-semibold sm:text-sm">{a.kind === "player" ? <PlayerLink id={a.id.slice(2)} name={a.name} className="truncate" /> : <span className="truncate">{a.name}</span>}<InjuryChip status={a.injury} /></div>
              {a.kind === "pick" && mode === "dynasty" ? (
                <div className="flex gap-0.5" role="group" aria-label="Pick position">
                  {(["early", "mid", "late"] as Tier[]).map((t) => (
                    <button key={t} type="button" onClick={() => setTiers({ ...tiers, [id]: t })}
                      className={cx("rounded px-1.5 text-[10px] font-semibold capitalize", (tiers[id] ?? a.tier) === t ? "bg-acc text-on-acc" : "text-muted")}>{t}</button>
                  ))}
                </div>
              ) : <div className="truncate text-[10px] text-muted">{a.sub}</div>}
            </div>
            <span className="num shrink-0 text-sm font-bold">{tv(valueOf(a))}</span>
            <button type="button" aria-label={`Take ${a.name} out of the trade`} onClick={() => onChange(selected.filter((x) => x !== id))}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-neg active:scale-90"><Minus size={14} /></button>
          </div>
        );
      })}
      <button type="button" onClick={onPick} className={cx("flex h-10 items-center justify-center gap-1 rounded-lg border border-dashed text-xs font-semibold", active ? "border-acc/60 text-acc-ink" : "border-line text-muted")}>
        <Plus size={14} /> Add
      </button>
    </div>
  );
}

/** One roster picker for both sides, so the two columns stay tidy. */
function Picker({ team, tabs, side, setSide, selected, onAdd, mode }: {
  team: TeamOpt; tabs: { v: "a" | "b"; label: string }[]; side: "a" | "b"; setSide: (s: "a" | "b") => void; selected: string[]; onAdd: (id: string) => void; mode: "redraft" | "dynasty";
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const positions = ["ALL", ...new Set(team.assets.filter((a) => mode === "dynasty" || a.kind === "player").map((a) => a.pos))];
  const pool = team.assets.filter((a) => !selected.includes(a.id) && (mode === "dynasty" || a.kind === "player") && (pos === "ALL" || a.pos === pos) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card pad={false}>
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-panel2 p-1">
          {tabs.map((t) => (
            <button key={t.v} type="button" onClick={() => setSide(t.v)} className={cx("truncate rounded-lg px-2 py-1.5 text-xs font-bold", side === t.v ? "bg-acc text-on-acc" : "text-muted")}>{t.label}</button>
          ))}
        </div>
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${team.name} roster`} className="w-full rounded-lg border border-line bg-panel2 py-2 pl-8 pr-2.5 text-sm" />
        </label>
        <div className="flex gap-1 overflow-x-auto">
          {positions.map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", pos === p ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}>{p === "ALL" ? "All" : p}</button>)}
        </div>
        <ul className="flex flex-col gap-0.5">
          {pool.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onAdd(a.id)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-panel2 active:bg-panel2">
                {a.kind === "player" ? <PlayerImg id={a.id.slice(2)} name={a.name} pos={a.pos} size={30} /> : <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-panel2 text-[10px] font-extrabold">R{a.name.split("Round ")[1]}</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1 text-sm font-semibold"><span className="truncate">{a.name}</span><InjuryChip status={a.injury} /></div>
                  <div className="flex items-center gap-1 truncate text-[11px] text-muted"><NflLogo team={a.team} size={12} /><span className="truncate">{a.sub}</span></div>
                </div>
                <span className="num w-10 text-right text-sm font-bold">{tv(a.value)}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-acc text-on-acc"><Plus size={15} /></span>
              </button>
            </li>
          ))}
          {pool.length === 0 && <li className="px-2 py-3 text-xs text-muted">Nobody matches.</li>}
        </ul>
      </div>
    </Card>
  );
}

/** Analysis screen header: the deal in two even lists. */
function DealSummary({ mine, theirs, aSends, bSends, valueOf }: { mine: TeamOpt; theirs?: TeamOpt; aSends: string[]; bSends: string[]; valueOf: (a: Asset) => number }) {
  const col = (team: TeamOpt | undefined, ids: string[], label: string) => (
    <div className="min-w-0">
      <div className="mb-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <ul className="flex flex-col gap-1">
        {ids.map((id) => { const a = team?.assets.find((x) => x.id === id); return a ? (
          <li key={id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span><span className="num text-xs text-muted">{tv(valueOf(a))}</span></li>
        ) : null; })}
        {!ids.length && <li className="text-xs text-muted">Nothing</li>}
      </ul>
    </div>
  );
  return <Card><div className="grid grid-cols-2 gap-4">{col(mine, aSends, "You send")}{col(theirs, bSends, `You get from ${theirs?.name ?? "partner"}`)}</div></Card>;
}

/** Slim who-wins bar for the pinned value bar. */
function MiniSpectrum({ balance, partner }: { balance: number | null; partner: string }) {
  const pos = balance === null ? 50 : 50 - balance / 2;
  const fair = balance !== null && Math.abs(balance) < 8;
  const label = balance === null ? "Add players to both sides" : fair ? "Fair trade" : balance > 0 ? (balance > 40 ? "You win big" : "You win") : balance < -40 ? `${partner} wins big` : `${partner} wins`;
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--pos) 0%, var(--panel2) 40%, var(--panel2) 60%, var(--neg) 100%)" }}>
        <div className="absolute inset-y-0 left-[45%] right-[45%] rounded bg-acc/40" aria-hidden />
        {balance !== null && <div className="absolute -top-1 h-4 w-1.5 -translate-x-1/2 rounded-full border-2 border-bg bg-acc transition-[left] duration-500" style={{ left: `${Math.max(1, Math.min(99, pos))}%` }} />}
      </div>
      <div className={cx("mt-1 truncate text-center text-xs font-bold", balance === null || fair ? "text-muted" : balance > 0 ? "text-pos" : "text-neg")}>{label}</div>
    </div>
  );
}

/**
 * How each side's value adds up: the straight sum, the depth discount ("four quarters don't make a dollar"), the roster
 * spots it costs, and who holds the best player in the deal. The shaded band is the range the weighting moves through.
 */
function ValueStack({ r, partner, assets, aSends, valueOf }: { r: TradeResult; partner: string; assets: Asset[]; aSends: string[]; valueOf: (a: Asset) => number }) {
  const best = assets.reduce<Asset | null>((m, a) => (!m || valueOf(a) > valueOf(m) ? a : m), null);
  const bestSide = best ? (aSends.includes(best.id) ? "send" : "get") : null;
  const rows = [
    { key: "send", label: "You send", raw: r.market.aSendsRaw, pkg: r.market.aSends, spot: r.rosterSpots.b.cost, spotNote: r.rosterSpots.b.extra > 0 ? `${partner} cuts ${r.rosterSpots.b.extra}` : null, fill: "bg-fg" },
    { key: "get", label: "You get", raw: r.market.bSendsRaw, pkg: r.market.bSends, spot: r.rosterSpots.a.cost, spotNote: r.rosterSpots.a.extra > 0 ? `you cut ${r.rosterSpots.a.drops.join(", ")}` : r.rosterSpots.a.extra < 0 ? "frees roster spots" : null, fill: "bg-acc" },
  ];
  const max = Math.max(1, ...rows.map((x) => x.raw));
  return (
    <Card title="How the value adds up" info={<>Every asset&apos;s value is its points above a replacement starter in this league&apos;s scoring. Then: <b>depth discount</b> — several smaller pieces can&apos;t fill one star&apos;s lineup spot (&quot;four quarters ≠ a dollar&quot;); <b>roster spots</b> — taking back more players means cutting someone; <b>best player</b> — managers want a clear premium (~7%) to give up the best player in the deal.</>}>
      <div className="flex flex-col gap-4">
        {rows.map((x) => {
          const eff = Math.max(0, x.pkg - (x.key === "get" ? x.spot : 0));
          return (
            <div key={x.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">{x.label}{bestSide === x.key && <span className="ml-1.5 rounded bg-acc/15 px-1.5 py-0.5 text-[10px] font-bold text-acc-ink">★ best player</span>}</span>
                <span className="num"><b className="text-base">{tv(eff)}</b> <span className="text-xs text-muted">of {tv(x.raw)}</span></span>
              </div>
              <div className="relative h-6 rounded-lg bg-panel2">
                {/* weighted range: from what it counts for to the straight sum */}
                <div className="absolute inset-y-0 rounded-lg border border-dashed border-muted/50" style={{ left: `${(100 * eff) / max}%`, width: `${Math.max(0, (100 * (x.raw - eff)) / max)}%`, background: "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--muted) 18%, transparent) 6px 8px)" }} />
                <div className={cx("absolute inset-y-1 left-1 rounded-md transition-[width] duration-500", x.fill)} style={{ width: `calc(${(100 * eff) / max}% - 4px)` }} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                <span>Straight sum <b className="num text-fg">{tv(x.raw)}</b></span>
                {x.raw - x.pkg > 0.05 && <span>Depth discount <b className="num text-neg">−{tv(x.raw - x.pkg)}</b></span>}
                {x.key === "get" && x.spot !== 0 && <span>Roster spots <b className={cx("num", x.spot > 0 ? "text-neg" : "text-pos")}>{x.spot > 0 ? "−" : "+"}{tv(Math.abs(x.spot))}</b>{x.spotNote ? ` (${x.spotNote})` : ""}</span>}
                {x.key === "send" && x.spotNote && <span>{x.spotNote}</span>}
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-muted">Solid = what each side counts for · striped = the range the weighting takes off.</p>
      </div>
    </Card>
  );
}

/** Who wins. You're on the left (green), your trade partner on the right (red). balance: +100 = you win big. */
function Spectrum({ balance, partner }: { balance: number; partner: string }) {
  const pos = 50 - balance / 2; // you winning pushes the marker toward your (left) side
  const fair = Math.abs(balance) < 8;
  const label = fair ? "Fair trade" : balance > 0 ? (balance > 40 ? "You win big" : "You win") : balance < -40 ? `${partner} wins big` : `${partner} wins`;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className={cx("h-display text-2xl", fair ? "" : balance > 0 ? "text-pos" : "text-neg")}>{label}</span>
        <span className="text-xs text-muted">Who wins the trade</span>
      </div>
      <div className="relative h-4 rounded-full" style={{ background: "linear-gradient(90deg, var(--pos) 0%, var(--panel2) 40%, var(--panel2) 60%, var(--neg) 100%)" }}>
        <div className="absolute inset-y-0 left-[45%] right-[45%] rounded bg-acc/40" aria-hidden />
        <div className="absolute -top-1.5 h-7 w-1.5 -translate-x-1/2 rounded-full border-2 border-bg bg-acc shadow transition-[left] duration-500" style={{ left: `${Math.max(1, Math.min(99, pos))}%` }} aria-label={`Balance ${balance}`} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-semibold"><span className="text-pos">◀ You win</span><span className="text-muted">Fair</span><span className="truncate text-neg">{partner} wins ▶</span></div>
    </div>
  );
}

function RankMove({ before, after }: { before: number; after: number }) {
  const d = before - after; // positive = moved up
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-muted"><Minus size={12} />0</span>;
  return <span className={cx("inline-flex items-center gap-0.5 font-bold", d > 0 ? "text-pos" : "text-neg")}>{d > 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{Math.abs(d)}</span>;
}

function PowerTable({ power, me, partnerId }: { power: PowerShift[]; me: number; partnerId: number }) {
  const sorted = [...power].sort((a, b) => a.after.rank - b.after.rank);
  return (
    <div className="flex flex-col">
      {sorted.map((p) => {
        const involved = p.rosterId === me || p.rosterId === partnerId;
        return (
          <div key={p.rosterId} className={cx("grid grid-cols-[2.2rem_1fr_4.5rem_2.5rem] items-center gap-2 border-t border-line px-4 py-2 text-sm first:border-t-0", involved && "bg-acc-soft")}>
            <span className="num font-bold">#{p.after.rank}</span>
            <div className="min-w-0">
              <div className={cx("truncate", involved ? "font-bold" : "text-muted")}>{p.name}{p.rosterId === me && " (you)"}</div>
              {involved && (
                <div className="relative mt-1 h-1.5 rounded-full bg-panel2">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-muted/60" style={{ width: `${p.before.score}%` }} />
                  <div className={cx("absolute -top-0.5 h-2.5 w-1 rounded", p.after.score >= p.before.score ? "bg-pos" : "bg-neg")} style={{ left: `${p.after.score}%` }} />
                </div>
              )}
            </div>
            <span className="num text-right text-xs text-muted">{p.before.score.toFixed(0)} → <b className="text-fg">{p.after.score.toFixed(0)}</b></span>
            <span className="text-right text-xs"><RankMove before={p.before.rank} after={p.after.rank} /></span>
          </div>
        );
      })}
    </div>
  );
}

function Positions({ title, rows }: { title: string; rows: PositionShift[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {rows.map((r) => {
          const d = r.before.rank - r.after.rank;
          return (
            <div key={r.pos} className={cx("rounded-lg border p-2 text-center", d > 0 ? "border-pos/60" : d < 0 ? "border-neg/60" : "border-line")}>
              <div className="text-[10px] font-bold uppercase text-muted">{r.pos}</div>
              <div className="num text-sm"><span className="text-muted">{r.before.rank || "—"}</span> → <b>{r.after.rank || "—"}</b></div>
              <div className="text-[11px]"><RankMove before={r.before.rank} after={r.after.rank} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Result({ r, view, partner, busy, onApply, me, partnerId }: { r: TradeResult; view: View; partner: string; busy: boolean; onApply: (s: BalanceSuggestion) => void; me: number; partnerId: number }) {
  const meP = r.power.find((p) => p.rosterId === me);
  const themP = r.power.find((p) => p.rosterId === partnerId);
  const [rosOpen, setRosOpen] = useState(false);
  const maxW = Math.max(1, ...r.lineup.aWeeks.flatMap((w) => [w.before, w.after]));
  return (
    <div className={cx("flex flex-col gap-4 transition-opacity", busy && "opacity-60")}>
      <Sheet open={rosOpen} onClose={() => setRosOpen(false)} title="Your lineup, rest of season" sub={`${r.lineup.aRosBefore} → ${r.lineup.aRosAfter} pts/g over ${r.lineup.weeks} week${r.lineup.weeks === 1 ? "" : "s"}`}>
        <div className="flex flex-col gap-3 pb-4 text-sm">
          <p>Points per game from your <b>best possible lineup each remaining week</b>, before and after the trade. It already counts: who you lose and who steps in from your bench (or a flex shuffle when the positions differ), bye weeks, each player&apos;s matchups ahead (tough defences lower his projection), and injuries. It&apos;s calibrated to what your team has actually scored{r.lineup.aActualPpg !== null ? ` (${r.lineup.aActualPpg} pts/g so far)` : ""}.</p>
          <ul className="flex flex-col gap-1.5">
            {r.lineup.aWeeks.map((w) => { const d = Math.round((w.after - w.before) * 10) / 10; return (
              <li key={w.week} className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">
                <span className="text-muted">Wk {w.week}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="h-1.5 rounded-full bg-muted/40" style={{ width: `${(w.before / maxW) * 100}%` }} />
                  <span className={cx("h-1.5 rounded-full", d >= 0 ? "bg-pos" : "bg-neg")} style={{ width: `${(w.after / maxW) * 100}%` }} />
                  {w.byes.length > 0 && <span className="text-[10px] text-muted">Bye: {w.byes.join(", ")}</span>}
                </span>
                <span className={cx("num text-right font-bold", d > 0 ? "text-pos" : d < 0 ? "text-neg" : "text-muted")}>{d > 0 ? "+" : ""}{d}</span>
              </li>); })}
          </ul>
          <p className="text-[11px] text-muted">Grey bar = before, coloured = after. Playoff weeks included.</p>
        </div>
      </Sheet>
      <Card>
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex flex-1 flex-col gap-4">
            <Spectrum balance={r.balance} partner={partner} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Confidence {r.confidence}%</span><span>·</span><span>{VIEW_LABEL[view]} valuation</span><Tag kind="MODEL" />
            </div>
            <ul className="flex flex-col gap-1 text-sm leading-relaxed">{r.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-[400px]">
            <Mini label="Package value: you get" value={`${r.market.netForA >= 0 ? "+" : "−"}${tv(Math.abs(r.market.netForA))}`} sub={`send ${tv(r.market.aSends)} · receive ${tv(r.market.bSends)}`} tone={r.market.netForA >= 0 ? "pos" : "neg"} />
            <Mini label="Your lineup, rest of season" value={r.lineup.weeks ? `${signed(r.lineup.aRosDelta)}/g` : "—"} sub={r.lineup.weeks ? `${r.lineup.aRosBefore} → ${r.lineup.aRosAfter} pts/g · tap` : undefined} tone={r.lineup.aRosDelta >= 0 ? "pos" : "neg"} onClick={r.lineup.weeks ? () => setRosOpen(true) : undefined} />
            <Mini label="Your power rank" value={meP ? `#${meP.before.rank} → #${meP.after.rank}` : "—"} tone={meP && meP.after.rank <= meP.before.rank ? "pos" : "neg"} />
            <Mini label="Your title odds" value={r.odds ? `${r.odds.aTitleBefore.toFixed(0)}% → ${r.odds.aTitleAfter.toFixed(0)}%` : "—"} tone={r.odds && r.odds.aTitleAfter >= r.odds.aTitleBefore ? "pos" : "neg"} />
            <Mini label={`Chance ${partner} accepts`} value={`${Math.round(r.accept * 100)}%`} sub={r.accept >= 0.6 ? "Likely" : r.accept >= 0.35 ? "Coin flip" : "Unlikely as is"} tone={r.accept >= 0.5 ? "pos" : r.accept < 0.3 ? "neg" : null} />
            <Mini label="Your actual scoring" value={r.lineup.aActualPpg !== null ? `${r.lineup.aActualPpg}` : "—"} sub="pts/g so far" tone={null} />
          </div>
        </div>
      </Card>

      {(r.build.a.length > 0 || r.build.b.length > 0) && (
        <Card title="Team build" info={<>Who each team would actually start afterwards, compared spot by spot by healthy points per game. Losing a good starter and having to play a weak backup counts against a trade even when the values look even.</>}>
          <div className="grid grid-cols-2 gap-3 sm:gap-6">
            {[{ label: "You", rows: r.build.a }, { label: partner, rows: r.build.b }].map((side) => (
              <div key={side.label} className="min-w-0">
                <div className="mb-2 truncate text-xs font-semibold uppercase tracking-wider text-muted">{side.label}</div>
                {side.rows.length === 0 && <p className="text-xs text-muted">Same starters.</p>}
                <ul className="flex flex-col gap-1.5">
                  {side.rows.map((b) => (
                    <li key={b.slot} className="rounded-lg bg-panel2 px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-1"><b>{b.slot}</b><span className={cx("num font-bold", b.delta > 0.2 ? "text-pos" : b.delta < -0.2 ? "text-neg" : "text-muted")}>{signed(b.delta)}/g</span></div>
                      <div className="truncate text-muted">{b.before.name} {b.before.ppg}</div>
                      <div className="truncate">→ {b.after.name} <span className="num">{b.after.ppg}</span></div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Make it fair" info={<>Smallest additions (players or picks) that would bring the two sides within a fair range by consolidated value.</>} right={<Tag kind="MODEL" />}>
        {r.suggestions.length === 0 ? (
          <p className="text-sm text-muted">{Math.abs(r.market.netForA) <= Math.max(3, 0.08 * Math.max(r.market.aSends, r.market.bSends)) ? "Values are already within a fair range. No changes needed." : "No single asset closes the gap neatly. Try adding a smaller piece or swapping the main player."}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {r.suggestions.map((s) => (
              <li key={s.action + s.assetId} className="flex items-center gap-3 rounded-lg bg-panel2 p-3">
                <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", s.action === "add" ? "bg-acc text-on-acc" : "border border-line")}>{s.action === "add" ? <Plus size={16} /> : <Minus size={16} />}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <div><b>{s.action === "add" ? "Add" : "Remove"} {s.name}</b> <span className="text-muted">({tv(s.value)})</span></div>
                  <div className="truncate text-xs text-muted">{s.side === "a" ? (s.action === "add" ? "You also send" : "You keep") : s.action === "add" ? `${partner} also sends` : `${partner} keeps`} · gap after: {s.gapAfter >= 0 ? "+" : "−"}{tv(Math.abs(s.gapAfter))}</div>
                </div>
                <button type="button" onClick={() => onApply(s)} className="rounded-md bg-acc px-3 py-1.5 text-xs font-bold text-on-acc">Apply</button>
              </li>
            ))}
          </ul>
        )}
        <Info className="mt-3">Suggestions close the value gap using assets the side getting the better deal can spare (non-starters preferred), or by removing an asset from the side that&apos;s overpaying.</Info>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card title="Power rankings after trade" info={<>Each team&apos;s power score (0–100, best ≈ 100) before → after the trade, and how its rank moves.</>} right={<span className="text-[11px] text-muted">score before → after · rank change</span>} pad={false}>
          <PowerTable power={r.power} me={me} partnerId={partnerId} />
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Positional ranks (1 = best)" info={<>Each team&apos;s league rank at each position before → after the trade, from the projected points of its starters there.</>}>
            <div className="flex flex-col gap-4">
              <Positions title={`You${meP ? ` · power #${meP.before.rank} → #${meP.after.rank}` : ""}`} rows={r.positionsA} />
              <Positions title={`${partner}${themP ? ` · power #${themP.before.rank} → #${themP.after.rank}` : ""}`} rows={r.positionsB} />
            </div>
          </Card>
        </div>
      </div>
          <Card title="Value breakdown" info={<>Every asset in the deal with its trade value (0–100, 100 = the league&apos;s most valuable asset) and where that value comes from.</>} pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-5 py-2.5 font-semibold">Asset · what drives its value</th><th className="px-2 py-2.5 text-right font-semibold">Value</th>
                  {r.classA && <><th className="px-2 py-2.5 text-right font-semibold" title={`Re-weighted for a ${r.classA}`}>To you</th><th className="px-5 py-2.5 text-right font-semibold" title={`Re-weighted for a ${r.classB}`}>To {partner}</th></>}
                </tr></thead>
                <tbody>
                  {r.assets.map((a) => (
                    <tr key={a.id} className="border-t border-line">
                      <td className="px-5 py-2.5">
                        {a.kind === "player" ? <PlayerLink id={a.id.slice(2)} name={a.name} className="font-semibold" /> : <span className="font-semibold">{a.name}</span>} <span className="text-xs text-muted">{a.from === me ? "→ them" : "→ you"} · {a.detail}</span>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {a.drivers.map((d) => <span key={d.label} className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold", d.tone === "pos" ? "bg-pos/15 text-pos" : d.tone === "neg" ? "bg-neg/15 text-neg" : "bg-panel2 text-muted")}>{d.label}: {d.value}</span>)}
                        </div>
                      </td>
                      <td className="num px-2 py-2.5 text-right">{tv(a.market)}</td>
                      {r.classA && <><td className="num px-2 py-2.5 text-right font-semibold text-acc-ink">{tv(a.toA)}</td><td className="num px-5 py-2.5 text-right">{tv(a.toB)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.classA && <Info className="border-t border-line px-5 py-2.5">Dynasty only: &quot;To you / to them&quot; re-weights value for each team&apos;s strategy ({r.classA} vs {r.classB}).</Info>}
          </Card>
      <details className="text-xs text-muted"><summary className="cursor-pointer font-semibold text-fg">Limitations</summary><ul className="mt-2 list-disc pl-4">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul></details>
    </div>
  );
}

function Mini({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: string; tone: "pos" | "neg" | false | null | undefined; onClick?: () => void }) {
  const Tag2 = onClick ? "button" : "div";
  return (
    <Tag2 type={onClick ? "button" : undefined} onClick={onClick} className={cx("rounded-lg bg-panel2 p-3 text-left", onClick && "transition-transform active:scale-[0.97]")}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cx("num font-[family-name:var(--font-display)] text-2xl font-bold", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "")}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </Tag2>
  );
}


/** SHS AI's view of the deal: each player's value nudged by his SHS AI score (±25% max). */
function AiTake({ ai, aSends, bSends, teams, me, partner, partnerName, mode }: {
  ai: Map<string, ShsAi>; aSends: string[]; bSends: string[]; teams: TeamOpt[]; me: number; partner: number; partnerName: string; mode: "redraft" | "dynasty";
}) {
  const asset = (rid: number, id: string) => teams.find((t) => t.rosterId === rid)?.assets.find((a) => a.id === id);
  const line = (rid: number, ids: string[]) => ids.map((id) => {
    const a = asset(rid, id);
    const pct = id.startsWith("p:") ? ai.get(id.slice(2))?.pct ?? null : null;
    return { id, name: a?.name ?? id, base: a?.value ?? 0, pct, adj: (a?.value ?? 0) * (1 + (pct ?? 0) / 100) };
  });
  const give = line(me, aSends), get = line(partner, bSends);
  const sum = (xs: typeof give, k: "base" | "adj") => xs.reduce((t, x) => t + x[k], 0);
  const shift = (sum(get, "adj") - sum(get, "base")) - (sum(give, "adj") - sum(give, "base"));
  const all = [...give.map((x) => ({ ...x, side: "send" })), ...get.map((x) => ({ ...x, side: "get" }))].filter((x) => x.pct !== null);
  if (!all.length) return null;
  return (
    <Card title="SHS AI take" right={<span className={cx("num text-sm font-bold", shift > 0.5 ? "text-pos" : shift < -0.5 ? "text-neg" : "text-muted")}>{shift > 0 ? "+" : ""}{shift.toFixed(1)} for you</span>}
      info={<>SHS AI = each player&apos;s value vs his expert rank, from the SHS formula ({mode === "dynasty" ? "dynasty" : "rest of season"}). Each player&apos;s trade value is nudged by his SHS AI %; the number above is how much that moves the deal toward you (+) or {partnerName} (−). It doesn&apos;t change the main verdict.</>}>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {all.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel2 px-3 py-2 text-sm">
            <span className="min-w-0 truncate"><span className="text-[10px] font-bold uppercase text-muted">{x.side === "send" ? "You send" : "You get"}</span> {x.name}</span>
            <span className={cx("num shrink-0 text-xs font-bold", x.pct! >= 5 ? "text-pos" : x.pct! <= -5 ? "text-neg" : "text-muted")}>{x.pct! > 0 ? "+" : ""}{x.pct}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
