"use client";

/** Who should I start: pick 2–4 players with their photos, see who's most likely to score the most this week. */
import { useMemo, useState } from "react";
import { LeaguePage, useQuery, type LeagueData } from "@/components/AppData";
import { Card, InjuryChip, NflLogo, PageHeader, cx } from "@/components/ui";
import { PlayerPhoto } from "@/components/client";
import { PlayerLink } from "@/components/PlayerCard";
import { Sheet } from "@/components/Sheet";
import { startSit } from "@/lib/services/startSit";
import { Plus, X, Search } from "lucide-react";
import { surname } from "@/lib/names";

export default function StartSitPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

const SKILL = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"];

function Body({ league, ctx, sp }: LeagueData) {
  const { set } = useQuery();
  const week = Math.min(ctx.currentWeek, ctx.lastWeek);
  const ids = (sp.ids ?? "").split(",").filter((id) => ctx.players.has(id)).slice(0, 4);
  const setIds = (next: string[]) => set({ ids: next.join(",") }, true);
  const [picking, setPicking] = useState(false);
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  const rows = useMemo(() => (ids.length >= 2 ? startSit(ctx, ids, week) : []), [ctx, ids.join(","), week]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = rows.length ? [...rows].sort((a, b) => b.best - a.best)[0] : null;
  const maxC = Math.max(25, ...rows.map((r) => r.dist.ceiling));
  // Quick picks: your closest start/sit calls (lowest starter vs best bench player at each position).
  const quick = useMemo(() => {
    if (!me) return [];
    const proj = (id: string) => ctx.projections.get(id)?.median ?? 0;
    const out: { label: string; ids: string[] }[] = [];
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const st = me.starters.filter((id) => ctx.players.get(id)?.pos === pos).sort((a, b) => proj(a) - proj(b));
      const bn = me.players.filter((id) => !me.starters.includes(id) && ctx.players.get(id)?.pos === pos && !me.reserve.includes(id)).sort((a, b) => proj(b) - proj(a));
      if (st[0] && bn[0]) out.push({ label: `${pos}: ${surname(ctx.players.get(st[0])!.name)} or ${surname(ctx.players.get(bn[0])!.name)}`, ids: [st[0], bn[0], ...(bn[1] && pos !== "QB" ? [bn[1]] : [])] });
    }
    return out;
  }, [ctx, me]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · week ${week}`} title="Who should I start?"
        info={<>Each player&apos;s week is a range, not one number: his projection this week (usage, matchup, Vegas, injuries, betting lines when posted) and how much he usually swings. We play out 20,000 versions of the week and count how often each one scores the most. Floor = a bad week (1 in 10 worse), ceiling = a great week (1 in 10 better).</>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => {
          const id = ids[i];
          const p = id ? ctx.players.get(id) : null;
          const r = rows.find((x) => x.id === id);
          if (!p) return (
            <button key={i} type="button" onClick={() => setPicking(true)} disabled={i > ids.length}
              className={cx("flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold transition-colors", i > ids.length ? "border-line/40 text-muted/40" : "border-line text-muted hover:border-acc hover:text-fg")}>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel2"><Plus size={22} /></span>{i < 2 ? "Add player" : "Add another"}
            </button>
          );
          const win = best && best.id === id;
          return (
            <div key={id} className={cx("relative flex aspect-[3/4] flex-col items-center justify-between rounded-2xl border p-3 text-center", win ? "border-acc bg-acc-soft" : "border-line bg-panel")}>
              <button type="button" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={`Remove ${p.name}`} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-panel2 text-muted"><X size={14} /></button>
              {win && <span className="absolute left-2 top-2 rounded-full bg-acc px-2 py-0.5 text-[10px] font-extrabold uppercase text-on-acc">Start</span>}
              <div className="mt-3"><PlayerPhoto id={id} name={p.name} pos={p.pos} size={72} /></div>
              <div className="min-w-0">
                <div className="flex items-center justify-center gap-1 truncate font-bold"><PlayerLink id={id} name={p.name} />{p.injury && <InjuryChip status={p.injury} />}</div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-muted"><NflLogo team={p.team} size={12} />{p.pos} · {r?.bye ? "BYE" : r?.opp ? `vs ${r.opp}` : p.team ?? "FA"}</div>
              </div>
              {r ? <div><div className={cx("num font-[family-name:var(--font-display)] text-3xl font-bold leading-none", win && "text-acc-ink")}>{r.best.toFixed(0)}%</div><div className="text-[10px] text-muted">chance he scores most</div></div>
                : <div className="text-[11px] text-muted">Add one more to compare</div>}
            </div>
          );
        })}
      </div>

      {ids.length < 2 && quick.length > 0 && (
        <Card title="Your closest calls this week">
          <div className="flex flex-wrap gap-2">{quick.map((q) => <button key={q.label} type="button" onClick={() => setIds(q.ids)} className="rounded-full border border-line bg-panel2 px-3 py-1.5 text-xs font-semibold hover:border-acc">{q.label}</button>)}</div>
        </Card>
      )}

      {rows.length >= 2 && best && (
        <Card title="The call">
          <p className="text-base"><b>Start {best.name}.</b> He scores the most in {best.best.toFixed(0)}% of simulated weeks{rows.length === 2 ? "" : ` against ${rows.length - 1} others`}.{best.best < 100 / rows.length + 8 ? " It's close: go with your gut or the matchup." : ""}</p>
          <div className="mt-4 flex flex-col gap-4">
            {[...rows].sort((a, b) => b.dist.mean - a.dist.mean).map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><PlayerPhoto id={r.id} name={r.name} pos={r.pos} size={26} /><b className="truncate">{r.name}</b></span>
                  <span className="num shrink-0 text-xs"><b className="text-base">{r.dist.mean.toFixed(1)}</b> <span className="text-muted">proj</span></span>
                </div>
                {/* range bar: floor → ceiling, dot = projection */}
                <div className="relative h-3 rounded-full bg-panel2">
                  <div className={cx("absolute inset-y-0 rounded-full", r.id === best.id ? "bg-acc/50" : "bg-muted/40")} style={{ left: `${(r.dist.floor / maxC) * 100}%`, width: `${((r.dist.ceiling - r.dist.floor) / maxC) * 100}%` }} />
                  <div className={cx("absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg", r.id === best.id ? "bg-acc" : "bg-fg")} style={{ left: `${(r.dist.mean / maxC) * 100}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted"><span>Floor {r.dist.floor.toFixed(1)}</span><span>Boom {r.dist.boom}% · Bust {r.dist.bust}%</span><span>Ceiling {r.dist.ceiling.toFixed(1)}</span></div>
                {r.reasons.length > 0 && <div className="mt-1 text-xs text-muted">{r.reasons.join(" · ")}</div>}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted">Boom = scores {rows[0].dist.boomLine}+ (QB/RB/WR/TE thresholds by position); bust = under {rows[0].dist.bustLine}. Need a safe floor when you&apos;re favoured, a big ceiling when you&apos;re the underdog.</p>
        </Card>
      )}

      <Picker open={picking} onClose={() => setPicking(false)} ctx={ctx} taken={ids} onPick={(id) => { setIds([...ids, id]); setPicking(false); }} />
    </div>
  );
}

