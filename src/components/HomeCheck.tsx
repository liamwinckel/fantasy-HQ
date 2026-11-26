"use client";

/** Home: one check across every league before kickoff: lineup problems, exposure, and starters working against each other. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { useApp } from "@/components/AppData";
import { cx } from "@/components/ui";
import { crossLeague, type Issue } from "@/lib/services/crossLeague";
import type { LeagueContext } from "@/lib/services/league";
import { leagueColour } from "@/lib/leagueColour";

export function HomeCheck({ ctxs }: { ctxs: LeagueContext[] }) {
  const { selectLeague } = useApp();
  const router = useRouter();
  const c = crossLeague(ctxs);
  const high = c.issues.filter((i) => i.severity === "high").length;
  const watch = c.issues.length - high;
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? high > 0;
  if (!c.leaguesChecked) return null;
  const go = (leagueId: string) => { selectLeague(leagueId); router.push(`/matchup/?league=${leagueId}`); };
  const byLeague = new Map<string, Issue[]>();
  for (const i of c.issues) (byLeague.get(i.leagueId) ?? byLeague.set(i.leagueId, []).get(i.leagueId)!).push(i);
  const clear = !c.issues.length;
  const summary = clear ? `All clear in ${c.leaguesChecked} league${c.leaguesChecked > 1 ? "s" : ""}` : [high ? `${high} to fix` : null, watch ? `${watch} to watch` : null].filter(Boolean).join(" · ");
  return (
    <section className="rounded-2xl border border-line bg-panel">
      <button type="button" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {clear ? <CheckCircle2 size={20} className="shrink-0 text-pos" /> : <AlertTriangle size={20} className={cx("shrink-0", high ? "text-neg" : "text-acc-ink")} />}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Game-day check</div>
          <div className="truncate text-sm font-semibold">{summary}{c.conflicts.length ? ` · ${c.conflicts.length} conflict${c.conflicts.length > 1 ? "s" : ""}` : ""}</div>
        </div>
        <ChevronDown size={18} className={cx("shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="flex flex-col gap-4 border-t border-line px-4 pb-4 pt-3">
          {[...byLeague].map(([id, list]) => (
            <button key={id} type="button" onClick={() => go(id)} className="flex flex-col gap-1.5 rounded-xl bg-panel2 p-3 text-left">
              <div className="flex items-center gap-2 text-xs font-bold"><span className="h-2 w-2 rounded-full" style={{ background: leagueColour(id) }} />{list[0].league}<span className="ml-auto text-[11px] font-semibold text-muted">Open matchup →</span></div>
              {list.map((i, k) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", i.severity === "high" ? "bg-neg" : "bg-acc")} />{i.text}
                </div>
              ))}
            </button>
          ))}
          {clear && <p className="text-sm text-muted">No injured, bye-week or empty starters, and every lineup is already optimal.</p>}
          {c.conflicts.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Working against yourself</div>
              {c.conflicts.map((x, k) => (
                <button key={k} type="button" onClick={() => go(x.leagueId)} className="flex w-full items-start gap-2 py-1 text-left text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: leagueColour(x.leagueId) }} /><span><b>{x.league}:</b> {x.text}</span>
                </button>
              ))}
            </div>
          )}
          {c.exposure.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Your week rides on</div>
              <div className="flex flex-col divide-y divide-line">
                {c.exposure.slice(0, 8).map((e) => (
                  <div key={e.playerId} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold">{e.name} <span className="text-xs font-normal text-muted">{e.pos}{e.team ? ` · ${e.team}` : ""}</span>{e.injury && <span className="ml-1 text-xs font-bold text-neg">{e.injury === "Questionable" ? "Q" : e.injury}</span>}</span>
                    <span className="flex shrink-0 gap-1">{e.leagues.map((l) => <span key={l.leagueId} title={`${l.league}${l.starting ? " (starting)" : " (bench)"}`} className={cx("h-2.5 w-2.5 rounded-full", !l.starting && "opacity-30")} style={{ background: leagueColour(l.leagueId) }} />)}</span>
                    <span className="num w-16 shrink-0 text-right text-xs text-muted">starts {e.starting}/{e.leagues.length}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
