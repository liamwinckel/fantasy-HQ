"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Minus, Plus, Search } from "lucide-react";
import { PlayerLink } from "@/components/PlayerCard";
import { PlayerImg, Segmented } from "@/components/client";
import { SwipeRow } from "@/components/SwipeRow";
import { Card, ClassBadge, InjuryChip, Logo, NflLogo, cx, signed } from "@/components/ui";
import { evaluateTrade, type BalanceSuggestion, type PowerShift, type TradeResult } from "@/lib/engine/trade";
import { getLeagueContext } from "@/lib/services/league";
import { useApp } from "@/components/AppData";
import { rankings } from "@/lib/services/rankings";
import { shsAi, type ShsAi } from "@/lib/services/shsai";
import { useShsWeights } from "@/components/ShsAiParts";

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
  // Keep-Trade-Cut style totals: each side's straight sum, plus a "value adjustment" on the side that's consolidating
  // (fewer, better pieces), sized so the two totals compare exactly as the weighted values do (depth discount and
  // roster-spot costs included).
  const rawSend = sumOf(mine, aSends), rawGet = sumOf(theirs, bSends);
  let adjSend = 0, adjGet = 0;
  if (result && rawSend > 0 && rawGet > 0) {
    const effS = result.market.aSends, effG = Math.max(0.01, result.market.bSends - result.rosterSpots.a.cost);
    const q = effS / effG;
    if (rawSend / rawGet < q) adjSend = rawGet * q - rawSend; else adjGet = rawSend / q - rawGet;
  }
  const sendTotal = rawSend + adjSend, getTotal = rawGet + adjGet;
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

      {/* Value bar: both totals, the weighting each side takes, and who's winning — pinned while you scroll. */}
      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-line bg-panel/95 px-3 py-3 shadow-lg backdrop-blur sm:mx-0 sm:px-4">
        <ValueBar send={sendTotal} get={getTotal} balance={result?.balance ?? null} partner={partnerName} />
        <div className="mt-2.5 flex justify-center">
          {step === "build" ? (
            <button type="button" disabled={!ready || !result} onClick={() => { setStep("analysis"); document.getElementById("fhq-scroll")?.scrollTo({ top: 0 }); }}
              className="w-full rounded-xl bg-acc py-2.5 text-sm font-extrabold text-on-acc transition-transform active:scale-[0.98] disabled:opacity-40 sm:w-72">
              {!ready ? "Add players to start" : busy || !result ? "Analyzing…" : "Analyze trade →"}
            </button>
          ) : (
            <button type="button" onClick={() => setStep("build")} className="w-full rounded-xl border border-line py-2.5 text-sm font-bold sm:w-72">← Edit trade</button>
          )}
        </div>
      </div>

      {step === "build" && (
        <>
          <div className="grid min-w-0 grid-cols-2 items-start gap-2 sm:gap-4">
            <DealColumn title="You send" team={mine} selected={aSends} onChange={setA} tiers={tiers} setTiers={setTiers} mode={mode} valueOf={valueOf} active={pickSide === "a"} onPick={() => setPickSide("a")} adjust={adjSend} />
            {theirs && <DealColumn title="You get" team={theirs} selected={bSends} onChange={setB} tiers={tiers} setTiers={setTiers} mode={mode} valueOf={valueOf} active={pickSide === "b"} onPick={() => setPickSide("b")} adjust={adjGet} />}
          </div>
          {theirs && <div className="lg:hidden"><Picker team={pickSide === "a" ? mine : theirs} tabs={[{ v: "a", label: "Your roster" }, { v: "b", label: `${partnerName}` }]} side={pickSide} setSide={setPickSide}
            selected={pickSide === "a" ? aSends : bSends} onAdd={(id) => (pickSide === "a" ? setA([...aSends, id]) : setB([...bSends, id]))} mode={mode} /></div>}
          {/* Desktop: both rosters open side by side under their deal columns. */}
          {theirs && (
            <div className="hidden grid-cols-2 items-start gap-4 lg:grid">
              <Picker team={mine} title="Your roster" selected={aSends} onAdd={(id) => setA([...aSends, id])} mode={mode} />
              <Picker team={theirs} title={`${partnerName}'s roster`} selected={bSends} onAdd={(id) => setB([...bSends, id])} mode={mode} />
            </div>
          )}
        </>
      )}

      {err && <div className="rounded-lg border border-neg px-3 py-2 text-sm text-neg">{err}</div>}
      {step === "analysis" && result && (
        <Result r={result} view={view} partner={partnerName} busy={busy} onApply={apply} me={me} partnerId={partner}
          deal={<DealSummary mine={mine} theirs={theirs} aSends={aSends} bSends={bSends} valueOf={valueOf} />}
          stack={<ValueStack r={result} partner={partnerName} assets={[...aSends.map((id) => mine.assets.find((x) => x.id === id)), ...bSends.map((id) => theirs?.assets.find((x) => x.id === id))].filter((x): x is Asset => !!x)} aSends={aSends} valueOf={valueOf} />}
          aiTake={<AiTake ai={ai} aSends={aSends} bSends={bSends} teams={teams} me={me} partner={partner} partnerName={partnerName} mode={mode} />} />
      )}
    </div>
  );
}

