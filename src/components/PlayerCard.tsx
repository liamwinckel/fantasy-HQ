"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ownershipAcross, playerCard, type PlayerCardData } from "@/lib/services/playerCard";
import { useSwipeDown } from "./swipe";
import { cx, NflLogo, Info } from "./ui";
import { useApp } from "./AppData";

const Ctx = createContext<{ open: (id: string) => void }>({ open: () => {} });
export const usePlayerCard = () => useContext(Ctx);

/** Wrap the app once; any PlayerLink / player photo can then open the card. */
export function PlayerCardProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<PlayerCardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const open = useCallback((pid: string) => { setId(pid); setData(null); setErr(null); }, []);
  const close = () => setId(null);
  const app = useApp();
  useEffect(() => {
    if (!id) return;
    let live = true;
    const ctx = app.ctx;
    if (!ctx || !app.setup) { setErr("League still loading. Try again in a moment."); return; }
    playerCard(ctx, id)
      .then((d) => {
        if (!live) return;
        if (!d) { setErr("This player isn't in this league's player pool."); return; }
        setData(d);
        ownershipAcross(app.setup!, id).then((own) => live && setData((cur) => (cur && cur.id === id ? { ...cur, ownership: own } : cur)));
      })
      .catch((e) => live && setErr((e as Error).message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, app.ctx]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setId(null);
    if (id) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);
  const swipe = useSwipeDown(close);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <div className={cx("fixed inset-0 z-[70] transition", id ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!id}>
        <div className={cx("absolute inset-0 bg-black/50 transition-opacity duration-300", id ? "opacity-100" : "opacity-0")} onClick={close} />
        <aside ref={swipe.ref} {...swipe.handlers} role="dialog" aria-modal="true" aria-label={data?.name ?? "Player"}
          className={cx("absolute bottom-0 right-0 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-bg shadow-2xl transition-transform duration-300 ease-out md:top-0 md:max-h-none md:w-[520px] md:rounded-none md:rounded-l-2xl",
            id ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full md:translate-y-0")}>
          <button type="button" onClick={close} aria-label="Close player card" className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-panel2"><X size={18} /></button>
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted/40 md:hidden" aria-hidden />
          <div ref={swipe.scrollRef} className="sheet-bottom-pad min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {!data && !err && id && <div className="p-6"><div className="h-20 animate-pulse rounded-xl bg-panel2" /><div className="mt-4 h-40 animate-pulse rounded-xl bg-panel2" /></div>}
            {err && <p className="p-6 text-sm text-neg">{err}</p>}
            {data && <CardBody d={data} />}
          </div>
        </aside>
      </div>
    </Ctx.Provider>
  );
}

export function PlayerLink({ id, name, className }: { id: string; name: string; className?: string }) {
  const { open } = usePlayerCard();
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); open(id); }} className={cx("truncate text-left underline-offset-2 hover:underline", className)}>{name}</button>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="border-t border-line px-5 py-4">
    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-muted">{title}</h3>
    {children}
  </section>
);

