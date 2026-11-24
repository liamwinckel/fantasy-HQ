/**
 * SHS Fantasy HQ projection model (v1). Internal estimate, not third-party consensus.
 *
 * weekly projection = base × usage trend × offense environment × matchup × availability   (0 on bye)
 *   base       recency-weighted points per game in THIS league's scoring, shrunk toward a prior when the sample is small
 *   usage      last-3-game opportunity vs season opportunity (targets, carries, attempts), capped at −15% / +20%
 *   matchup    opponent's points allowed to the position vs league average, half-weighted, capped at ±15%
 *   available  injury designation: Out/IR/Suspended = 0, Doubtful 30%, Questionable 85%
 * range: low/high ≈ 20th/80th percentile, from the player's own week-to-week spread.
 */

export interface PlayerLite {
  id: string;
  name: string;
  pos: string;
  positions: string[];
  team: string | null;
  age: number | null;
  yearsExp: number | null;
  injury: string | null; // Questionable | Doubtful | Out | IR | PUP | Sus | null
  injuryPart: string | null;
  gsis: string | null;
  draftRound: number | null;
  /** NFL draft pick overall and first NFL season (nflverse). */
  draftPick?: number | null;
  rookieSeason?: number | null;
  /** Sleeper depth chart order (1 = starter). */
  depth?: number | null;
}

export interface GameLog {
  week: number;
  pts: number;
  source: "sleeper" | "nflverse";
  opportunity: number | null; // position-specific volume (targets, carries…)
  snapPct: number | null;
}

export interface Projection {
  id: string;
  /** Points per game when healthy, before matchup. Used for long-term value. */
  base: number;
  /** This week's median projection, after matchup, usage and availability. */
  median: number;
  low: number;
  high: number;
  sd: number;
  availability: number;
  games: number;
  seasonAvg: number;
  last4Avg: number;
  usageFactor: number;
  envFactor: number;
  matchupFactor: number;
  opponent: string | null;
  onBye: boolean;
  confidence: "High" | "Medium" | "Low";
  /** Week → projected median, current week through end of fantasy playoffs. */
  byWeek: Record<number, number>;
  notes: string[];
  /** Where the weekly numbers come from: Sleeper's projections, or the SHS model when Sleeper has none. */
  source: "sleeper" | "model";
  /** SHS model's own figure for this week, kept for comparison. */
  modelMedian: number;
}

