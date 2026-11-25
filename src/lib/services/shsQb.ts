/**
 * Quarterback-specific inputs for SHS AI v2. All computed from data available before kickoff:
 * nflverse weekly stats (this season, before this week), the injury report for this week, and the schedule
 * (scores of finished games, betting total/spread, rest days, wind).
 *
 *   passD   opponent's passing fantasy points allowed to QBs, judged against those QBs' usual output (ratio − 1)
 *   rushD   the same for QB rushing points
 *   rushPg  his rushing fantasy points per game (mobile QBs)
 *   rushX   rushPg × rushD: a running QB facing a defence that gives up QB rushing
 *   wrOut   share of his team's targets belonging to receivers/backs/TEs listed Out or Doubtful
 *   olOut   offensive linemen listed Out or Doubtful
 *   ownDef  points his own defence allows per game vs league average (ratio − 1): bad defence → more passing
 *   defOut  his own defensive players listed Out or Doubtful
 *   passRt  his team's pass rate (dropbacks / plays) vs league average
 *   pace    his team's plays per game vs league average
 *   oppPace plays per game the opponent's games average (both teams) vs league average
 *   press   opponent's sacks per dropback, judged against the QBs it faced (ratio − 1)
 *   oppDbOut opponent cornerbacks / safeties listed Out or Doubtful
 *   total   game total vs this week's average (ratio − 1): shootout potential
 *   trend   his attempts over the last 3 games vs his season average (ratio − 1)
 *   wind    1 = outdoor game with 15+ mph wind (when known)
 *   short   1 = short week (≤ 5 days rest);  home  1 = home game
 */
import type { LeagueContext } from "./league";
import QBJ from "./shsQb.json";

export const QB_KEYS = ["passD", "rushD", "rushPg", "rushX", "wrOut", "olOut", "ownDef", "defOut", "passRt", "pace", "oppPace", "press", "oppDbOut", "total", "trend", "wind", "short", "home"] as const;
export type QbKey = (typeof QB_KEYS)[number];
export type QbX = Record<QbKey, number>;

const OUT = new Set(["Out", "Doubtful"]);
const OL = new Set(["T", "G", "C", "OT", "OG", "OL"]);
const DEF = new Set(["DE", "DT", "NT", "DL", "LB", "ILB", "OLB", "MLB", "CB", "S", "FS", "SS", "DB"]);
const DB = new Set(["CB", "S", "FS", "SS", "DB"]);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const passPts = (s: { passYd: number; passTd: number; int: number }) => s.passYd * 0.04 + s.passTd * 4 - s.int;
const rushPts = (s: { rushYd: number; rushTd: number }) => s.rushYd * 0.1 + s.rushTd * 6;

