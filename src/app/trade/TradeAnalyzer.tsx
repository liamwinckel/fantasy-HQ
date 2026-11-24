"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, Search } from "lucide-react";
import { PlayerLink } from "@/components/PlayerCard";
import { PlayerImg } from "@/components/client";
import { Card, ClassBadge, InjuryChip, Logo, NflLogo, Tag, cx, signed, Info } from "@/components/ui";
import { evaluateTrade, type BalanceSuggestion, type PositionShift, type PowerShift, type TradeResult } from "@/lib/engine/trade";
import { getLeagueContext } from "@/lib/services/league";
import { useApp } from "@/components/AppData";

type Tier = "early" | "mid" | "late";
export interface Asset {
  id: string; kind: "player" | "pick"; name: string; pos: string; team: string | null; sub: string; value: number; injury: string | null;
  tier?: Tier; tierValues?: Record<Tier, number>;
}
export interface TeamOpt {
  rosterId: number; name: string; manager: string; avatar: string | null; record: string; cls: string | null; conf: number | null;
  overridden: boolean; playoff: number; title: number; assets: Asset[];
}

export function TradeAnalyzer({ leagueId, mode, me, teams, initialPartner, initialA, initialB }: {
  leagueId: string; mode: "redraft" | "dynasty"; me: number; teams: TeamOpt[]; initialPartner: number; initialA: string[]; initialB: string[];
}) {
  const { ctx, setup } = useApp();
  const [partner, setPartner] = useState(initialPartner);
  const [aSends, setA] = useState<string[]>(initialA);
  const [bSends, setB] = useState<string[]>(initialB);
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [result, setResult] = useState<TradeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = teams.find((t) => t.rosterId === me)!;
  const theirs = teams.find((t) => t.rosterId === partner);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-1 text-[11px] uppercase tracking-wider text-muted sm:w-auto">
          Trade partner
          <select value={partner} onChange={(e) => { setPartner(Number(e.target.value)); setB([]); }}
            className="w-full min-w-0 rounded-lg border border-line bg-panel px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-fg sm:w-auto sm:min-w-64">
            {teams.filter((t) => t.rosterId !== me).map((t) => <option key={t.rosterId} value={t.rosterId}>{t.name} · {t.record}{t.cls ? ` · ${t.cls}` : ""}</option>)}
          </select>
        </label>
        <Info className="">Valued as <b className="text-fg">{mode === "dynasty" ? "Dynasty" : "Redraft"}</b>, from this league&apos;s format. Tap <b className="text-fg">+</b> to add a player to the deal, <b className="text-fg">−</b> to take him out.</Info>
      </div>

      {result && <div className="lg:hidden"><Card><Spectrum balance={result.balance} partner={theirs?.name ?? "Partner"} /></Card></div>}

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4">
        <Side title="You send" team={mine} selected={aSends} onChange={setA} tiers={tiers} setTiers={setTiers} mode={mode} />
        {theirs && <Side title="You receive" team={theirs} selected={bSends} onChange={setB} tiers={tiers} setTiers={setTiers} mode={mode} />}
      </div>

      {err && <div className="rounded-lg border border-neg px-3 py-2 text-sm text-neg">{err}</div>}
      {!result && !err && <Card><p className="text-sm text-muted">Add players or picks to either side to see who wins, how both teams change, and how to make it fair.</p></Card>}
      {result && <Result r={result} partner={theirs?.name ?? "Partner"} busy={busy} onApply={apply} me={me} partnerId={partner} />}
    </div>
  );
}

