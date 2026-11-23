"use client";

import { useState } from "react";
import { Card, Logo } from "@/components/ui";
import { applySettings, exportSettings, importSettings, type SettingsAction } from "@/lib/actions";
import { RefreshButton } from "@/components/client";

export interface LeagueRow { id: string; name: string; format: string; teams: number; hidden: boolean; manual: boolean; override: string; avatar: string | null }

export function SettingsForm({ username, userId, season, seasonPinned, leagues, error, synced }: {
  username: string | null; userId: string | null; season: string; seasonPinned: boolean; leagues: LeagueRow[]; error: string | null; synced: string;
}) {
  const [msg, setMsg] = useState<string | null>(error);
  const [name, setName] = useState(username ?? "");
  const [leagueId, setLeagueId] = useState("");
  const [seasonVal, setSeasonVal] = useState(seasonPinned ? season : "");
  const [code, setCode] = useState("");
  const post = async (body: SettingsAction, ok?: string) => {
    setMsg(null);
    try {
      await applySettings(body);
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const input = "rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm";
  const btn = "rounded-lg bg-acc px-4 py-2.5 text-sm font-bold text-on-acc";
  const ghost = "rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-panel2";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {msg && <div className="rounded-lg bg-acc-soft px-3 py-2 text-sm lg:col-span-2">{msg}</div>}
      <Card title="Sleeper account">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); post({ username: name }, "Connected."); }}>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">Username or user ID
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="none" />
          </label>
          <button className={btn}>Connect</button>
        </form>
        <p className="mt-2 text-xs text-muted">{userId ? `User ID ${userId}` : "Not connected"} · Last sync {synced}</p>
        <div className="mt-3"><RefreshButton /></div>
      </Card>

      <Card title="Season">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); post({ season: seasonVal || null }, seasonVal ? `Pinned to ${seasonVal}.` : "Following Sleeper's current season."); }}>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">Season (blank = follow Sleeper)
            <input className={input} value={seasonVal} onChange={(e) => setSeasonVal(e.target.value)} placeholder={season} inputMode="numeric" />
          </label>
          <button className={btn}>Save</button>
        </form>
        <p className="mt-2 text-xs text-muted">Showing {season}. Earlier seasons work for anything Sleeper still serves.</p>
      </Card>

      <Card title="Leagues" className="lg:col-span-2" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-5 py-2.5">League</th><th className="px-2 py-2.5">Sleeper format</th><th className="px-2 py-2.5" title="Fantasy HQ values each league by its own format. Change only if a league plays differently from its Sleeper setting.">Valuation (advanced)</th><th className="px-5 py-2.5 text-right">Tracking</th>
            </tr></thead>
            <tbody>
              {leagues.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-5 py-3"><div className="flex items-center gap-2 font-semibold"><Logo src={l.avatar} name={l.name} size={26} />{l.name}</div><div className="text-xs text-muted">{l.teams} teams · ID {l.id}{l.manual && " · added manually"}</div></td>
                  <td className="px-2 py-3 capitalize">{l.format}</td>
                  <td className="px-2 py-3">
                    <select aria-label={`Valuation for ${l.name}`} className={input} value={l.override} onChange={(e) => post({ leagueMode: { leagueId: l.id, mode: e.target.value as "auto" | "redraft" | "dynasty" } })}>
                      <option value="auto">Auto ({l.format === "dynasty" ? "Dynasty" : "Redraft"})</option>
                      <option value="redraft">Redraft</option>
                      <option value="dynasty">Dynasty</option>
                    </select>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button className={ghost} onClick={() => post(l.hidden ? { showLeague: l.id } : { hideLeague: l.id })}>{l.hidden ? "Hidden. Show" : "Hide"}</button>
                    {l.manual && <button className={`${ghost} ml-2`} onClick={() => post({ removeLeagueId: l.id })}>Remove</button>}
                  </td>
                </tr>
              ))}
              {!leagues.length && <tr><td className="px-5 py-4 text-muted" colSpan={4}>No leagues found yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <form className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-4" onSubmit={(e) => { e.preventDefault(); post({ addLeagueId: leagueId.trim() }, "League added."); setLeagueId(""); }}>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">Add a league by ID (if it&apos;s missing above)
            <input className={input} value={leagueId} onChange={(e) => setLeagueId(e.target.value)} inputMode="numeric" placeholder="e.g. 1312162550716051456" />
          </label>
          <button className={btn}>Add</button>
        </form>
        <p className="px-5 pb-4 text-xs text-muted">Keeper leagues are valued on this season (Redraft); keeper costs are set in Keeper Planner.</p>
      </Card>

      <Card title="Data on this device">
        <p className="text-sm text-muted">Fantasy HQ runs in your browser. Sleeper and NFLverse data are cached on this device so screens load instantly; Refresh pulls the latest. Clearing forces a full re-download.</p>
        <button className={`${ghost} mt-3`} onClick={() => post({ clearCache: true }, "Cache cleared.")}>Clear cached data</button>
      </Card>
      <Card title="Use these settings on another device">
        <p className="text-sm text-muted">Settings (username, hidden leagues, keeper rules) are saved per device. Copy this code on one device and paste it on the other.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={ghost} onClick={async () => { const c = exportSettings(); setCode(c); try { await navigator.clipboard.writeText(c); setMsg("Settings code copied."); } catch { setMsg("Copy the code below."); } }}>Copy settings code</button>
        </div>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); try { importSettings(code); setMsg("Settings imported."); } catch (err) { setMsg((err as Error).message || "That code didn't work."); } }}>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">Settings code
            <input className={input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a code here" autoCapitalize="none" />
          </label>
          <button className={btn}>Import</button>
        </form>
      </Card>
    </div>
  );
}
