"use client";

/** Home: one check across every league before kickoff: lineup problems, exposure, and starters working against each other. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown } from "lucide-react";
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
  // Collapsed by default; tap to expand.
  const [isOpen, setOpen] = useState(false);
  if (!c.leaguesChecked) return null;
  const go = (leagueId: string) => { selectLeague(leagueId); router.push(`/matchup/?league=${leagueId}`); };
  const byLeague = new Map<string, Issue[]>();
  for (const i of c.issues) (byLeague.get(i.leagueId) ?? byLeague.set(i.leagueId, []).get(i.leagueId)!).push(i);
  const clear = !c.issues.length;
  const summary = clear ? `All clear in ${c.leaguesChecked} league${c.leaguesChecked > 1 ? "s" : ""}` : [high ? `${high} to fix` : null, watch ? `${watch} to watch` : null].filter(Boolean).join(" · ");
  const leagueIds = ctxs.filter((x) => x.myRosterId !== null && !x.seasonOver).map((x) => x.league.league_id);
  return (
    <section className={cx("relative overflow-hidden rounded-2xl border bg-panel", clear ? "border-pos/30" : high ? "border-neg/35" : "border-warn/35")}>
      {/* state glow */}
      <span aria-hidden className={cx("pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full blur-3xl", clear ? "bg-pos/15" : high ? "bg-neg/20" : "bg-warn/15")} />
      <button type="button" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen} className="relative flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center">
          {!clear && <span aria-hidden className={cx("absolute inset-0 rounded-full motion-safe:animate-ping opacity-30", high ? "bg-neg" : "bg-warn")} style={{ animationDuration: "2.4s" }} />}
          <span className={cx("relative grid h-11 w-11 place-items-center rounded-full border-2", clear ? "border-pos bg-pos/15 text-pos" : high ? "border-neg bg-neg/15 text-neg" : "border-warn bg-warn/15 text-warn")}>
            {clear ? <CheckCircle2 size={22} /> : <span className="num text-lg font-extrabold leading-none">{high || watch}</span>}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">Game-day check</div>
          <div className="truncate text-[15px] font-bold">{summary}{c.conflicts.length ? <span className="font-semibold text-muted"> · {c.conflicts.length} conflict{c.conflicts.length > 1 ? "s" : ""}</span> : null}</div>
          {/* one chip per league: colour + how many problems there */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {leagueIds.map((id) => {
              const list = byLeague.get(id) ?? [];
              const hi = list.filter((i) => i.severity === "high").length;
              return (
                <span key={id} className={cx("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold", hi ? "border-neg/40 text-neg" : list.length ? "border-warn/40 text-warn" : "border-line text-muted")}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: leagueColour(id) }} />
                  {list.length ? list.length : <CheckCircle2 size={10} />}
                </span>
              );
            })}
          </div>
        </div>
        <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-panel2 text-muted transition-transform duration-300", isOpen && "rotate-180")}><ChevronDown size={16} /></span>
      </button>
      <div className={cx("relative grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="min-h-0 overflow-hidden">
      {(
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
      </div>
      </div>
    </section>
  );
}
