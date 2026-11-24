"use client";

import { LeaguePage, Loading, useAsync, type LeagueData } from "@/components/AppData";
import Link from "next/link";
import { formatLabel } from "@/lib/services/portfolio";
import { loadKeeperPlan } from "@/lib/services/keeperData";
import { Notice, PageHeader } from "@/components/ui";
import { KeeperBoard } from "./KeeperBoard";
import { KeeperMarket } from "./KeeperMarket";

export default function KeepersPage() {
  return <LeaguePage>{(d) => <KeepersPageBody {...d} />}</LeaguePage>;
}

function KeepersPageBody({ setup, league, ctx, sp }: LeagueData) {
  const plan = useAsync(() => loadKeeperPlan(setup.settings, league, ctx), [setup, league, ctx]);
  if (ctx.format !== "keeper") return <div className="flex flex-col gap-4"><PageHeader title="Keeper Planner" /><Notice>{league.name} isn&apos;t a keeper league. Pick your keeper league from the league menu.</Notice></div>;
  if (ctx.myRosterId === null) return <Notice tone="warn">You don&apos;t own a team in {league.name}.</Notice>;

  if (!plan.data) return plan.error ? <Notice tone="warn">{plan.error}</Notice> : <Loading label="Loading the draft" />;
  const { rules, rounds, teams, draftType, sleeperMax, rows, note: draftNote, board, order, others, hasPlan, market } = plan.data;
  const teamName = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)?.name ?? `Team ${rid}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={`${league.name} · ${formatLabel(league)} · ${rounds} rounds × ${teams} teams`} title="Keeper Planner" />
      {draftNote && <Notice tone="warn">{draftNote}</Notice>}
      <KeeperBoard leagueId={league.league_id} rows={rows.map((r) => ({ ...r, surplus: Number.isFinite(r.surplus) ? r.surplus : null }))} rules={rules} rounds={rounds} teams={teams} draftType={draftType} sleeperMax={sleeperMax || null} season={Number(league.season) + 1}
        board={board} order={order} others={others} teamName={teamName} myRosterId={ctx.myRosterId} hasPlan={hasPlan} />
      <KeeperMarket market={market} rounds={rounds} partnerLink={(rid, pid) => `/trade/?partner=${rid}&b=p:${pid}`} />
    </div>
  );
}
