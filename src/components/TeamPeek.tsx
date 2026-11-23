"use client";

/** Quick view of any team in the selected league: record, ranks, odds and the full roster. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useApp } from "./AppData";
import { powerRankings, POS_ORDER } from "@/lib/engine/power";
import { ord } from "@/lib/engine/classify";
import { cx, InjuryChip, Logo, NflLogo } from "./ui";
import { PlayerImg } from "./client";
import { PlayerLink } from "./PlayerCard";

const Ctx = createContext<{ open: (rosterId: number) => void }>({ open: () => {} });
export const useTeamPeek = () => useContext(Ctx);

export function TeamPeekProvider({ children }: { children: ReactNode }) {
  const [rid, setRid] = useState<number | null>(null);
  const open = useCallback((r: number) => setRid(r), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setRid(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <div className={cx("fixed inset-0 z-40 transition", rid !== null ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={rid === null}>
        <div className={cx("absolute inset-0 bg-black/50 transition-opacity duration-300", rid !== null ? "opacity-100" : "opacity-0")} onClick={() => setRid(null)} />
        <aside role="dialog" aria-modal="true" aria-label="Team"
          className={cx("absolute bottom-0 right-0 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-bg shadow-2xl transition-transform duration-300 ease-out md:top-0 md:max-h-none md:w-[560px] md:rounded-none md:rounded-l-2xl",
            rid !== null ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full md:translate-y-0")}>
          <button type="button" onClick={() => setRid(null)} aria-label="Close team" className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-panel2"><X size={18} /></button>
          <div className="overflow-y-auto">{rid !== null && <TeamBody rosterId={rid} />}</div>
        </aside>
      </div>
    </Ctx.Provider>
  );
}

/** Team name that opens the quick view. */
export function TeamLink({ rosterId, name, avatar, size = 24, className }: { rosterId: number; name: string; avatar?: string | null; size?: number; className?: string }) {
  const { open } = useTeamPeek();
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); open(rosterId); }} className={cx("flex min-w-0 items-center gap-2 text-left hover:underline", className)}>
      {avatar !== undefined && <Logo src={avatar} name={name} size={size} />}
      <span className="truncate">{name}</span>
    </button>
  );
}

