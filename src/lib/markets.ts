/**
 * Prediction-market player lines (Kalshi, Polymarket) → expected stat lines → fantasy points.
 *
 * The data job reads the open markets and stores, per player, the lines it found as
 * { stat, line, p } where p = market probability the player reaches `line` (e.g. "Dalton Kincaid: 30+" at 63¢
 * → { stat: "rec_yd", line: 30, p: 0.63 }). The app turns those into an expected stat line by fitting a simple
 * distribution to each player's ladder, then scores it with the league's own scoring.
 */
import { scoreSleeperStats } from "./engine/scoring";

export type MarketStat = "pass_yd" | "rush_yd" | "rec_yd" | "rr_yd" | "rec" | "td" | "pass_td" | "rush_td" | "rec_td" | "pass_int";
export interface MarketLine { stat: MarketStat; line: number; p: number }
export interface MarketPlayer { name: string; team: string | null; lines: MarketLine[]; src: string[] }
export interface MarketsFile { builtAt: string; counts: Record<string, number>; players: Record<string, MarketPlayer> }

/** Which stat a market (series title / question) is about. */
export function statFromText(t: string): MarketStat | null {
  const s = t.toLowerCase();
  if (/(season|leader|most |mvp|award|weekly most|week \d+: most)/.test(s)) return null;
  if (/rush(ing)?\s*(\+|and|&)\s*rec(eiving)?\s*yards|scrimmage/.test(s)) return "rr_yd";
  if (/passing yards|pass yds|pass yards/.test(s)) return "pass_yd";
  if (/rushing yards|rush yds|rush yards/.test(s)) return "rush_yd";
  if (/receiving yards|rec yds|rec yards/.test(s)) return "rec_yd";
  if (/passing touchdowns|passing tds|pass tds/.test(s)) return "pass_td";
  if (/rushing touchdowns|rush tds/.test(s)) return "rush_td";
  if (/receiving touchdowns|rec tds/.test(s)) return "rec_td";
  if (/interceptions/.test(s)) return "pass_int";
  if (/receptions|catches/.test(s)) return "rec";
  if (/touchdown|anytime td|score a td/.test(s)) return "td";
  return null;
}

export const normName = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");

/** Price in 0–1 from a Kalshi market (cents or dollar strings, bid/ask midpoint, else last trade). */
export function kalshiProb(m: Record<string, unknown>): number | null {
  const num = (k: string) => { const v = m[k]; const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN; return Number.isFinite(x) ? x : null; };
  const bidD = num("yes_bid_dollars"), askD = num("yes_ask_dollars");
  const bid = bidD ?? (num("yes_bid") !== null ? num("yes_bid")! / 100 : null);
  const ask = askD ?? (num("yes_ask") !== null ? num("yes_ask")! / 100 : null);
  if (bid !== null && ask !== null && ask > 0 && ask - bid <= 0.25) return (bid + ask) / 2;
  const last = num("last_price_dollars") ?? (num("last_price") !== null ? num("last_price")! / 100 : null);
  if (last !== null && last > 0) return last;
  if (bid !== null && ask !== null && ask > 0) return (bid + ask) / 2;
  return null;
}