/** One side of the deal: just the assets in it, compact and the same row height on both sides. */
function DealColumn({ title, team, selected, onChange, tiers, setTiers, mode, valueOf, active, onPick, adjust }: {
  title: string; team: TeamOpt; selected: string[]; onChange: (v: string[]) => void; tiers: Record<string, Tier>; setTiers: (t: Record<string, Tier>) => void;
  mode: "redraft" | "dynasty"; valueOf: (a: Asset) => number; active: boolean; onPick: () => void; adjust: number;
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
          <SwipeRow key={id} onRemove={() => onChange(selected.filter((x) => x !== id))}>
          <div className="fhq-in flex h-12 items-center gap-1.5 rounded-lg bg-panel2 px-2">
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
          </SwipeRow>
        );
      })}
      {adjust >= 0.5 && (
        <div className="fhq-in flex h-10 items-center justify-between rounded-lg border border-line px-2 text-xs" style={{ background: "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--fg) 8%, transparent) 6px 8px)" }}
          title="Consolidation: fewer, better pieces are worth more than the straight sum (four quarters ≠ a dollar)">
          <span className="truncate font-semibold text-muted">Adjustment</span><span className="num font-bold">+{tv(adjust)}</span>
        </div>
      )}
      <button type="button" onClick={onPick} className={cx("flex h-10 items-center justify-center gap-1 rounded-lg border border-dashed text-xs font-semibold", active ? "border-acc/60 text-acc-ink" : "border-line text-muted")}>
        <Plus size={14} /> Add
      </button>
    </div>
  );
}