function TeamBody({ rosterId }: { rosterId: number }) {
  const { ctx } = useApp();
  const power = useMemo(() => (ctx ? powerRankings(ctx) : []), [ctx]);
  if (!ctx) return <p className="p-6 text-sm text-muted">Loading…</p>;
  const t = ctx.teams.find((x) => x.rosterId === rosterId);
  if (!t) return <p className="p-6 text-sm text-muted">Team not found.</p>;
  const pw = power.find((p) => p.rosterId === rosterId);
  const mine = rosterId === ctx.myRosterId;
  const dyn = ctx.valuationMode === "dynasty";
  const val = (id: string) => (dyn ? ctx.values.get(id)?.dynasty : ctx.values.get(id)?.redraft) ?? 0;
  const starters = new Set(ctx.lineups.get(rosterId)?.optimal.map((s) => s.playerId).filter(Boolean) as string[]);
  const ids = t.players.filter((id) => ctx.players.has(id));
  const groups = POS_ORDER.map((g) => ({
    g,
    list: ids.filter((id) => { const pos = ctx.players.get(id)!.pos; return g === "IDP" ? ["DL", "LB", "DB"].includes(pos) : pos === g; })
      .sort((a, b) => (ctx.projections.get(b)?.base ?? 0) - (ctx.projections.get(a)?.base ?? 0)),
  })).filter((x) => x.list.length);
  const cls = ctx.showClasses ? ctx.classifications.get(rosterId) : undefined;
  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl bg-panel p-3"><div className="text-[11px] text-muted">{label}</div><div className="num h-display text-2xl">{value}</div>{sub && <div className="text-[11px] text-muted">{sub}</div>}</div>
  );
  return (
    <div className="pb-8">
      <div className="flex items-center gap-4 bg-panel px-5 pb-4 pt-6">
        <Logo src={t.avatar} name={t.name} size={64} />
        <div className="min-w-0 pr-8">
          <div className="text-xs font-semibold uppercase tracking-widest text-acc-ink">{mine ? "Your team" : t.manager}{cls ? ` · ${cls.override ?? cls.primary}` : ""}</div>
          <h2 className="h-display mt-1 truncate text-3xl">{t.name}</h2>
          <div className="text-xs text-muted">{t.wins}–{t.losses}{t.ties ? `–${t.ties}` : ""} · {ord(t.rank)} in standings · {t.pointsFor.toFixed(1)} PF · {t.pointsAgainst.toFixed(1)} PA</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 px-5 py-4">
        {stat("Power rank", pw ? `#${pw.rank}` : "—", pw ? `score ${pw.score}` : undefined)}
        {stat("Playoff odds", `${Math.round(ctx.sim.playoffOdds[rosterId] ?? 0)}%`, `title ${Math.round(ctx.sim.titleOdds[rosterId] ?? 0)}%`)}
        {stat(dyn ? "Dynasty value" : "Best lineup", dyn ? (pw ? `#${pw.dynastyRank}` : "—") : (pw?.startNow.toFixed(1) ?? "—"), dyn ? "roster value rank" : "projected pts this week")}
      </div>
      {pw && (
        <div className="px-5 pb-3">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">Rank by position</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(pw.positions).map(([pos, r]) => (
              <span key={pos} className={cx("rounded-lg px-2 py-1 text-xs font-semibold", r.rank <= Math.ceil(ctx.teamsCount / 3) ? "bg-pos/15 text-pos" : r.rank > ctx.teamsCount - Math.ceil(ctx.teamsCount / 3) ? "bg-neg/15 text-neg" : "bg-panel2")}>
                {pos} {ord(r.rank)}
              </span>
            ))}
          </div>
          {(pw.strengths.length > 0 || pw.weaknesses.length > 0) && (
            <p className="mt-2 text-xs text-muted">{pw.strengths.length > 0 && <>Strong at <b className="text-pos">{pw.strengths.join(", ")}</b>. </>}{pw.weaknesses.length > 0 && <>Thin at <b className="text-neg">{pw.weaknesses.join(", ")}</b>.</>}</p>
          )}
        </div>
      )}
      {groups.map(({ g, list }) => (
        <section key={g} className="border-t border-line px-5 py-3">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">{g}</h3>
          <ul className="flex flex-col gap-2">
            {list.map((id) => {
              const p = ctx.players.get(id)!;
              const pr = ctx.projections.get(id);
              return (
                <li key={id} className="flex items-center gap-2.5 text-sm">
                  <PlayerImg id={id} name={p.name} pos={p.pos} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><PlayerLink id={id} name={p.name} className="font-semibold" /><InjuryChip status={p.injury} />{starters.has(id) && <span className="rounded bg-acc-soft px-1 text-[9px] font-bold uppercase text-acc-ink">Starter</span>}</div>
                    <div className="flex items-center gap-1 text-xs text-muted"><NflLogo team={p.team} size={13} />{p.team ?? "FA"}{p.age ? ` · ${Math.floor(p.age)}y` : ""}{t.reserve.includes(id) ? " · IR" : t.taxi.includes(id) ? " · Taxi" : ""}</div>
                  </div>
                  <div className="w-14 text-right"><div className="num font-semibold">{pr?.median.toFixed(1) ?? "—"}</div><div className="text-[10px] text-muted">this wk</div></div>
                  <div className="w-12 text-right"><div className="num font-semibold text-acc-ink">{val(id).toFixed(0)}</div><div className="text-[10px] text-muted">value</div></div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="px-5 pt-2 text-[11px] text-muted">Value = SHS trade value, 0–100 in this league. Tap a player for their card.</p>
    </div>
  );
}
