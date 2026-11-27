"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { pickValue } from "@/lib/engine/picks";
import { Notice, PageHeader } from "@/components/ui";
import { TradeAnalyzer, type TeamOpt, type View } from "./TradeAnalyzer";

export default function TradePage() {
  return <LeaguePage>{(d) => <TradePageBody {...d} />}</LeaguePage>;
}

function TradePageBody({ setup, league, ctx, sp }: LeagueData) {
  if (ctx.myRosterId === null) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;
  const leagueId = league.league_id;
  // Value views on offer: dynasty and redraft everywhere; keeper leagues add keeper (rest of season + keep value).
  const views: View[] = ctx.format === "keeper" ? ["keeper", "redraft", "dynasty"] : ctx.valuationMode === "dynasty" ? ["dynasty", "redraft"] : ["redraft", "dynasty"];
  const teams: TeamOpt[] = ctx.teams.map((t) => {
    const cls = ctx.showClasses ? ctx.classifications.get(t.rosterId) : undefined;
    return {
      rosterId: t.rosterId, name: t.name, manager: t.manager, avatar: t.avatar, record: `${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ""}`,
      cls: cls ? cls.override ?? cls.primary : null, conf: cls?.confidence ?? null, overridden: !!cls?.override,
      playoff: ctx.sim.playoffOdds[t.rosterId] ?? 0, title: ctx.sim.titleOdds[t.rosterId] ?? 0,
      assets: [
        ...t.players.filter((pid) => ctx.players.has(pid)).map((pid) => {
          const p = ctx.players.get(pid)!;
          const v = ctx.values.get(pid);
          return {
            id: `p:${pid}`, kind: "player" as const, name: p.name, pos: p.pos, team: p.team, sub: `${p.pos}${p.team ? ` · ${p.team}` : ""}${p.age ? ` · ${Math.floor(p.age)}` : ""}`,
            value: 0, injury: p.injury,
            values: { redraft: v ? v.redraftOnly ?? v.redraft : 0, keeper: v?.redraft ?? 0, dynasty: v?.dynasty ?? 0 },
          };
        }),
        ...ctx.picks.filter((k) => k.ownerRosterId === t.rosterId).map((k) => ({
          id: `k:${k.key}`, kind: "pick" as const, name: `${k.season} Round ${k.round}`, pos: "PICK", team: null,
          sub: `${k.originalRosterId === t.rosterId ? "Own" : `via ${ctx.teams.find((x) => x.rosterId === k.originalRosterId)?.name ?? "?"}`} · ${k.tier}${k.tierSource === "estimated" ? " (est.)" : k.tierSource === "default" ? " (slot unknown)" : ""}`,
          value: 0, injury: null, tier: k.tier, values: { redraft: k.keeperValue ?? 0, keeper: k.keeperValue ?? 0, dynasty: k.value },
          tierValues: { early: pickValue({ round: k.round, tier: "early", teams: ctx.teamsCount, superflex: ctx.superflex, yearsOut: Number(k.season) - Number(ctx.league.season) - 1 }),
            mid: pickValue({ round: k.round, tier: "mid", teams: ctx.teamsCount, superflex: ctx.superflex, yearsOut: Number(k.season) - Number(ctx.league.season) - 1 }),
            late: pickValue({ round: k.round, tier: "late", teams: ctx.teamsCount, superflex: ctx.superflex, yearsOut: Number(k.season) - Number(ctx.league.season) - 1 }) },
        })),
      ],
    };
  });
  const others = teams.filter((t) => t.rosterId !== ctx.myRosterId);
  const partner = Number(sp.partner) && others.some((t) => t.rosterId === Number(sp.partner)) ? Number(sp.partner) : others[0]?.rosterId;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}${ctx.superflex ? " · Superflex" : ""} · ${ctx.teamsCount} teams`} title="Trade Analyzer" info={<>
        <p><b>How values work.</b> Every player is projected in <b>this league&apos;s exact scoring</b> — PPR level, bonuses, TE premium, superflex, even kick/punt return yards — then valued by points above a replacement starter for your roster size and lineup.</p>
        <p className="mt-2">{ctx.format === "dynasty" ? "Dynasty: the FantasyPros/DynastyProcess market, blended with our model for age, role and durability." : ctx.format === "keeper" ? "Keeper: rest-of-season value plus next season's keep value — his projected points over what his keep round usually returns, using your keeper rules." : "Redraft: rest-of-season points, weighted toward the playoff weeks."} Expert ranks count for less when a player scores in ways they ignore (e.g. return yards). Picks are valued as the player usually taken there.</p>
        <p className="mt-2"><b>Why it beats generic trade charts:</b> those use one standard scoring setup for every league. These numbers are built for your league&apos;s settings, roster, rules and schedule.</p>
      </>} />
      {ctx.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      <TradeAnalyzer
        key={`${leagueId}:${sp.partner ?? ""}:${sp.a ?? ""}:${sp.b ?? ""}`}
        leagueId={leagueId}
        views={views}
        me={ctx.myRosterId}
        teams={teams}
        initialPartner={partner}
        initialA={sp.a ? sp.a.split(",") : []}
        initialB={sp.b ? sp.b.split(",") : []}
      />
    </div>
  );
}