/** One roster picker for both sides, so the two columns stay tidy. */
function Picker({ team, tabs, side, setSide, title, selected, onAdd, mode }: {
  team: TeamOpt; tabs?: { v: "a" | "b"; label: string }[]; side?: "a" | "b"; setSide?: (s: "a" | "b") => void; title?: string; selected: string[]; onAdd: (id: string) => void; mode: "redraft" | "dynasty";
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const positions = ["ALL", ...new Set(team.assets.filter((a) => mode === "dynasty" || a.kind === "player").map((a) => a.pos))];
  const pool = team.assets.filter((a) => !selected.includes(a.id) && (mode === "dynasty" || a.kind === "player") && (pos === "ALL" || a.pos === pos) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card pad={false}>
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        {title && <div className="text-xs font-bold uppercase tracking-wider text-muted">{title}</div>}
        {tabs && setSide && <div className="grid grid-cols-2 gap-1 rounded-xl bg-panel2 p-1">
          {tabs.map((t) => (
            <button key={t.v} type="button" onClick={() => setSide(t.v)} className={cx("truncate rounded-lg px-2 py-1.5 text-xs font-bold", side === t.v ? "bg-acc text-on-acc" : "text-muted")}>{t.label}</button>
          ))}
        </div>}
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${team.name} roster`} className="w-full rounded-lg border border-line bg-panel2 py-2 pl-8 pr-2.5 text-sm" />
        </label>
        <div className="flex gap-1 overflow-x-auto">
          {positions.map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", pos === p ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}>{p === "ALL" ? "All" : p}</button>)}
        </div>
        <ul className={cx("flex flex-col gap-0.5", title && "max-h-[60vh] overflow-y-auto overscroll-contain")}>
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
  return <div className="grid grid-cols-2 gap-4">{col(mine, aSends, "You send")}{col(theirs, bSends, `You get from ${theirs?.name ?? "partner"}`)}</div>;
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
    <div className="flex flex-col gap-4">
        <p className="text-[11px] text-muted">Each asset&apos;s value is its points above a replacement starter in this league&apos;s scoring. Then: <b className="text-fg">depth discount</b> — several smaller pieces can&apos;t fill one star&apos;s lineup spot (&quot;four quarters ≠ a dollar&quot;); <b className="text-fg">roster spots</b> — taking back more players means a cut; <b className="text-fg">best player</b> — managers want ~7% extra to give him up.</p>
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


function Result({ r, view, partner, busy, onApply, me, partnerId, deal, stack, aiTake }: {
  r: TradeResult; view: View; partner: string; busy: boolean; onApply: (s: BalanceSuggestion) => void; me: number; partnerId: number;
  deal: React.ReactNode; stack: React.ReactNode; aiTake: React.ReactNode;
}) {
  const maxW = Math.max(1, ...r.lineup.aWeeks.flatMap((w) => [w.before, w.after]));
  const fairBand = Math.max(3, 0.08 * Math.max(r.market.aSends, r.market.bSends));
  return (
    <div className={cx("flex flex-col gap-3 transition-opacity", busy && "opacity-60")}>
      <div className="lg:hidden"><TeamImpact r={r} me={me} partnerId={partnerId} partner={partner} /></div>
      <div className="hidden grid-cols-2 items-start gap-4 lg:grid">
        <TeamImpact r={r} me={me} partnerId={partnerId} partner={partner} fixed="a" />
        <TeamImpact r={r} me={me} partnerId={partnerId} partner={partner} fixed="b" />
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel lg:block lg:columns-2 lg:gap-4 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent">
        <Fold title="Verdict & why" desk summary={<span className={cx("font-bold", r.verdictTone === "good" ? "text-pos" : r.verdictTone === "bad" ? "text-neg" : "text-fg")}>{r.verdict}</span>}>
          <div className="grid grid-cols-3 gap-1.5">
            <Mini label={`${partner} accepts`} value={`${Math.round(r.accept * 100)}%`} sub={r.accept >= 0.6 ? "Likely" : r.accept >= 0.35 ? "Coin flip" : "Unlikely"} tone={r.accept >= 0.5 ? "pos" : r.accept < 0.3 ? "neg" : null} />
            <Mini label="Title odds" value={r.odds ? `${signed(Math.round(r.odds.aTitleAfter - r.odds.aTitleBefore))}%` : "—"} sub={r.odds ? `${r.odds.aTitleBefore.toFixed(0)} → ${r.odds.aTitleAfter.toFixed(0)}%` : undefined} tone={r.odds && r.odds.aTitleAfter >= r.odds.aTitleBefore ? "pos" : "neg"} />
            <Mini label="Confidence" value={`${r.confidence}%`} sub={`${VIEW_LABEL[view]} values`} tone={null} />
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm leading-relaxed text-muted">{r.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
        </Fold>
        <Fold title="The deal" desk summary={<span className="text-muted">{r.assets.length} asset{r.assets.length === 1 ? "" : "s"}</span>}>{deal}</Fold>
        <Fold title="How the value adds up" desk summary={<span className="num text-muted">{tv(r.market.aSends)} vs {tv(Math.max(0, r.market.bSends - r.rosterSpots.a.cost))}</span>}>{stack}</Fold>
        <Fold title="Make it fair" desk summary={<span className="text-muted">{r.suggestions.length ? `${r.suggestions.length} idea${r.suggestions.length > 1 ? "s" : ""}` : Math.abs(r.market.netForA) <= fairBand ? "Already fair" : "—"}</span>}>
          {r.suggestions.length === 0 ? (
            <p className="text-sm text-muted">{Math.abs(r.market.netForA) <= fairBand ? "Values are already within a fair range." : "No single asset closes the gap neatly. Try a smaller piece or swap the main player."}</p>
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
        </Fold>
        {aiTake && <Fold title="SHS AI take" summary={null}>{aiTake}</Fold>}
        {r.lineup.weeks > 0 && (
          <Fold title="Week by week" summary={<span className={cx("num font-bold", r.lineup.aRosDelta >= 0 ? "text-pos" : "text-neg")}>{signed(r.lineup.aRosDelta)} pts/g</span>}>
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
            <p className="mt-2 text-[11px] text-muted">Your best lineup each remaining week (byes, matchups, injuries). Grey = before, coloured = after.</p>
          </Fold>
        )}
        <Fold title="League power rankings" summary={null}><div className="-mx-4"><PowerTable power={r.power} me={me} partnerId={partnerId} /></div></Fold>
        <Fold title="Every asset" summary={null}>
          <ul className="flex flex-col gap-2">
            {r.assets.map((a) => (
              <li key={a.id} className="rounded-lg bg-panel2 px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">{a.kind === "player" ? <PlayerLink id={a.id.slice(2)} name={a.name} className="font-semibold" /> : <b>{a.name}</b>} <span className="text-xs text-muted">{a.from === me ? "→ them" : "→ you"}</span></span>
                  <span className="num shrink-0 font-bold">{tv(a.market)}{r.classA && <span className="ml-1 text-[11px] font-normal text-muted">({tv(a.toA)} to you)</span>}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.drivers.map((d) => <span key={d.label} className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold", d.tone === "pos" ? "bg-pos/15 text-pos" : d.tone === "neg" ? "bg-neg/15 text-neg" : "bg-panel text-muted")}>{d.label}: {d.value}</span>)}
                </div>
              </li>
            ))}
          </ul>
        </Fold>
        <Fold title="Limitations" summary={null}><ul className="list-disc pl-4 text-xs text-muted">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Fold>
      </div>
    </div>
  );
}

/** A section of the readout that opens in place. */
function Fold({ title, summary, open: start = false, desk = false, children }: { title: string; summary: React.ReactNode; open?: boolean; desk?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(start);
  // On wide screens there's room: some sections start open.
  useEffect(() => { if (desk && window.matchMedia("(min-width: 1024px)").matches) setOpen(true); }, [desk]);
  return (
    <div className="border-t border-line first:border-t-0 lg:mb-4 lg:break-inside-avoid lg:rounded-2xl lg:border lg:bg-panel lg:first:border-t">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className="flex-1 text-sm font-bold">{title}</span>
        <span className="truncate text-xs">{summary}</span>
        <ChevronDown size={16} className={cx("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <div className={cx("grid transition-[grid-template-rows] duration-300", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden"><div className="px-4 pb-4">{children}</div></div>
      </div>
    </div>
  );
}

/** Straight after the verdict: a team before → after, starter by starter, with power and positional ranks. */
function TeamImpact({ r, me, partnerId, partner, fixed }: { r: TradeResult; me: number; partnerId: number; partner: string; fixed?: "a" | "b" }) {
  const { ctx } = useApp();
  const [pick, setWho] = useState<"a" | "b">("a");
  const who = fixed ?? pick;
  const rows = who === "a" ? r.lineups.a : r.lineups.b;
  const pw = r.power.find((p) => p.rosterId === (who === "a" ? me : partnerId));
  const ros = who === "a" ? { before: r.lineup.aRosBefore, after: r.lineup.aRosAfter } : { before: r.lineup.bRosBefore, after: r.lineup.bRosAfter };
  const beforeIds = new Set(rows.map((x) => x.before.id).filter(Boolean) as string[]);
  const before = rows.reduce((t, x) => t + x.before.ppg, 0), after = rows.reduce((t, x) => t + x.after.ppg, 0);
  const d = Math.round((after - before) * 10) / 10;
  const positions = who === "a" ? r.positionsA : r.positionsB;
  return (
    <Card pad={false}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="flex-1 truncate whitespace-nowrap text-sm font-bold">{fixed ? `${fixed === "a" ? "Your team" : partner} after the trade` : "Team impact"}</span>
        <div className={cx(fixed && "hidden", "grid grid-cols-2 gap-0.5 rounded-lg bg-panel2 p-0.5 text-xs font-bold")}>
          {(["a", "b"] as const).map((k) => <button key={k} type="button" onClick={() => setWho(k)} className={cx("max-w-[8rem] truncate rounded-md px-3 py-1", who === k ? "bg-acc text-on-acc" : "text-muted")}>{k === "a" ? "You" : partner}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-4 pt-3">
        <Stat label="Starters pts/g" value={signed(d)} sub={`${before.toFixed(1)} → ${after.toFixed(1)}`} tone={d > 0.2 ? "pos" : d < -0.2 ? "neg" : null} />
        <Stat label="Power rank" value={pw ? (pw.before.rank === pw.after.rank ? "—" : `${pw.before.rank > pw.after.rank ? "▲" : "▼"}${Math.abs(pw.before.rank - pw.after.rank)}`) : "—"} sub={pw ? `#${pw.before.rank} → #${pw.after.rank}` : undefined} tone={pw ? (pw.after.rank < pw.before.rank ? "pos" : pw.after.rank > pw.before.rank ? "neg" : null) : null} />
        <Stat label="Rest of season" value={r.lineup.weeks ? signed(Math.round((ros.after - ros.before) * 10) / 10) : "—"} sub={r.lineup.weeks ? `${ros.before} → ${ros.after} pts/g` : undefined} tone={ros.after > ros.before ? "pos" : ros.after < ros.before ? "neg" : null} />
      </div>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {rows.map((x) => {
          // "New" = a player who wasn't starting before (arrived in the trade or promoted from the bench);
          // players who just shift spots aren't flagged.
          const changed = !!x.after.id && !beforeIds.has(x.after.id);
          const pl = x.after.id ? ctx?.players.get(x.after.id) : undefined;
          return (
            <li key={x.slot} className={cx("flex items-center gap-2.5 px-4 py-2", changed && "bg-acc-soft")}>
              <span className="w-11 shrink-0 rounded-md bg-panel2 py-1 text-center text-[10px] font-extrabold text-muted">{x.slot}</span>
              {x.after.id ? <PlayerImg id={x.after.id} name={x.after.name} pos={pl?.pos ?? ""} size={34} /> : <span className="h-[34px] w-[34px] shrink-0 rounded-full border border-dashed border-neg" />}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1 text-sm font-semibold">
                  {x.after.id ? <PlayerLink id={x.after.id} name={x.after.name} className="truncate" /> : <span className="text-muted">Empty</span>}
                  {pl && <InjuryChip status={pl.injury} />}
                  {changed && <span className="shrink-0 rounded bg-acc px-1 text-[9px] font-extrabold text-on-acc">NEW</span>}
                </div>
                <div className="flex items-center gap-1 truncate text-[11px] text-muted">
                  {pl && <NflLogo team={pl.team} size={11} />}
                  <span className="truncate">{pl ? `${pl.pos}${pl.team ? ` · ${pl.team}` : ""}` : ""}{changed ? ` · replaces ${x.before.name} (${x.before.ppg})` : ""}</span>
                </div>
              </div>
              <div className="w-12 shrink-0 text-right">
                <div className="num text-sm font-bold">{x.after.ppg}</div>
                <div className={cx("num text-[10px] font-bold", x.delta > 0.2 ? "text-pos" : x.delta < -0.2 ? "text-neg" : "text-muted")}>{Math.abs(x.delta) > 0.05 ? signed(x.delta) : "pts/g"}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-1.5 overflow-x-auto border-t border-line px-4 py-3">
        {positions.map((p) => {
          const dd = p.before.rank && p.after.rank ? p.before.rank - p.after.rank : 0;
          return (
            <div key={p.pos} className={cx("flex shrink-0 flex-col items-center rounded-lg border px-2.5 py-1", dd > 0 ? "border-pos/60" : dd < 0 ? "border-neg/60" : "border-line")}>
              <span className="text-[9px] font-bold uppercase text-muted">{p.pos}</span>
              <span className="num text-xs font-bold">#{p.after.rank || "—"}</span>
              <span className={cx("num text-[10px] font-bold", dd > 0 ? "text-pos" : dd < 0 ? "text-neg" : "text-muted")}>{dd > 0 ? `▲${dd}` : dd < 0 ? `▼${-dd}` : "—"}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "pos" | "neg" | null }) {
  return (
    <div className="rounded-lg bg-panel2 px-2.5 py-2">
      <div className="truncate text-[10px] text-muted">{label}</div>
      <div className={cx("num font-[family-name:var(--font-display)] text-xl font-bold leading-tight", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "")}>{value}</div>
      {sub && <div className="num truncate text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

/**
 * Keep-Trade-Cut style value bar: one track split at your share of the total value. The winning side's part is thick
 * and solid, the other side thin and faded; green when you win, red when you lose, blue when it's even. The faint
 * centre block is the fair range.
 */
function ValueBar({ send, get, balance, partner }: { send: number; get: number; balance: number | null; partner: string }) {
  const total = send + get;
  const getShare = total > 0 ? (100 * get) / total : 50;
  const fair = balance !== null && Math.abs(balance) < 8;
  const youWin = balance !== null && balance > 0 && !fair;
  const color = balance === null ? "var(--muted)" : fair ? "#4a9eff" : youWin ? "var(--pos)" : "var(--neg)";
  const label = balance === null ? "Add players to both sides" : fair ? "Fair trade" : balance > 0 ? (balance > 40 ? "Strongly favours you" : "Favours you") : balance < -40 ? `Strongly favours ${partner}` : `Favours ${partner}`;
  // The side getting more value is drawn solid: "You get" (right) when you're getting more.
  const rightWins = get >= send;
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-2">
        <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-muted">You send</div><div className="num h-display text-2xl leading-none sm:text-3xl" style={{ color: !rightWins && balance !== null ? color : undefined }}>{tv(send)}</div></div>
        <div className="min-w-0 text-right"><div className="text-[10px] font-bold uppercase tracking-wider text-muted">You get</div><div className="num h-display text-2xl leading-none sm:text-3xl" style={{ color: rightWins && balance !== null ? color : undefined }}>{tv(get)}</div></div>
      </div>
      <div className="relative h-5">
        {/* fair range */}
        <div className="absolute inset-y-0 left-[45%] right-[45%] rounded" style={{ background: "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, #4a9eff 35%, transparent) 4px 6px)" }} aria-hidden />
        {total > 0 && (
          <>
            {/* left part: what you send */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-l-full transition-all duration-500"
              style={{ width: `${100 - getShare}%`, height: rightWins ? 6 : 14, background: color, opacity: rightWins ? 0.35 : 1 }} />
            {/* right part: what you get */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 rounded-r-full transition-all duration-500"
              style={{ width: `${getShare}%`, height: rightWins ? 14 : 6, background: color, opacity: rightWins ? 1 : 0.35 }} />
          </>
        )}
      </div>
      <div className="mt-2 rounded-lg px-3 py-1.5 text-center text-sm font-extrabold" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
        {label}
      </div>
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
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted">SHS AI = each player&apos;s value vs his expert rank ({mode === "dynasty" ? "dynasty" : "rest of season"}). Nudging values by it moves the deal <b className={cx("num", shift > 0.5 ? "text-pos" : shift < -0.5 ? "text-neg" : "text-fg")}>{shift >= 0 ? "+" : "−"}{tv(Math.abs(shift))}</b> toward {shift >= 0 ? "you" : partnerName}. It doesn&apos;t change the verdict.</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {all.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel2 px-3 py-2 text-sm">
            <span className="min-w-0 truncate"><span className="text-[10px] font-bold uppercase text-muted">{x.side === "send" ? "You send" : "You get"}</span> {x.name}</span>
            <span className={cx("num shrink-0 text-xs font-bold", x.pct! >= 5 ? "text-pos" : x.pct! <= -5 ? "text-neg" : "text-muted")}>{x.pct! > 0 ? "+" : ""}{x.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