/** "Dalton Kincaid: 30+" (or a title like "Will Dalton Kincaid have 30+ receiving yards?") → name + line. */
export function parseKalshiLabel(label: string): { name: string; line: number } | null {
  let m = label.match(/^\s*(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*\+/);
  if (m) return { name: m[1], line: Number(m[2]) };
  m = label.match(/will\s+(.+?)\s+(?:have|record|score|throw|catch|rush for|get)\s+(?:at least\s+)?(\d+(?:\.\d+)?)\s*\+?/i);
  if (m) return { name: m[1], line: Number(m[2]) };
  m = label.match(/^\s*(.+?)\s*:\s*(?:anytime )?(?:td|touchdown)/i);
  if (m) return { name: m[1], line: 1 };
  m = label.match(/will\s+(.+?)\s+score\s+(?:a|an anytime)\s+touchdown/i);
  if (m) return { name: m[1], line: 1 };
  return null;
}

/** Polymarket question "Josh Allen: Passing Yards O/U 249.5" with outcomes Over/Under or Yes/No. */
export function parsePolyQuestion(q: string, outcomes: string[], prices: number[]): { name: string; stat: MarketStat; line: number; p: number } | null {
  const stat = statFromText(q);
  if (!stat || prices.length < 2) return null;
  let m = q.match(/^\s*(.+?)\s*[:\-–]\s*.*?(?:o\/u|over\/under)\s*(\d+(?:\.\d+)?)/i);
  let over: number | null = null;
  if (m) {
    const i = outcomes.findIndex((o) => /over|yes/i.test(o));
    if (i < 0) return null;
    over = prices[i];
    // O/U 249.5 → P(X ≥ 250)
    return { name: m[1], stat, line: Math.ceil(Number(m[2])), p: over };
  }
  m = q.match(/will\s+(.+?)\s+(?:have|record|throw|catch|score)\s+(?:over\s+|at least\s+)?(\d+(?:\.\d+)?)?\+?/i);
  if (m) {
    const i = outcomes.findIndex((o) => /yes/i.test(o));
    if (i < 0) return null;
    const line = m[2] ? Number(m[2]) : 1;
    return { name: m[1], stat, line: /over/i.test(q) && !Number.isInteger(line) ? Math.ceil(line) : line, p: prices[i] };
  }
  return null;
}

// ---- fitting ----
const erf = (x: number) => { // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const normSf = (z: number) => 0.5 * (1 - erf(z / Math.SQRT2));
const poisSf = (k: number, lam: number) => { // P(X ≥ k)
  let term = Math.exp(-lam), cdf = 0;
  for (let i = 0; i < k; i++) { cdf += term; term *= lam / (i + 1); }
  return 1 - cdf;
};
const CV: Partial<Record<MarketStat, [number, number]>> = { pass_yd: [0.28, 25], rush_yd: [0.5, 8], rec_yd: [0.6, 8], rr_yd: [0.45, 10], rec: [0.45, 1] };

/** Expected value of one stat from its ladder of (line, P(≥ line)). */
export function fitMean(stat: MarketStat, pts: { line: number; p: number }[]): number | null {
  const use = pts.filter((x) => x.p > 0.02 && x.p < 0.98);
  const ladder = use.length ? use : pts;
  if (!ladder.length) return null;
  const count = ["td", "pass_td", "rush_td", "rec_td", "pass_int"].includes(stat);
  const maxL = Math.max(...ladder.map((x) => x.line));
  const hi = count ? 5 : maxL * 3 + 40;
  const step = count ? 0.01 : 0.5;
  let best = 0, bestErr = Infinity;
  for (let mu = step; mu <= hi; mu += step) {
    let err = 0;
    for (const { line, p } of ladder) {
      const model = count ? poisSf(Math.round(line), mu) : (() => { const [cv, fl] = CV[stat] ?? [0.5, 5]; return normSf((line - 0.5 - mu) / (cv * mu + fl)); })();
      err += (model - p) ** 2;
    }
    if (err < bestErr) { bestErr = err; best = mu; }
  }
  return Math.round(best * 100) / 100;
}

/** Expected stats implied by the markets, e.g. { rec_yd: 54.2, td: 0.41 }. */
/** Highest believable single-game line per stat; anything above is a season-long or mis-parsed market and is ignored. */
export const GAME_MAX: Partial<Record<MarketStat, number>> = { pass_yd: 525, rush_yd: 225, rec_yd: 225, rr_yd: 275, rec: 15.5, td: 3.5, pass_td: 6.5, rush_td: 3.5, rec_td: 3.5, pass_int: 4.5 };
export function marketMeans(lines: MarketLine[]): Partial<Record<MarketStat, number>> {
  const by = new Map<MarketStat, { line: number; p: number }[]>();
  for (const l of lines) if (l.line <= (GAME_MAX[l.stat] ?? Infinity)) (by.get(l.stat) ?? by.set(l.stat, []).get(l.stat)!).push(l);
  const out: Partial<Record<MarketStat, number>> = {};
  for (const [stat, pts] of by) { const m = fitMean(stat, pts); if (m !== null) out[stat] = m; }
  return out;
}

/**
 * Market-implied fantasy points for one player in this league's scoring. Stats the markets don't cover keep
 * Sleeper's projection; anytime-TD and rush+rec-yards markets are split using that projection's mix.
 */
export function marketPoints(lines: MarketLine[], proj: Record<string, number> | undefined, scoring: Record<string, number>, pos: string): { pts: number; covered: string[]; means: Partial<Record<MarketStat, number>> } | null {
  const means = marketMeans(lines);
  // Anytime-TD first, so a specific rec/rush TD market (when both exist) refines it rather than being overwritten.
  const keys = (Object.keys(means) as MarketStat[]).sort((a, b) => (a === "td" ? -1 : 0) - (b === "td" ? -1 : 0));
  if (!keys.length) return null;
  const st: Record<string, number> = { ...(proj ?? {}) };
  const set = (k: string, v: number) => {
    // scale related volume stats with the yardage the market implies (e.g. receptions follow receiving yards)
    st[k] = v;
  };
  for (const k of keys) {
    const v = means[k]!;
    if (k === "td") {
      const r = proj?.rush_td ?? 0, c = proj?.rec_td ?? 0;
      const share = r + c > 0 ? r / (r + c) : pos === "RB" || pos === "QB" ? 0.8 : 0;
      set("rush_td", v * share); set("rec_td", v * (1 - share));
    } else if (k === "rr_yd") {
      if (means.rush_yd !== undefined || means.rec_yd !== undefined) continue;
      const r = proj?.rush_yd ?? 0, c = proj?.rec_yd ?? 0;
      const share = r + c > 0 ? r / (r + c) : pos === "RB" ? 0.7 : 0.05;
      set("rush_yd", v * share); set("rec_yd", v * (1 - share));
    } else set(k, v);
  }
  if (means.rec_yd !== undefined && means.rec === undefined && proj?.rec && proj?.rec_yd) st.rec = proj.rec * (means.rec_yd / proj.rec_yd) ** 0.6;
  const pts = scoreSleeperStats(st, scoring, pos);
  // Sanity check against the projection: a market can disagree, but not by 2.5× either way.
  const base = proj ? scoreSleeperStats(proj, scoring, pos) : 0;
  if (base > 3 && (pts > base * 2.5 || pts < base / 2.5)) return null;
  return { pts, covered: keys, means };
}
