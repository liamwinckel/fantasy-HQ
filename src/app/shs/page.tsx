"use client";

/** SHS AI Lab: what it is, the backtest in full, and the live record. */
import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { BacktestDetail, useBacktest } from "@/components/Backtest";
import { ShsExplainer } from "@/components/ShsAiParts";
import { Card, PageHeader } from "@/components/ui";
import { accuracy } from "@/lib/services/accuracy";
import Link from "next/link";

export default function ShsPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

function Body({ ctx, league }: LeagueData) {
  const bt = useBacktest(ctx);
  const live = useAsync(() => accuracy(ctx), [ctx]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader eyebrow={league.name} title="SHS AI Lab" />
      <Card title="What SHS AI is"><ShsExplainer scope="week" /><Link href="/settings/" className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">Adjust weights in Settings</Link></Card>
      <Card title="Backtest · this season">
        {bt.loading && <p className="text-sm text-muted">Replaying past weeks{bt.prog ? ` · ${bt.prog[0]}/${bt.prog[1]}` : ""}…</p>}
        {!bt.loading && !bt.data && <p className="text-sm text-muted">Past weeks&apos; expert rankings aren&apos;t available yet; they arrive with the next data refresh.</p>}
        {bt.data && <BacktestDetail r={bt.data} />}
      </Card>
      {live.data && (
        <Card title="Live record (with betting lines & weather)">
          <p className="text-sm">Experts {live.data.experts.toFixed(1)}% · SHS AI {live.data.shs.toFixed(1)}% · Sleeper {live.data.sleeper.toFixed(1)}% picks right over {live.data.weeks.length} week{live.data.weeks.length === 1 ? "" : "s"} saved on this device.</p>
        </Card>
      )}
    </div>
  );
}
