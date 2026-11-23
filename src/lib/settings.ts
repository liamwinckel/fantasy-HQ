export type Mode = "redraft" | "dynasty";
export type Theme = "dark" | "light";
export type ClassOverride = "Contender" | "Pretender" | "Rebuilder" | "Tanking";

export interface KeeperRule {
  maxKeepers?: number;
  modifier?: "same" | "+1" | "+2" | "+3";
  undraftedRound?: number;
  direction?: "earlier" | "later";
  overrides?: Record<string, number>;
}

export interface AppSettings {
  username: string | null;
  userId: string | null;
  season: string | null; // null = follow Sleeper's current season
  hiddenLeagues: string[]; // leagues you've chosen not to track
  manualLeagueIds: string[]; // leagues added by ID when discovery misses them
  leagueModeOverrides: Record<string, Mode>; // per-league valuation override
  /** Keeper leagues: rules per league (see engine/keepers.ts). */
  keeperRules: Record<string, KeeperRule>;
  /** Dynasty: manual team classification, leagueId → rosterId → label. */
  classOverrides: Record<string, Record<string, ClassOverride>>;
  selectedLeague: string | null;
}

const DEFAULTS: AppSettings = {
  username: null,
  userId: null,
  season: null,
  hiddenLeagues: [],
  manualLeagueIds: [],
  leagueModeOverrides: {},
  keeperRules: {},
  classOverrides: {},
  selectedLeague: null,
};

const KEY = "fhq-settings";
let mem: AppSettings = { ...DEFAULTS };
const hasLs = () => typeof localStorage !== "undefined";

/** Settings live on this device (browser storage). */
export function getSettings(): AppSettings {
  if (!hasLs()) return { ...DEFAULTS, ...mem };
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<AppSettings>) {
  const next = { ...getSettings(), ...patch };
  mem = next;
  if (hasLs()) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fhq-settings"));
  return next;
}

export function resetSettingsForTests(s: Partial<AppSettings> = {}) {
  mem = { ...DEFAULTS, ...s };
}

/** Valuation mode for a league: its Sleeper format (dynasty → Dynasty; redraft/keeper → Redraft), unless overridden in Settings. */
export function effectiveMode(s: AppSettings, leagueId: string, leagueType: number): Mode {
  return s.leagueModeOverrides[leagueId] ?? (leagueType === 2 ? "dynasty" : "redraft");
}
