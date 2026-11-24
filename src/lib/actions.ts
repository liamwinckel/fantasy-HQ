/** Settings changes, run in the browser (replaces the old /api/settings route). */
import { getSettings, saveSettings, type AppSettings, type ClassOverride, type KeeperRule, type Mode } from "./settings";
import { clearLeagueContexts } from "./services/league";
import { connectUser } from "./services/portfolio";
import { clearCache } from "./cache";

export interface SettingsAction {
  username?: string;
  season?: string | null;
  hideLeague?: string;
  showLeague?: string;
  addLeagueId?: string;
  removeLeagueId?: string;
  leagueMode?: { leagueId: string; mode: Mode | "auto" };
  classOverride?: { leagueId: string; rosterId: number; classification: ClassOverride | "auto" };
  keeper?: { leagueId: string; override?: { playerId: string; round: number }; planSet?: { playerId: string; key: string | null }; planAll?: Record<string, string>; planReset?: boolean } & Omit<KeeperRule, "overrides" | "plan">;
  clearCache?: boolean;
}

export async function applySettings(b: SettingsAction): Promise<void> {
  const s = getSettings();
  if (b.username) {
    await connectUser(b.username);
    clearLeagueContexts();
    return;
  }
  const patch: Partial<AppSettings> = {};
  if (b.season !== undefined) patch.season = b.season;
  if (b.hideLeague) patch.hiddenLeagues = [...new Set([...s.hiddenLeagues, b.hideLeague])];
  if (b.showLeague) patch.hiddenLeagues = s.hiddenLeagues.filter((x) => x !== b.showLeague);
  if (b.addLeagueId) patch.manualLeagueIds = [...new Set([...s.manualLeagueIds, b.addLeagueId])];
  if (b.removeLeagueId) patch.manualLeagueIds = s.manualLeagueIds.filter((x) => x !== b.removeLeagueId);
  if (b.leagueMode) {
    const o = { ...s.leagueModeOverrides };
    if (b.leagueMode.mode === "auto") delete o[b.leagueMode.leagueId];
    else o[b.leagueMode.leagueId] = b.leagueMode.mode;
    patch.leagueModeOverrides = o;
  }
  if (b.classOverride) {
    const { leagueId, rosterId, classification } = b.classOverride;
    const league = { ...(s.classOverrides[leagueId] ?? {}) };
    if (classification === "auto") delete league[String(rosterId)];
    else league[String(rosterId)] = classification;
    patch.classOverrides = { ...s.classOverrides, [leagueId]: league };
  }
  if (b.keeper) {
    const { leagueId, override, planSet, planAll, planReset, ...rest } = b.keeper;
    const cur: KeeperRule = { ...(s.keeperRules[leagueId] ?? {}) };
    Object.assign(cur, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
    if (override) {
      const o = { ...(cur.overrides ?? {}) };
      if (override.round === 0) delete o[override.playerId];
      else o[override.playerId] = override.round;
      cur.overrides = o;
    }
    if (planSet) {
      const pl = { ...(cur.plan ?? {}) };
      if (planSet.key === null) delete pl[planSet.playerId]; else pl[planSet.playerId] = planSet.key;
      cur.plan = pl;
    }
    if (planAll) cur.plan = planAll;
    if (planReset) delete cur.plan;
    patch.keeperRules = { ...s.keeperRules, [leagueId]: cur };
  }
  if (b.clearCache) await clearCache();
  clearLeagueContexts();
  saveSettings(patch);
}

/** Settings as a code you can paste on another device. */
export function exportSettings(): string {
  const { selectedLeague: _sel, ...rest } = getSettings();
  void _sel;
  return btoa(unescape(encodeURIComponent(JSON.stringify(rest))));
}

export function importSettings(code: string) {
  const parsed = JSON.parse(decodeURIComponent(escape(atob(code.trim())))) as Partial<AppSettings>;
  if (typeof parsed !== "object" || parsed === null) throw new Error("That code isn't a Fantasy HQ settings code.");
  clearLeagueContexts();
  saveSettings(parsed);
}