function CardBody({ d }: { d: PlayerCardData }) {
  const img = d.pos === "DEF" ? `https://sleepercdn.com/images/team_logos/nfl/${d.id.toLowerCase()}.png` : `https://sleepercdn.com/content/nfl/players/${d.id}.jpg`;
  const pct = (f: number) => `${f >= 1 ? "+" : ""}${Math.round((f - 1) * 100)}%`;
  return (
    <div className="pb-8">
      <div className="flex items-end gap-4 bg-panel px-5 pb-4 pt-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" width={88} height={88} className="h-22 w-22 shrink-0 rounded-2xl bg-panel2 object-cover" style={{ width: 88, height: 88 }} onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
        <div className="min-w-0 pr-8">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-acc-ink"><NflLogo team={d.team} size={18} />{d.pos}{d.team ? ` · ${d.team}` : " · No NFL team"}{d.number ? ` · #${d.number}` : ""}</div>
          <h2 className="h-display mt-1 text-4xl">{d.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {d.age && <span>Age {Math.floor(d.age)}</span>}
            {d.height && <span>{d.height}{d.weight ? ` · ${d.weight} lb` : ""}</span>}
            {d.yearsExp !== null && <span>{d.yearsExp === 0 ? "Rookie" : `${d.yearsExp} yrs exp`}</span>}
            {d.injury && <span className="rounded bg-neg px-1.5 py-0.5 font-bold text-white">{d.injury}{d.injuryPart ? ` · ${d.injuryPart}` : ""}</span>}
          </div>
        </div>
      </div>

      {d.projection && (
        <div className="grid grid-cols-3 gap-2 px-5 py-4">
          <Tile label={`This week${d.projSource === "sleeper" ? " · Sleeper" : ""}`} value={d.projection.median.toFixed(1)} sub={`range ${d.projection.low}–${d.projection.high}${d.projection.opponent ? ` vs ${d.projection.opponent}` : ""}`} />
          <Tile label="Rest of season" value={String(d.projection.ros)} sub="projected pts" />
          <Tile label={d.leagueMode === "dynasty" ? "Dynasty trade value" : "Trade value"} value={d.values ? (d.leagueMode === "dynasty" ? d.values.dynasty : d.values.redraft).toFixed(0) : "—"} sub={d.values ? `${d.pos}${d.leagueMode === "dynasty" ? d.values.posRankDynasty : d.values.posRankRedraft} · out of 100` : ""} accent />
        </div>
      )}
      {d.values && (
        <Info className="-mt-1 px-5">
          <b className="text-fg">Trade value</b> is the SHS model&apos;s score for how much this player is worth in a trade in {d.leagueName}, from 0 to 100 (100 = the league&apos;s most valuable player).{" "}
          {d.leagueMode === "dynasty"
            ? "It weighs production above a replacement starter over the next five seasons, adjusted for age, contract and injury history."
            : <>It&apos;s rest-of-season points above a replacement {d.pos} ({d.replacement?.toFixed(1)} pts/g: whichever is better of the last starter in your league or the best free agent), so positions you can easily fill off waivers count for less. {d.values.rosVorp > 0 ? `${d.values.rosVorp} points above replacement from here on.` : "Not projected above replacement from here on."}</>}{" "}
          It isn&apos;t a points total or a points-per-game rank.
        </Info>
      )}

      <Section title={`Week by week · ${d.leagueName} scoring`}>
        <WeeklyChart weeks={d.weeks} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-acc" />Actual points</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-acc" />Projected</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-fg" />Snap %</span>
        </div>
        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel"><tr className="text-left text-muted"><th className="px-3 py-1.5">Wk</th><th className="px-2 py-1.5">Opp</th><th className="px-2 py-1.5 text-right">Pts</th><th className="px-2 py-1.5 text-right">Proj</th><th className="px-3 py-1.5 text-right">Snap %</th></tr></thead>
            <tbody>
              {d.weeks.map((w) => (
                <tr key={w.week} className="border-t border-line">
                  <td className="num px-3 py-1.5">{w.week}</td>
                  <td className="px-2 py-1.5">{w.bye ? <span className="text-muted">BYE</span> : w.opp ?? "—"}</td>
                  <td className="num px-2 py-1.5 text-right font-semibold">{w.actual !== null ? w.actual.toFixed(1) : ""}</td>
                  <td className="num px-2 py-1.5 text-right text-muted">{w.proj !== null ? w.proj.toFixed(1) : ""}</td>
                  <td className="num px-3 py-1.5 text-right">{w.snap ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Across your leagues">
        <ul className="flex flex-col gap-1.5 text-sm">
          {d.ownership.map((o) => (
            <li key={o.leagueId} className="flex items-center justify-between gap-2">
              <span className="truncate">{o.league}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={cx("text-xs font-semibold", o.mine ? "text-acc-ink" : o.owner === "Free agent" ? "text-pos" : "text-muted")}>{o.owner}{o.mine ? (o.starter ? " · starter" : " · bench") : ""}</span>
                <span className="num w-10 text-right text-xs">{o.value ? o.value.toFixed(0) : "—"}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {d.projection && (
        <Section title="What drives the projection">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Driver label="Points per game (healthy)" value={d.projection.base.toFixed(1)} />
            <Driver label="Opportunity trend" value={d.projection.usage === 1 ? "Steady" : pct(1 + (d.projection.usage - 1) / 0.4)} tone={d.projection.usage > 1 ? "pos" : d.projection.usage < 1 ? "neg" : undefined} />
            {d.extras?.offense && <Driver label="Team offense" value={d.extras.offense} tone={d.projection.env > 1 ? "pos" : d.projection.env < 1 ? "neg" : undefined} />}
            <Driver label="This week's matchup" value={d.projection.matchup === 1 ? "Average" : pct(d.projection.matchup)} tone={d.projection.matchup > 1 ? "pos" : d.projection.matchup < 1 ? "neg" : undefined} />
            {d.extras && <Driver label="Schedule ahead" value={`${pct(d.extras.outlookRos)} rest of season · ${pct(d.extras.outlookPlayoffs)} playoffs`} tone={d.extras.outlookRos > 1.03 ? "pos" : d.extras.outlookRos < 0.97 ? "neg" : undefined} />}
            <Driver label="Confidence" value={d.projection.confidence} />
          </div>
          {d.projection.notes.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted">{d.projection.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </Section>
      )}

      {d.season && (
        <Section title={`Season stats · ${d.season.games} games`}>
          <dl className="flex flex-col gap-1.5 text-sm">{d.season.lines.map((l) => <div key={l.label} className="flex gap-3"><dt className="w-20 shrink-0 text-muted">{l.label}</dt><dd className="num">{l.value}</dd></div>)}</dl>
        </Section>
      )}

      {d.extras && (
        <Section title="Contract, health & history">
          <dl className="flex flex-col gap-1.5 text-sm">
            <Row k="Contract" v={d.extras.contract ?? "No active contract on file"} sub={d.extras.contractNote} />
            <Row k="Availability" v={d.extras.durability} />
            <Row k="Injury reports" v={d.extras.reportsOut ? `Listed Out ${d.extras.reportsOut} week${d.extras.reportsOut > 1 ? "s" : ""}` : "No weeks listed Out"} sub={d.extras.recentInjuries.length ? `Recent: ${d.extras.recentInjuries.join(", ")}` : null} />
            <Row k="Last season" v={d.extras.prevSeason ?? "No games"} />
            {d.draft && <Row k="Drafted" v={d.draft} />}
            {d.college && <Row k="College" v={d.college} />}
          </dl>
          <Info className="mt-3">Contracts: NFLverse (OverTheCap). Injury reports: NFLverse official weekly reports.</Info>
        </Section>
      )}
    </div>
  );
}

const Tile = ({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) => (
  <div className={cx("rounded-xl p-3", accent ? "bg-acc-soft" : "bg-panel")}>
    <div className="text-[11px] text-muted">{label}</div>
    <div className={cx("num font-[family-name:var(--font-display)] text-3xl font-bold leading-tight", accent && "text-acc-ink")}>{value}</div>
    <div className="truncate text-[11px] text-muted">{sub}</div>
  </div>
);
const Driver = ({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) => (
  <div className="rounded-lg bg-panel p-2.5"><div className="text-[11px] text-muted">{label}</div><div className={cx("text-sm font-semibold", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div></div>
);
const Row = ({ k, v, sub }: { k: string; v: string; sub?: string | null }) => (
  <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">{k}</dt><dd>{v}{sub && <div className="text-xs text-muted">{sub}</div>}</dd></div>
);

/** Bars: actual (solid) and projected (dashed outline) points by week; dots: snap %. */
export function WeeklyChart({ weeks }: { weeks: PlayerCardData["weeks"] }) {
  const W = 460, H = 150, pad = 18;
  const max = Math.max(10, ...weeks.map((w) => Math.max(w.actual ?? 0, w.proj ?? 0)));
  const bw = (W - pad) / weeks.length;
  const y = (v: number) => H - 16 - (v / max) * (H - 30);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weekly fantasy points, actual and projected">
      {[0.5, 1].map((f) => <line key={f} x1={pad} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeDasharray="3 3" />)}
      <text x={0} y={y(max) + 4} fontSize="9" fill="var(--muted)">{Math.round(max)}</text>
      {weeks.map((w, i) => {
        const x = pad + i * bw + bw * 0.18;
        const width = bw * 0.64;
        return (
          <g key={w.week}>
            {w.actual !== null && <rect x={x} y={y(w.actual)} width={width} height={Math.max(1, H - 16 - y(w.actual))} rx="2" fill="var(--acc)"><title>{`Week ${w.week}: ${w.actual.toFixed(1)} pts`}</title></rect>}
            {w.proj !== null && w.actual === null && <rect x={x} y={y(w.proj)} width={width} height={Math.max(1, H - 16 - y(w.proj))} rx="2" fill="var(--acc-soft)" stroke="var(--acc)" strokeDasharray="3 2"><title>{`Week ${w.week}: ${w.proj.toFixed(1)} projected`}</title></rect>}
            {w.bye && <text x={x + width / 2} y={H - 20} fontSize="8" textAnchor="middle" fill="var(--muted)">BYE</text>}
            {w.snap !== null && <circle cx={x + width / 2} cy={H - 16 - (w.snap / 100) * (H - 30)} r="2.2" fill="var(--text)"><title>{`Snap ${w.snap}%`}</title></circle>}
            <text x={x + width / 2} y={H - 3} fontSize="9" textAnchor="middle" fill="var(--muted)">{w.week}</text>
          </g>
        );
      })}
    </svg>
  );
}
