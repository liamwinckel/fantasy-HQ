"use client";

/** Dynasty window: projected lineup strength rank this season and the next two, for every team. */
import { useMemo } from "react";
import { Card, cx } from "./ui";
import { dynastyWindow } from "@/lib/services/dynastyWindow";
import type { LeagueContext } from "@/lib/services/league";

export function DynastyWindowCard({ ctx }: { ctx: LeagueContext }) {
  const w = useMemo(() => dynastyWindow(ctx), [ctx]);
  const me = w.rows.find((r) => r.rosterId === ctx.myRosterId);
  const best = me ? me.ranks.indexOf(Math.min(...me.ranks)) : 0;
  const n = w.rows.length;
  return (
    <Card title="Title window · next 3 seasons" pad={false} info={<>Each roster&apos;s best possible lineup in healthy points per game, aged forward with each position&apos;s age curve (young players improve, RBs fade from 27, WRs and TEs from 30, QBs from 34). Ranks are within the league. It doesn&apos;t include future rookie picks or trades, so use it to see who is rising and who is about to fall.</>}>
      {me && <p className="px-4 pb-2 pt-1 text-sm sm:px-5">Your window is <b>{w.seasons[best]}</b>: projected #{me.ranks[best]} of {n}. {me.trend === "fading" ? "Your roster is getting older; consider selling ageing starters for younger players or picks." : me.trend === "rising" ? "Your roster is getting better with age; trading future picks for help now can make sense." : "Your strength holds steady."}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.25rem)] gap-2 border-y border-line bg-panel2/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:px-5"><span>Team</span>{w.seasons.map((s) => <span key={s} className="text-right">{s}</span>)}</div>
      <ul className="divide-y divide-line">
        {w.rows.map((r) => (
          <li key={r.rosterId} className={cx("grid grid-cols-[minmax(0,1fr)_repeat(3,3.25rem)] items-center gap-2 px-4 py-1.5 text-sm sm:px-5", r.rosterId === ctx.myRosterId && "bg-acc-soft")}>
            <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-semibold">{r.name}</span>{r.trend !== "steady" && <span className={cx("shrink-0 text-[10px] font-bold uppercase", r.trend === "rising" ? "text-pos" : "text-neg")}>{r.trend === "rising" ? "▲ rising" : "▼ fading"}</span>}</span>
            {r.ranks.map((k, i) => <span key={i} className={cx("num text-right font-bold", k <= Math.ceil(n / 4) ? "text-pos" : k > n - Math.ceil(n / 4) ? "text-neg" : "text-muted")}>#{k}</span>)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
