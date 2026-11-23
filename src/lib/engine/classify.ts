/**
 * Team strategy classification: Contender, Pretender, Rebuilder, Tanking.
 * Each label gets a 0–1 score built from league-relative percentiles; the highest wins and
 * confidence is its share of a softmax across the four. Weights differ in Redraft and Dynasty.
 * Tanking is never asserted as intent: it scores observable patterns only
 * (leaving clearly better bench players unused, selling veterans for picks) and says so.
 */

export type TeamClass = "Contender" | "Pretender" | "Rebuilder" | "Tanking";
export const CLASSES: TeamClass[] = ["Contender", "Pretender", "Rebuilder", "Tanking"];

export interface TeamMetrics {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  gamesPlayed: number;
  strength: number; // projected points of best healthy lineup
  allPlayPct: number; // win % if you'd played every team every week
  playoffOdds: number; // %
  titleOdds: number; // %
  youth: number; // value-weighted avg age of top dynasty assets (lower = younger)
  capital: number; // sum of owned future pick values
  futureShare: number; // share of roster dynasty value that comes from future seasons
  topHeavy: number; // share of projected starter points from top 2 players
  benchedWeeks: { week: number; gap: number }[]; // weeks with a large gap vs. best possible lineup
  vetsSoldForFuture: number; // trades sending away age-27+ players for picks/younger players
}

export interface Classification {
  rosterId: number;
  primary: TeamClass;
  confidence: number; // %
  scores: Record<TeamClass, number>;
  evidence: string[];
  strengths: string[];
  weaknesses: string[];
  strategy: string;
  tankingIndicator: "None" | "Low" | "Moderate" | "High";
}