function Picker({ open, onClose, ctx, taken, onPick }: { open: boolean; onClose: () => void; ctx: LeagueData["ctx"]; taken: string[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  const proj = (id: string) => ctx.projections.get(id)?.median ?? 0;
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const pool = qq ? [...ctx.players.values()].filter((p) => p.name.toLowerCase().includes(qq)) : (me?.players ?? []).map((id) => ctx.players.get(id)!).filter(Boolean);
    return pool.filter((p) => SKILL.includes(p.pos) && !taken.includes(p.id) && (pos === "ALL" || p.pos === pos)).sort((a, b) => proj(b.id) - proj(a.id)).slice(0, 40);
  }, [q, pos, ctx, me, taken]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open={open} onClose={onClose} title="Add a player" sub={q ? "Search results" : "Your roster"} full>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-panel2 px-3"><Search size={16} className="text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any player" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto">{["ALL", "QB", "RB", "WR", "TE"].map((p) => <button key={p} type="button" onClick={() => setPos(p)} className={cx("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", pos === p ? "border-acc bg-acc text-on-acc" : "border-line text-muted")}>{p}</button>)}</div>
      <div className="grid grid-cols-3 gap-2 pb-6 sm:grid-cols-4">
        {list.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-panel p-2.5 text-center transition-transform active:scale-95 hover:border-acc">
            <PlayerPhoto id={p.id} name={p.name} pos={p.pos} size={52} />
            <span className="w-full truncate text-xs font-bold">{p.name}</span>
            <span className="text-[10px] text-muted">{p.pos} · {p.team ?? "FA"} · {proj(p.id).toFixed(1)}</span>
          </button>
        ))}
        {!list.length && <p className="col-span-full text-sm text-muted">No players found.</p>}
      </div>
    </Sheet>
  );
}