function Side({ title, team, selected, onChange, tiers, setTiers, mode }: {
  title: string; team: TeamOpt; selected: string[]; onChange: (v: string[]) => void;
  tiers: Record<string, Tier>; setTiers: (t: Record<string, Tier>) => void; mode: "redraft" | "dynasty";
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const byId = useMemo(() => new Map(team.assets.map((a) => [a.id, a])), [team]);
  const valueOf = (a: Asset) => (a.kind === "pick" && mode === "dynasty" && tiers[a.id] && a.tierValues ? a.tierValues[tiers[a.id]] : a.value);
  const total = selected.reduce((t, id) => t + (byId.get(id) ? valueOf(byId.get(id)!) : 0), 0);
  const positions = ["ALL", ...new Set(team.assets.filter((a) => mode === "dynasty" || a.kind === "player").map((a) => a.pos))];
  const pool = team.assets.filter((a) => !selected.includes(a.id) && (mode === "dynasty" || a.kind === "player") && (pos === "ALL" || a.pos === pos) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card className="!p-0" pad={false}>
      <div className="p-2.5 sm:p-5">
      <div className="mb-3 flex flex-col items-center gap-1.5 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div className="flex min-w-0 flex-col items-center gap-1.5 sm:flex-row sm:gap-3">
          <Logo src={team.avatar} name={team.name} size={40} />
          <div className="min-w-0 max-w-full">
            <div className="text-[10px] uppercase tracking-wider text-muted sm:text-[11px]">{title}</div>
            <div className="h-display truncate text-lg sm:text-2xl">{team.name}</div>
            <div className="text-[10px] text-muted sm:text-xs">{team.record}<span className="hidden sm:inline"> · {team.playoff.toFixed(0)}% playoffs · {team.title.toFixed(0)}% title</span></div>
          </div>
        </div>
        {team.cls && <div className="sm:text-right"><ClassBadge cls={team.cls} /><div className="mt-1 hidden text-[11px] text-muted sm:block">{team.conf}% conf.{team.overridden && " · manual"}</div></div>}
      </div>
      <div className="flex min-h-16 flex-col gap-2 rounded-xl border border-dashed border-line p-1.5">
        {selected.length === 0 && <p className="px-2 py-4 text-center text-[11px] text-muted">Tap + below to add</p>}
        {selected.map((id) => {
          const a = byId.get(id);
          if (!a) return null;
          return (
            <div key={id} className="fhq-in flex items-center gap-1.5 rounded-lg bg-panel2 p-1.5 sm:gap-3 sm:p-2.5">
              <span className="hidden sm:block">{a.kind === "player" ? <PlayerImg id={id.slice(2)} name={a.name} pos={a.pos} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-acc text-[11px] font-extrabold text-on-acc">R{a.name.split("Round ")[1]}</span>}</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold sm:text-sm">{a.kind === "player" ? <PlayerLink id={a.id.slice(2)} name={a.name} /> : <span className="truncate">{a.name}</span>}<InjuryChip status={a.injury} /></div>
                <div className="flex items-center gap-1 truncate text-[10px] text-muted sm:text-xs"><NflLogo team={a.team} size={12} /><span className="truncate">{a.sub}</span></div>
                {a.kind === "pick" && mode === "dynasty" && (
                  <div className="mt-1.5 flex gap-1" role="group" aria-label="Pick position">
                    {(["early", "mid", "late"] as Tier[]).map((t) => (
                      <button key={t} type="button" onClick={() => setTiers({ ...tiers, [id]: t })}
                        className={cx("rounded px-2 py-1 text-[11px] font-semibold capitalize", (tiers[id] ?? a.tier) === t ? "bg-acc text-on-acc" : "border border-line text-muted")}>{t}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right"><div className="num font-[family-name:var(--font-display)] text-lg font-bold leading-none sm:text-2xl">{valueOf(a).toFixed(1)}</div><div className="hidden text-[10px] text-muted sm:block">value</div></div>
              <button type="button" aria-label={`Take ${a.name} out of the trade`} onClick={() => onChange(selected.filter((x) => x !== id))}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neg/60 text-neg transition-transform hover:bg-neg/10 active:scale-90 sm:h-9 sm:w-9"><Minus size={16} /></button>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs sm:text-sm"><span className="text-muted">Total value</span><span className="num font-bold">{total.toFixed(1)}</span></div>
      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <label className="relative w-full min-w-0 sm:w-auto sm:flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${team.name} roster`} className="w-full rounded-lg border border-line bg-panel2 py-2 pl-8 pr-2.5 text-sm" />
          </label>
          <div className="flex w-full gap-1 overflow-x-auto sm:w-auto">
            {positions.map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("rounded-full px-2.5 py-1 text-[11px] font-semibold", pos === p ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}>{p === "ALL" ? "All" : p}</button>)}
          </div>
        </div>
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {pool.map((a) => (
            <li key={a.id} className="flex items-center gap-1.5 rounded-lg px-1 py-1.5 hover:bg-panel2 sm:gap-2.5 sm:px-1.5">
              <span className="hidden sm:block">{a.kind === "player" ? <PlayerImg id={a.id.slice(2)} name={a.name} pos={a.pos} size={30} /> : <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-panel2 text-[10px] font-extrabold">R{a.name.split("Round ")[1]}</span>}</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1 text-xs sm:text-sm">{a.kind === "player" ? <PlayerLink id={a.id.slice(2)} name={a.name} className="font-semibold" /> : <span className="truncate font-semibold">{a.name}</span>}<InjuryChip status={a.injury} /></div>
                <div className="flex items-center gap-1 truncate text-[10px] text-muted sm:text-xs"><NflLogo team={a.team} size={12} /><span className="truncate">{a.sub}</span></div>
              </div>
              <span className="num w-6 text-right text-xs font-bold sm:w-9 sm:text-sm">{a.value.toFixed(0)}</span>
              <button type="button" aria-label={`Add ${a.name} to the trade`} onClick={() => onChange([...selected, a.id])}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-acc text-on-acc transition-transform active:scale-90 sm:h-9 sm:w-9"><Plus size={16} /></button>
            </li>
          ))}
          {pool.length === 0 && <li className="px-2 py-3 text-xs text-muted">Nobody matches.</li>}
        </ul>
      </div>
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

function Result({ r, partner, busy, onApply, me, partnerId }: { r: TradeResult; partner: string; busy: boolean; onApply: (s: BalanceSuggestion) => void; me: number; partnerId: number }) {
  const meP = r.power.find((p) => p.rosterId === me);
  const themP = r.power.find((p) => p.rosterId === partnerId);
  return (
    <div className={cx("flex flex-col gap-4 transition-opacity", busy && "opacity-60")}>
      <Card>
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex flex-1 flex-col gap-4">
            <Spectrum balance={r.balance} partner={partner} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Confidence {r.confidence}%</span><span>·</span><span>{r.mode === "dynasty" ? "Dynasty" : "Redraft"} valuation</span><Tag kind="MODEL" />
            </div>
            <ul className="flex flex-col gap-1 text-sm leading-relaxed">{r.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-[400px]">
            <Mini label="Package value: you get" value={signed(r.market.netForA)} sub={`send ${r.market.aSends} · receive ${r.market.bSends}`} tone={r.market.netForA >= 0 ? "pos" : "neg"} />
            <Mini label="Your lineup, rest of season" value={`${signed(r.lineup.aRosDelta)} pts`} tone={r.lineup.aRosDelta >= 0 ? "pos" : "neg"} />
            <Mini label="Your power rank" value={meP ? `#${meP.before.rank} → #${meP.after.rank}` : "—"} tone={meP && meP.after.rank <= meP.before.rank ? "pos" : "neg"} />
            <Mini label="Your title odds" value={r.odds ? `${r.odds.aTitleBefore.toFixed(0)}% → ${r.odds.aTitleAfter.toFixed(0)}%` : "—"} tone={r.odds && r.odds.aTitleAfter >= r.odds.aTitleBefore ? "pos" : "neg"} />
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

      <Card title="Package value" right={<span className="text-[11px] text-muted">simple sum vs consolidated</span>}>
        <div className="flex flex-col gap-3">
          {[{ label: "You send", raw: r.market.aSendsRaw, pkg: r.market.aSends, tone: "bg-fg" }, { label: "You receive", raw: r.market.bSendsRaw, pkg: r.market.bSends, tone: "bg-acc" }].map((row) => {
            const max = Math.max(1, r.market.aSendsRaw, r.market.bSendsRaw);
            return (
              <div key={row.label} className="grid grid-cols-[6rem_1fr_6.5rem] items-center gap-3 text-sm">
                <span className="text-muted">{row.label}</span>
                <div className="relative h-5 rounded-md bg-panel2">
                  <div className="absolute inset-y-0 left-0 rounded-md border border-dashed border-muted/60 transition-[width] duration-500" style={{ width: `${(100 * row.raw) / max}%` }} />
                  <div className={cx("absolute inset-y-1 left-0 rounded transition-[width] duration-500", row.tone)} style={{ width: `${(100 * row.pkg) / max}%` }} />
                </div>
                <span className="num text-right"><b>{row.pkg.toFixed(1)}</b> <span className="text-xs text-muted">/ {row.raw.toFixed(1)}</span></span>
              </div>
            );
          })}
        </div>
        <Info className="mt-3">Solid bar = package value, dashed = simple sum. Several smaller pieces are discounted because they can&apos;t fill one star&apos;s lineup spot (&quot;four quarters ≠ a dollar&quot;). This applies to picks too.
          {r.rosterSpots.a.extra > 0 && <> You&apos;d need to cut <b className="text-fg">{r.rosterSpots.a.drops.join(", ")}</b> to make room (−{r.rosterSpots.a.cost}).</>}
          {r.rosterSpots.b.extra > 0 && <> {partner} would need to cut {r.rosterSpots.b.drops.length} player{r.rosterSpots.b.drops.length > 1 ? "s" : ""} (−{r.rosterSpots.b.cost}).</>}
        </Info>
      </Card>

      <Card title="Make it fair" right={<Tag kind="MODEL" />}>
        {r.suggestions.length === 0 ? (
          <p className="text-sm text-muted">{Math.abs(r.market.netForA) <= Math.max(3, 0.08 * Math.max(r.market.aSends, r.market.bSends)) ? "Values are already within a fair range. No changes needed." : "No single asset closes the gap neatly. Try adding a smaller piece or swapping the main player."}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {r.suggestions.map((s) => (
              <li key={s.action + s.assetId} className="flex items-center gap-3 rounded-lg bg-panel2 p-3">
                <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", s.action === "add" ? "bg-acc text-on-acc" : "border border-line")}>{s.action === "add" ? <Plus size={16} /> : <Minus size={16} />}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <div><b>{s.action === "add" ? "Add" : "Remove"} {s.name}</b> <span className="text-muted">({s.value.toFixed(1)})</span></div>
                  <div className="truncate text-xs text-muted">{s.side === "a" ? (s.action === "add" ? "You also send" : "You keep") : s.action === "add" ? `${partner} also sends` : `${partner} keeps`} · gap after: {signed(s.gapAfter)}</div>
                </div>
                <button type="button" onClick={() => onApply(s)} className="rounded-md bg-acc px-3 py-1.5 text-xs font-bold text-on-acc">Apply</button>
              </li>
            ))}
          </ul>
        )}
        <Info className="mt-3">Suggestions close the value gap using assets the side getting the better deal can spare (non-starters preferred), or by removing an asset from the side that&apos;s overpaying.</Info>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card title="Power rankings after trade" right={<span className="text-[11px] text-muted">score before → after · rank change</span>} pad={false}>
          <PowerTable power={r.power} me={me} partnerId={partnerId} />
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Positional ranks (1 = best)">
            <div className="flex flex-col gap-4">
              <Positions title={`You${meP ? ` · power #${meP.before.rank} → #${meP.after.rank}` : ""}`} rows={r.positionsA} />
              <Positions title={`${partner}${themP ? ` · power #${themP.before.rank} → #${themP.after.rank}` : ""}`} rows={r.positionsB} />
            </div>
          </Card>
        </div>
      </div>
          <Card title="Value breakdown" pad={false}>
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
                      <td className="num px-2 py-2.5 text-right">{a.market.toFixed(1)}</td>
                      {r.classA && <><td className="num px-2 py-2.5 text-right font-semibold text-acc-ink">{a.toA.toFixed(1)}</td><td className="num px-5 py-2.5 text-right">{a.toB.toFixed(1)}</td></>}
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

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "pos" | "neg" | false | null | undefined }) {
  return (
    <div className="rounded-lg bg-panel2 p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cx("num font-[family-name:var(--font-display)] text-2xl font-bold", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "")}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