const pctRank = (vals: number[], v: number) => {
  if (vals.length <= 1) return 0.5;
  const below = vals.filter((x) => x < v).length;
  const equal = vals.filter((x) => x === v).length;
  return (below + 0.5 * (equal - 1)) / (vals.length - 1);
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function classifyTeams(teams: TeamMetrics[], mode: "redraft" | "dynasty"): Classification[] {
  const col = (f: (t: TeamMetrics) => number) => teams.map(f);
  const winPct = (t: TeamMetrics) => (t.gamesPlayed ? (t.wins + 0.5 * t.ties) / t.gamesPlayed : 0.5);
  const S = col((t) => t.strength), W = col(winPct), PF = col((t) => t.pointsFor), LUCK = col((t) => winPct(t) - t.allPlayPct);
  const Y = col((t) => -t.youth), CAP = col((t) => t.capital), FUT = col((t) => t.futureShare), TOP = col((t) => t.topHeavy);
  const maxTitle = Math.max(1, ...col((t) => t.titleOdds));
  const rankOf = (arr: number[], v: number) => [...arr].sort((a, b) => b - a).indexOf(v) + 1;

  return teams.map((t) => {
    const s = pctRank(S, t.strength), w = pctRank(W, winPct(t)), pf = pctRank(PF, t.pointsFor);
    const luck = pctRank(LUCK, winPct(t) - t.allPlayPct), young = pctRank(Y, -t.youth), cap = pctRank(CAP, t.capital);
    const fut = pctRank(FUT, t.futureShare), top = pctRank(TOP, t.topHeavy);
    const po = t.playoffOdds / 100, ti = t.titleOdds / maxTitle;
    const recent = t.benchedWeeks.length;
    // One or two off weeks happen to everyone; evidence starts at 3 of the last 6.
    const tankEvidence = clamp01((recent - 2) / 3);
    const liquidation = clamp01(t.vetsSoldForFuture / 2);

    const scores: Record<TeamClass, number> =
      mode === "redraft"
        ? {
            Contender: 0.4 * s + 0.3 * po + 0.2 * ti + 0.1 * pf,
            Pretender: w >= 0.5 ? 0.45 * clamp01(w - s + 0.5) + 0.35 * luck + 0.2 * top : 0.1 * luck,
            Rebuilder: 0.6 * (1 - s) + 0.4 * (1 - po),
            Tanking: tankEvidence * (1 - po),
          }
        : {
            Contender: 0.35 * s + 0.25 * po + 0.15 * ti + 0.1 * pf + 0.15 * (1 - fut),
            Pretender: w >= 0.5 ? 0.9 * (0.45 * clamp01(w - s + 0.5) + 0.35 * luck + 0.2 * top) : 0.1 * luck,
            Rebuilder: 0.35 * (1 - s) + 0.25 * young + 0.25 * cap + 0.15 * fut,
            Tanking: (0.7 * tankEvidence + 0.3 * liquidation) * (1 - po),
          };

    const exps = CLASSES.map((c) => Math.exp(6 * scores[c]));
    const total = exps.reduce((a, b) => a + b, 0);
    let best: TeamClass = "Contender";
    for (const c of CLASSES) if (scores[c] > scores[best]) best = c;
    const confidence = Math.round(Math.max(35, Math.min(95, (100 * exps[CLASSES.indexOf(best)]) / total)));

    const n = teams.length;
    const sRank = rankOf(S, t.strength), pfRank = rankOf(PF, t.pointsFor), wRank = rankOf(W, winPct(t));
    const evidence: string[] = [];
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    evidence.push(`Record ${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ""} (${ord(wRank)} of ${n}); points for ${ord(pfRank)}; projected lineup strength ${ord(sRank)}.`);
    const luckGap = Math.round((winPct(t) - t.allPlayPct) * t.gamesPlayed * 10) / 10;
    if (Math.abs(luckGap) >= 1)
      evidence.push(`${luckGap > 0 ? "About " + luckGap + " more" : "About " + Math.abs(luckGap) + " fewer"} wins than their weekly scores would earn against an average schedule.`);
    evidence.push(`Playoff odds ${t.playoffOdds}% · title odds ${t.titleOdds}% (simulated).`);
    if (mode === "dynasty") {
      if (young >= 0.7) evidence.push(`One of the younger cores in the league (value-weighted age ${t.youth.toFixed(1)}).`);
      if (cap >= 0.7) evidence.push(`Above-average future draft capital.`);
    }
    if (best === "Tanking" || recent >= 3) {
      evidence.push(
        `Started a lineup well below their best available in ${recent} of the last 6 weeks (avg gap ${(t.benchedWeeks.reduce((a, b) => a + b.gap, 0) / Math.max(1, recent)).toFixed(1)} pts).`,
      );
      if (t.vetsSoldForFuture) evidence.push(`${t.vetsSoldForFuture} trade(s) sending veterans away for picks or younger players.`);
      evidence.push("These are observable patterns, not a statement of intent.");
    }
    if (s >= 0.66) strengths.push("Projected starting lineup is among the league's best.");
    if (pf >= 0.66) strengths.push("High scoring output this season.");
    if (mode === "dynasty" && cap >= 0.66) strengths.push("Strong future pick capital.");
    if (mode === "dynasty" && young >= 0.66) strengths.push("Young core with long-term value.");
    if (s <= 0.33) weaknesses.push("Projected starting lineup ranks in the bottom third.");
    if (top >= 0.75) weaknesses.push("Scoring depends heavily on two players.");
    if (luck >= 0.75 && w >= 0.5) weaknesses.push("Record is ahead of underlying scoring.");
    if (mode === "dynasty" && young <= 0.25) weaknesses.push("Older core; value may decline quickly.");

    const strategy = {
      Contender:
        mode === "dynasty"
          ? "Push for the title. Turn surplus depth or future picks into reliable starters at your weakest lineup slot."
          : "Push for the title. Consolidate bench depth into a stronger starter and prioritise playoff-week schedules.",
      Pretender:
        "Avoid paying premium prices for short-term upgrades. Fix the weakest starting slot cheaply, and consider selling players whose value is propped up by the record.",
      Rebuilder:
        mode === "dynasty"
          ? "Sell aging veterans to contenders for younger players and 1st-round picks. Don't spend premium picks on marginal upgrades."
          : "Playoff path is narrow. Chase upside on waivers and avoid giving away value for short-term points.",
      Tanking: "Likely to value future picks and young players over current points. A natural seller of veteran production.",
    }[best];

    const tankingIndicator: Classification["tankingIndicator"] =
      scores.Tanking >= 0.55 ? "High" : scores.Tanking >= 0.3 ? "Moderate" : scores.Tanking > 0.05 ? "Low" : "None";

    return { rosterId: t.rosterId, primary: best, confidence, scores, evidence, strengths, weaknesses, strategy, tankingIndicator };
  });
}

/**
 * Strategic value: the same asset is worth different amounts to teams with different goals.
 * Standalone (market) value is never changed; these multipliers produce a separate "value to this team".
 */
export const STRATEGY_WEIGHTS: Record<TeamClass, { now: number; future: number; picks: number; vetPenalty: number }> = {
  Contender: { now: 1.2, future: 0.7, picks: 0.65, vetPenalty: 1 },
  Pretender: { now: 1.0, future: 0.9, picks: 0.9, vetPenalty: 1 },
  Rebuilder: { now: 0.75, future: 1.25, picks: 1.3, vetPenalty: 0.8 },
  Tanking: { now: 0.6, future: 1.3, picks: 1.45, vetPenalty: 0.7 },
};

export function strategicPlayerValue(
  cls: TeamClass,
  mode: "redraft" | "dynasty",
  v: { redraft: number; dynastyNow: number; dynastyFuture: number },
  age: number | null,
): number {
  const wt = STRATEGY_WEIGHTS[cls];
  const vet = age !== null && age >= 28 ? wt.vetPenalty : 1;
  const raw = mode === "redraft" ? v.redraft * wt.now : (v.dynastyNow * wt.now + v.dynastyFuture * wt.future) * vet;
  return Math.round(raw * 10) / 10;
}

export function strategicPickValue(cls: TeamClass, value: number): number {
  return Math.round(value * STRATEGY_WEIGHTS[cls].picks * 10) / 10;
}
