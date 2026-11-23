"use client";

import { LeaguePage, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { pickValue } from "@/lib/engine/picks";
import { Notice, PageHeader } from "@/components/ui";
import { TradeAnalyzer, type TeamOpt } from "./TradeAnalyzer";

export default function TradePage() {
  return <LeaguePage>{(d) => <TradePageBody {...d} />}</LeaguePage>;
}

function TradePageBody({ setup, league, ctx, sp }: LeagueData) {
  if (ctx.myRosterId === null) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;
  const leagueId = league.league_id;
  const mode = ctx.valuationMode;
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
            value: v ? (mode === "redraft" ? v.redraft : v.dynasty) : 0, injury: p.injury,
          };
        }).sort((a, b) => b.value - a.value),
        ...ctx.picks.filter((k) => k.ownerRosterId === t.rosterId).map((k) => ({
          id: `k:${k.key}`, kind: "pick" as const, name: `${k.season} Round ${k.round}`, pos: "PICK", team: null,
          sub: `${k.originalRosterId === t.rosterId ? "Own" : `via ${ctx.teams.find((x) => x.rosterId === k.originalRosterId)?.name ?? "?"}`} · ${k.tier}${k.tierSource === "estimated" ? " (est.)" : k.tierSource === "default" ? " (slot unknown)" : ""}`,
          value: mode === "dynasty" ? k.value : 0, injury: null, tier: k.tier,
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
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${ctx.scoring}${ctx.superflex ? " · Superflex" : ""} · ${ctx.teamsCount} teams`} title="Trade Analyzer" />
      {ctx.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      <TradeAnalyzer
        key={`${leagueId}:${sp.partner ?? ""}:${sp.a ?? ""}:${sp.b ?? ""}`}
        leagueId={leagueId}
        mode={mode}
        me={ctx.myRosterId}
        teams={teams}
        initialPartner={partner}
        initialA={sp.a ? sp.a.split(",") : []}
        initialB={sp.b ? sp.b.split(",") : []}
      />
    </div>
  );
}
