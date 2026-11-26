export type Mode = "redraft" | "dynasty";
export type Theme = "dark" | "light";
export type ClassOverride = "Contender" | "Pretender" | "Rebuilder" | "Tanking";

export interface KeeperRule {
  maxKeepers?: number;
  modifier?: "same" | "+1" | "+2" | "+3" | number;
  undraftedRound?: number;
  direction?: "earlier" | "later";
  overrides?: Record<string, number>;
  perYearKept?: number;
  maxYears?: number;
  protectedRounds?: number;
  horizon?: 1 | 2;
  draftedMode?: "drafted" | "adp" | "earlier";
  undraftedMode?: "round" | "adp" | "earlier";
  undraftedOffset?: number;
  adpOffset?: number;
  anyPick?: boolean;
  missingPick?: "earlier" | "later" | "none";
  /** Your plan: player → pick key he's kept with ("2027-10-4"), or "none" to not keep him. */
  plan?: Record<string, string>;
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
  /**
   * "shs" = the research formula (default): expert rank × (1 + learned pull toward the projection + learned factor
   * effects), per ranking type and position, plus betting lines this week. "custom" = your own mix below.
   */
  mode: "shs" | "custom";
  /** Research formula: share given to betting-line points for players with lines this week (0–60%). */
  lines: number;
  /** Custom mix: expert consensus / second opinion (Sleeper's projection; SHS dynasty model in dynasty) / SHS factors. */
  mix: { ecr: number; sleeper: number; factors: number };
  /** This week, for players with betting lines. */
  mixLines: { ecr: number; sleeper: number; markets: number; factors: number };
  /** Per-factor multipliers, 0–2 (1 = default). */
  factor: Record<string, number>;
  /** Let graded results nudge factor weights. */
  autoTune: boolean;
}
export const DEFAULT_SHS: ShsWeights = { mode: "shs", lines: 25, mix: { ecr: 25, sleeper: 25, factors: 50 }, mixLines: { ecr: 25, sleeper: 25, markets: 30, factors: 20 }, factor: {}, autoTune: true };

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