/** `windMph`: live kickoff forecasts by team (the schedule only has wind for finished games). */
export function qbInputs(ctx: Pick<LeagueContext, "stats" | "games" | "players" | "signals" | "nflOpponents">, ids: string[], week: number, windMph?: Map<string, number | null>): Map<string, QbX> {
  const before = ctx.stats.filter((s) => s.week < week);
  // ---- team offence per game: plays, dropbacks, QB passing / rushing points ----
  type Tg = { plays: number; drop: number; pass: number; rush: number; sacks: number; opp: string };
  const tg = new Map<string, Tg>(); // team:week
  const tgtShare = new Map<string, number[]>(); // gsis -> weekly target shares
  for (const s of before) {
    const k = `${s.team}:${s.week}`;
    const t = tg.get(k) ?? { plays: 0, drop: 0, pass: 0, rush: 0, sacks: 0, opp: s.opp };
    t.plays += s.att + s.car + s.sacks; t.drop += s.att + s.sacks; t.sacks += s.sacks;
    if (s.position === "QB") { t.pass += passPts(s); t.rush += rushPts(s); }
    tg.set(k, t);
    if (s.tgtShare) (tgtShare.get(s.gsis) ?? tgtShare.set(s.gsis, []).get(s.gsis)!).push(s.tgtShare);
  }
  const byTeam = new Map<string, Tg[]>();
  for (const [k, t] of tg) { const team = k.split(":")[0]; (byTeam.get(team) ?? byTeam.set(team, []).get(team)!).push(t); }
  const avgOf = (team: string, f: (t: Tg) => number) => mean((byTeam.get(team) ?? []).map(f));
  const lg = (f: (t: Tg) => number) => mean([...tg.values()].map(f));
  const L = { plays: lg((t) => t.plays), drop: lg((t) => t.drop / Math.max(1, t.plays)), pass: lg((t) => t.pass), rush: lg((t) => t.rush), sackRate: lg((t) => t.sacks / Math.max(1, t.drop)) };
  // ---- defence judged against the offences it faced (shrunk with 4 average games) ----
  const vsDef = (f: (t: Tg) => number) => {
    const acc = new Map<string, { got: number; exp: number }>();
    for (const [k, t] of tg) {
      const team = k.split(":")[0];
      const games = byTeam.get(team) ?? [];
      if (games.length < 2) continue;
      const exp = (games.reduce((a, g) => a + f(g), 0) - f(t)) / (games.length - 1);
      const x = acc.get(t.opp) ?? { got: 0, exp: 0 }; x.got += f(t); x.exp += exp; acc.set(t.opp, x);
    }
    return (d: string, Lv: number) => { const x = acc.get(d); return x && Lv > 0 ? (x.got + 4 * Lv) / (x.exp + 4 * Lv) - 1 : 0; };
  };
  const passD = vsDef((t) => t.pass), rushD = vsDef((t) => t.rush), pressD = vsDef((t) => t.sacks / Math.max(1, t.drop));
  // ---- points allowed by each defence (finished games) ----
  const allowed = new Map<string, number[]>();
  for (const g of ctx.games) {
    if (g.week >= week || g.homeScore === null || g.awayScore === null) continue;
    (allowed.get(g.home) ?? allowed.set(g.home, []).get(g.home)!).push(g.awayScore);
    (allowed.get(g.away) ?? allowed.set(g.away, []).get(g.away)!).push(g.homeScore);
  }
  const lgAllowed = mean([...allowed.values()].flat()) || 22;
  // ---- this week's injury report ----
  const out = (ctx.signals.raw.injuries ?? []).filter((r) => r.week === week && OUT.has(r.status));
  const outBy = (team: string, set: Set<string>) => out.filter((r) => r.team === team && r.position && set.has(r.position)).length;
  const wkGames = ctx.games.filter((g) => g.week === week);
  const avgTotal = mean(wkGames.map((g) => g.total ?? 0).filter((x) => x > 0)) || 45;

  const res = new Map<string, QbX>();
  for (const id of ids) {
    const p = ctx.players.get(id);
    if (!p || p.pos !== "QB" || !p.team) continue;
    const team = p.team;
    const opp = ctx.nflOpponents.get(team)?.get(week);
    const g = wkGames.find((x) => x.home === team || x.away === team);
    const mine = before.filter((s) => s.gsis === p.gsis && s.position === "QB").sort((a, b) => a.week - b.week);
    const rushPg = mean(mine.map(rushPts));
    const att = mine.map((s) => s.att);
    const tgtOut = out.filter((r) => r.team === team && ["WR", "TE", "RB"].includes(r.position ?? "")).reduce((a, r) => a + mean(tgtShare.get(r.gsis) ?? []), 0);
    const home = g ? (g.home === team ? 1 : 0) : 0;
    const rest = g ? (home ? g.homeRest : g.awayRest) ?? 7 : 7;
    const oppGames = opp ? byTeam.get(opp) ?? [] : [];
    res.set(id, {
      passD: opp ? passD(opp, L.pass) : 0,
      rushD: opp ? rushD(opp, L.rush) : 0,
      rushPg,
      rushX: opp ? rushPg * rushD(opp, L.rush) : 0,
      wrOut: Math.min(1, tgtOut),
      olOut: outBy(team, OL),
      ownDef: allowed.get(team)?.length ? mean(allowed.get(team)!) / lgAllowed - 1 : 0,
      defOut: outBy(team, DEF),
      passRt: L.drop > 0 && byTeam.has(team) ? avgOf(team, (t) => t.drop / Math.max(1, t.plays)) / L.drop - 1 : 0,
      pace: L.plays > 0 && byTeam.has(team) ? avgOf(team, (t) => t.plays) / L.plays - 1 : 0,
      oppPace: L.plays > 0 && oppGames.length ? mean(oppGames.map((t) => t.plays)) / L.plays - 1 : 0,
      press: opp ? pressD(opp, L.sackRate) : 0,
      oppDbOut: opp ? outBy(opp, DB) : 0,
      total: g?.total ? g.total / avgTotal - 1 : 0,
      trend: att.length >= 4 ? mean(att.slice(-3)) / Math.max(1, mean(att)) - 1 : 0,
      wind: (() => { const w = windMph?.has(team) ? windMph.get(team) : g?.wind; return w && w >= 15 && !/dome|closed/i.test(g?.roof ?? "") ? 1 : 0; })(),
      short: rest <= 5 ? 1 : 0,
      home,
    });
  }
  return res;
}

/** How each input enters the ranking head: most scale with his expert-rank points (10% softer defence matters
 *  more for a QB1); counts and rushing points per game enter as they are. */
export const qbFeat = (E: number, q: QbX, k: QbKey) => (k === "rushPg" || k === "olOut" || k === "defOut" || k === "oppDbOut" ? q[k] : E * q[k]);

type QbJson = { keys: QbKey[]; head: number[]; use: boolean; trial?: boolean; projSource?: string; report?: unknown };
const QJ = QBJ as unknown as QbJson;
export const qbModel = () => (QJ.use && QJ.head?.length ? QJ : null);
export const qbReport = () => QJ.report ?? null;
export const qbTrial = () => !!(QJ.use && QJ.trial);
