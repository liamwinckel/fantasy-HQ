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
  /** SHS AI blend. */
  shs: ShsWeights;
  /** Optional free collegefootballdata.com API key (college production for young players). */
  cfbdKey: string | null;
}

export interface ShsWeights {
  /** Share given to expert consensus when no market data (default 75 → 75% ECR / 25% factors). */
  expert: number;
  /** Weekly, when a player has prediction-market lines: experts / markets / factors (normalised; default 50/30/20). */
  wkExpert: number;
  wkMarket: number;
  wkFactors: number;
  /** Per-factor multipliers, 0–2 (1 = default). */
  factor: Record<string, number>;
  /** Let tracked results nudge factor weights (only after enough finished weeks). */
  autoTune: boolean;
}
export const DEFAULT_SHS: ShsWeights = { expert: 75, wkExpert: 50, wkMarket: 30, wkFactors: 20, factor: {}, autoTune: true };

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
  shs: DEFAULT_SHS,
  cfbdKey: null,
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
  // SHS AI weights only change scoring on screen; they don't need the league reloaded.
  const shsOnly = Object.keys(patch).every((k) => k === "shs" || k === "cfbdKey");
  if (typeof window !== "undefined") window.dispatchEvent(new Event(shsOnly ? "fhq-shs" : "fhq-settings"));
  return next;
}

export function resetSettingsForTests(s: Partial<AppSettings> = {}) {
  mem = { ...DEFAULTS, ...s };
}

/** Valuation mode for a league: its Sleeper format (dynasty → Dynasty; redraft/keeper → Redraft), unless overridden in Settings. */
export function effectiveMode(s: AppSettings, leagueId: string, leagueType: number): Mode {
  return s.leagueModeOverrides[leagueId] ?? (leagueType === 2 ? "dynasty" : "redraft");
}
