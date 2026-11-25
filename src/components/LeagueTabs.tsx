"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Logo, cx } from "./ui";
import { leagueColour } from "@/lib/leagueColour";
import { formatLabel } from "@/lib/services/portfolio";
import { ord } from "@/lib/engine/classify";
import type { League } from "@/lib/sleeper/types";
import type { LeagueContext } from "@/lib/services/league";

/**
 * Top of a league: the league's colour band (same as its Home widget) with back, logo, name and format, and the
 * Matchup / Overview switch as a full-width segmented control underneath.
 */
let lastView: "matchup" | "overview" | null = null;

export function LeagueHero({ league, ctx, view }: { league: League; ctx: LeagueContext; view: "matchup" | "overview" }) {
  const colour = leagueColour(league.league_id);
  const avatar = league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null;
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  // The two views are separate screens, so the highlight starts where the last one left it and slides over.
  const idx = view === "matchup" ? 0 : 1;
  const [at, setAt] = useState(() => (lastView && lastView !== view ? 1 - idx : idx));
  useEffect(() => { const r = requestAnimationFrame(() => setAt(idx)); lastView = view; return () => cancelAnimationFrame(r); }, [idx, view]);
  const tab = (v: "matchup" | "overview", label: string, href: string) => (
    <Link href={href} role="tab" aria-selected={view === v} replace
      className={cx("relative z-10 flex-1 rounded-xl py-2.5 text-center text-sm font-bold transition-colors duration-300", view === v ? "text-fg" : "text-fg/70 hover:text-fg")}>
      {label}
    </Link>
  );
  return (
    <div className="-mx-3 -mt-5 px-3 pb-1 pt-4 sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-5" style={{ backgroundImage: `linear-gradient(170deg, ${colour}73 0%, ${colour}26 55%, transparent 100%)` }}>
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="All leagues" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg/60 backdrop-blur"><ChevronLeft size={20} /></Link>
        <Logo src={avatar} name={league.name} size={44} square />
        <div className="min-w-0 flex-1">
          <div className="h-display line-clamp-2 text-[22px] leading-[1.05]">{league.name}</div>
          <div className="mt-1 truncate text-[11px] font-semibold text-fg/70">{ctx.teamsCount} teams · {formatLabel(league)} · {ctx.scoring}</div>
        </div>
        {me && (
          <div className="shrink-0 text-right">
            <div className="h-display text-2xl leading-none">{me.wins}–{me.losses}{me.ties ? `–${me.ties}` : ""}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg/70">{ord(me.rank)} place</div>
          </div>
        )}
      </div>
      <div role="tablist" aria-label="League view" className="relative mt-4 flex gap-1 rounded-2xl bg-panel2/70 p-1 backdrop-blur">
        <span aria-hidden className="absolute inset-y-1 left-1 rounded-xl bg-bg shadow-sm transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: "calc(50% - 6px)", transform: `translateX(calc(${at * 100}% + ${at * 4}px))` }} />
        {tab("matchup", "Matchup", "/matchup/")}
        {tab("overview", "Overview", "/matchup/?view=overview")}
      </div>
    </div>
  );
}

