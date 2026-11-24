"use client";

import { useApp } from "@/components/AppData";
import { leagueFormat } from "@/lib/services/league";
import { ago } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { Loading } from "@/components/AppData";
import { SettingsForm, type LeagueRow } from "./SettingsForm";
import { ShsSettings } from "./ShsSettings";
import { sleeper } from "@/lib/sleeper/client";
import { useEffect, useState } from "react";
import type { League } from "@/lib/sleeper/types";

export default function SettingsPage() {
  const { setup, synced } = useApp();
  const [all, setAll] = useState<League[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!setup) return;
    const s = setup.settings;
    if (!s.userId) { setAll([]); return; }
    (async () => {
      try {
        const found = (await sleeper.leagues(s.userId!, setup.season)).data;
        const manual = await Promise.all(s.manualLeagueIds.filter((id) => !found.some((l) => l.league_id === id)).map((id) => sleeper.league(id).then((r) => r.data).catch(() => null)));
        setAll([...found, ...(manual.filter(Boolean) as League[])]);
      } catch (e) {
        setError((e as Error).message);
        setAll([]);
      }
    })();
  }, [setup]);
  if (!setup || !all) return <Loading label="Loading settings" />;
  const s = setup.settings;
  const rows: LeagueRow[] = all.map((l) => ({
    id: l.league_id, name: l.name, format: leagueFormat(l), teams: l.total_rosters, hidden: s.hiddenLeagues.includes(l.league_id),
    manual: s.manualLeagueIds.includes(l.league_id), override: s.leagueModeOverrides[l.league_id] ?? "auto",
    avatar: l.avatar ? `https://sleepercdn.com/avatars/thumbs/${l.avatar}` : null,
  }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="System" title="Settings" />
      <SettingsForm username={s.username} userId={s.userId} season={setup.season} seasonPinned={!!s.season} leagues={rows} error={error ?? (setup.errors.join(" ") || null)} synced={ago(synced)} />
      <ShsSettings />
    </div>
  );
}