export interface ProjectionInputs {
  player: PlayerLite;
  log: GameLog[]; // played games only
  prior: number; // points per game prior for this player
  currentWeek: number;
  lastWeek: number;
  /** team → week → opponent team (absent = bye) */
  opponents: Map<string, Map<number, string>>;
  /** opponent team → position → factor (1 = average) */
  defense: Map<string, Record<string, number>>;
  /** Team offense trending up/down (1 = steady), capped ±6% */
  envFactor?: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

export function availabilityFor(injury: string | null, weeksAhead: number): number {
  switch (injury) {
    case "IR":
    case "PUP":
    case "NFI":
      return weeksAhead < 4 ? 0 : 0.8;
    case "Out":
      return weeksAhead === 0 ? 0 : weeksAhead === 1 ? 0.75 : 0.95;
    case "Sus":
      return weeksAhead === 0 ? 0 : 0.9;
    case "Doubtful":
      return weeksAhead === 0 ? 0.3 : 0.95;
    case "Questionable":
      return weeksAhead === 0 ? 0.85 : 1;
    default:
      return 1;
  }
}

/** Recent (last 3) vs season opportunity → usage multiplier 0.85–1.2. Logs must be in week order. */
export function usageFromLogs(pos: string, sorted: GameLog[]): { usageFactor: number; ratio: number } {
  const opp = sorted.map((g) => g.opportunity).filter((x): x is number => x !== null);
  if (!["QB", "RB", "WR", "TE"].includes(pos) || opp.length < 4) return { usageFactor: 1, ratio: 0 };
  const seasonOpp = mean(opp);
  if (seasonOpp <= 0) return { usageFactor: 1, ratio: 0 };
  const r = mean(opp.slice(-3)) / seasonOpp;
  return { usageFactor: clamp(1 + 0.4 * (r - 1), 0.85, 1.2), ratio: r };
}

export function project(inp: ProjectionInputs): Projection {
  const { player, log, prior, currentWeek, lastWeek, opponents, defense } = inp;
  const env = inp.envFactor ?? 1;
  const notes: string[] = [];
  const games = log.length;
  const sorted = [...log].sort((a, b) => a.week - b.week);
  const pts = sorted.map((g) => g.pts);
  const seasonAvg = mean(pts);
  const last4Avg = mean(pts.slice(-4));
  const raw = games >= 4 ? 0.55 * last4Avg + 0.45 * seasonAvg : seasonAvg;
  // Shrink toward the prior: 1 game ≈ 50/50, 9 games ≈ 90/10.
  const base = games === 0 ? prior : (games * raw + 1 * prior) / (games + 1);
  if (games < 3) notes.push(games === 0 ? "No games this season; projection is the positional prior." : `Only ${games} game(s) played; blended with a prior.`);

  // Usage trend
  const { usageFactor, ratio: r } = usageFromLogs(player.pos, sorted);
  if (r > 1.2) notes.push(`Opportunity up ${Math.round((r - 1) * 100)}% over the last 3 games.`);
  if (r > 0 && r < 0.8) notes.push(`Opportunity down ${Math.round((1 - r) * 100)}% over the last 3 games.`);

  // Spread
  let sd: number;
  if (games >= 3) {
    const m = seasonAvg;
    sd = Math.sqrt(mean(pts.map((p) => (p - m) ** 2)));
    sd = Math.max(sd, 0.3 * base);
  } else sd = 0.45 * base;

  const team = player.team;
  const byWeek: Record<number, number> = {};
  let thisWeek = { median: 0, matchup: 1, opp: null as string | null, bye: false, avail: 1 };
  for (let w = currentWeek; w <= lastWeek; w++) {
    const oppTeam = team ? opponents.get(team)?.get(w) ?? null : null;
    const bye = !!team && opponents.has(team) && !oppTeam;
    let matchup = 1;
    if (oppTeam) {
      const f = defense.get(oppTeam)?.[player.pos];
      if (f) matchup = clamp(1 + 0.5 * (f - 1), 0.85, 1.15);
    }
    const avail = team ? availabilityFor(player.injury, w - currentWeek) : 0;
    const med = bye ? 0 : base * usageFactor * env * matchup * avail;
    byWeek[w] = round1(med);
    if (w === currentWeek) thisWeek = { median: med, matchup, opp: oppTeam, bye, avail };
  }
  if (!team) notes.push("Not on an NFL team.");
  if (thisWeek.bye) notes.push("On bye this week.");
  if (player.injury) notes.push(`Injury: ${player.injury}${player.injuryPart ? ` (${player.injuryPart})` : ""}.`);
  if (thisWeek.matchup >= 1.07) notes.push(`Favourable matchup vs ${thisWeek.opp}.`);
  if (thisWeek.matchup <= 0.93) notes.push(`Tough matchup vs ${thisWeek.opp}.`);

  if (env >= 1.03) notes.push("Team offense trending up.");
  if (env <= 0.97) notes.push("Team offense trending down.");
  const scale = thisWeek.bye ? 0 : usageFactor * env * thisWeek.matchup * thisWeek.avail;
  const cv = base > 0 ? sd / base : 1;
  const confidence: Projection["confidence"] =
    games >= 6 && cv < 0.55 && !player.injury ? "High" : games < 3 || cv > 0.9 || player.injury === "Questionable" || player.injury === "Doubtful" ? "Low" : "Medium";

  return {
    id: player.id,
    base: round1(base),
    median: round1(thisWeek.median),
    low: round1(Math.max(0, (base - 0.84 * sd) * scale)),
    high: round1((base + 0.84 * sd) * scale),
    sd: round1(sd),
    availability: thisWeek.avail,
    games,
    seasonAvg: round1(seasonAvg),
    last4Avg: round1(last4Avg),
    usageFactor: Math.round(usageFactor * 100) / 100,
    envFactor: Math.round(env * 100) / 100,
    matchupFactor: Math.round(thisWeek.matchup * 100) / 100,
    opponent: thisWeek.opp,
    onBye: thisWeek.bye,
    confidence,
    byWeek,
    notes,
    source: "model",
    modelMedian: round1(thisWeek.median),
  };
}

/**
 * Swap in Sleeper's weekly projections (already scored in this league's settings).
 * week → points; a week missing from `weeks` means Sleeper data wasn't available for it (keep the model).
 * A player absent from an available week is projected 0 (Sleeper only lists players expected to play).
 */
export function applySleeper(pr: Projection, weeks: Map<number, Map<string, number> | null>, currentWeek: number, injury: string | null): Projection {
  const byWeek = { ...pr.byWeek };
  const pts: number[] = [];
  let any = false;
  for (const w of Object.keys(byWeek).map(Number)) {
    const wk = weeks.get(w);
    if (!wk) continue;
    any = true;
    const v = Math.max(0, wk.get(pr.id) ?? 0);
    byWeek[w] = round1(v);
    if (v > 0) pts.push(v);
  }
  if (!any) return pr;
  const rosAvg = pts.length ? mean(pts) : 0;
  // Weeks Sleeper couldn't provide: use his Sleeper average when he has a game (never mix in the model).
  for (const w of Object.keys(byWeek).map(Number)) if (!weeks.get(w)) byWeek[w] = pr.byWeek[w] > 0 ? round1(rosAvg) : 0;
  const median = byWeek[currentWeek] ?? 0;
  // Healthy points per game: Sleeper's rest-of-season rate, steadied by actual production when both exist.
  const base = rosAvg > 0 && pr.games >= 3 ? 0.65 * rosAvg + 0.35 * pr.base : rosAvg > 0 ? rosAvg : pr.base * (injury && ["IR", "PUP", "NFI", "Out", "Sus"].includes(injury) ? 1 : 0.6);
  const ratio = pr.base > 0 ? median / pr.base : 0;
  const notes = [...pr.notes];
  notes.unshift(median > 0 ? "Weekly projection: Sleeper." : pr.onBye ? "On bye this week." : "Sleeper isn't projecting him to play this week.");
  return {
    ...pr,
    base: round1(base),
    median: round1(median),
    low: round1(Math.max(0, median - 0.84 * pr.sd * Math.min(1.2, ratio || 0))),
    high: round1(median + 0.84 * pr.sd * Math.min(1.2, ratio || 0)),
    availability: median > 0 ? Math.max(pr.availability, 0.85) : pr.onBye ? pr.availability : 0,
    byWeek,
    notes,
    source: "sleeper",
  };
}

/** Opportunity metric per position, from an NFLverse stat line. */
export function opportunityOf(pos: string, s: { att: number; car: number; tgt: number }): number | null {
  switch (pos) {
    case "QB": return s.att + s.car;
    case "RB": return s.car + 1.5 * s.tgt;
    case "WR":
    case "TE": return s.tgt;
    default: return null;
  }
}

/** Prior points-per-game for a player with little or no data, relative to the position's replacement level. */
export function priorFor(replacement: number, yearsExp: number | null, draftRound: number | null): number {
  if (yearsExp !== null && yearsExp <= 1) {
    const m = draftRound === 1 ? 1.1 : draftRound === 2 ? 0.95 : draftRound === 3 ? 0.85 : 0.65;
    return replacement * m;
  }
  return replacement * 0.85;
}
