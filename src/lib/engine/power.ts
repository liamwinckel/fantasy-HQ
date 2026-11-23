/**
 * Power rankings (SHS model).
 *
 * power score = 100 × (45% lineup strength + 35% rest-of-season strength + 20% points per game),
 * each part as a share of the league's best team on that measure.
 *   lineup strength       projected points of the best healthy starting lineup (season-average form)
 *   rest-of-season        average projected best lineup over the remaining weeks (injuries + byes applied)
 *   points per game       actual scoring so far (unchanged by trades)
 * Position strength = projected points that position contributes to the best lineup (flex players count
 * toward their own position). Depth = best three bench players' projected points.
 */
import type { LeagueContext } from "../services/league";
import { optimizeLineup, lineupTotal } from "./lineup";

export const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "IDP"];
const group = (pos: string) => (["DL", "LB", "DB"].includes(pos) ? "IDP" : pos);

export interface TeamPower {
  rosterId: number;
  score: number;
  rank: number;
  startNow: number;
  ros: number;
  pfPerGame: number;
  depth: number;
  depthRank: number;
  positions: Record<string, { pts: number; rank: number }>;
  strengths: string[];
  weaknesses: string[];
  dynastyValue: number;
  dynastyRank: number;
}

export function powerRankings(ctx: LeagueContext, overrides?: Map<number, string[]>): TeamPower[] {
  const rp = ctx.league.roster_positions;
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const usable = (rid: number) => {
    const t = ctx.teams.find((x) => x.rosterId === rid)!;
    const list = overrides?.get(rid) ?? t.players;
    return list.filter((p) => !t.taxi.includes(p) && ctx.players.has(p));
  };
  const cand = (ids: string[], pts: (id: string) => number) => ids.map((id) => ({ id, positions: ctx.players.get(id)!.positions, points: pts(id) }));
  const base = (id: string) => ctx.projections.get(id)?.base ?? 0;

  const raw = ctx.teams.map((t) => {
    const ids = usable(t.rosterId);
    const healthy = optimizeLineup(rp, cand(ids, base));
    const startNow = lineupTotal(healthy);
    const pos: Record<string, number> = {};
    const starters = new Set<string>();
    for (const s of healthy) {
      if (!s.playerId) continue;
      starters.add(s.playerId);
      const g = group(ctx.players.get(s.playerId)!.pos);
      pos[g] = (pos[g] ?? 0) + s.points;
    }
    const bench = ids.filter((id) => !starters.has(id) && !["K", "DEF"].includes(ctx.players.get(id)!.pos)).map(base).sort((a, b) => b - a);
    const depth = bench.slice(0, 3).reduce((a, b) => a + b, 0);
    let ros = startNow;
    if (!ctx.seasonOver) {
      let sum = 0, n = 0;
      for (let w = w0; w <= ctx.lastWeek; w++) {
        sum += lineupTotal(optimizeLineup(rp, cand(ids, (id) => ctx.projections.get(id)?.byWeek[w] ?? 0)));
        n++;
      }
      ros = n ? sum / n : startNow;
    }
    const games = t.wins + t.losses + t.ties;
    const pfPerGame = games ? t.pointsFor / games : startNow;
    const dynastyValue = ids.reduce((a, id) => a + (ctx.values.get(id)?.dynasty ?? 0), 0) + ctx.picks.filter((p) => p.ownerRosterId === t.rosterId).reduce((a, p) => a + p.value, 0);
    return { rosterId: t.rosterId, startNow, ros, pfPerGame, depth, pos, dynastyValue };
  });

  const max = (f: (r: (typeof raw)[number]) => number) => Math.max(1e-9, ...raw.map(f));
  const mS = max((r) => r.startNow), mR = max((r) => r.ros), mP = max((r) => r.pfPerGame);
  const scored = raw.map((r) => ({ ...r, score: Math.round(100 * (0.45 * (r.startNow / mS) + 0.35 * (r.ros / mR) + 0.2 * (r.pfPerGame / mP)) * 10) / 10 }));
  const rankBy = (f: (r: (typeof scored)[number]) => number) => {
    const sorted = [...scored].sort((a, b) => f(b) - f(a));
    return (rid: number) => sorted.findIndex((x) => x.rosterId === rid) + 1;
  };
  const scoreRank = rankBy((r) => r.score);
  const depthRank = rankBy((r) => r.depth);
  const dynRank = rankBy((r) => r.dynastyValue);
  const presentPos = POS_ORDER.filter((p) => raw.some((r) => (r.pos[p] ?? 0) > 0));
  const posRank = Object.fromEntries(presentPos.map((p) => [p, rankBy((r) => r.pos[p] ?? 0)]));
  const n = raw.length;
  const q = Math.max(1, Math.ceil(n / 4));

  return scored
    .map((r) => {
      const positions: TeamPower["positions"] = {};
      for (const p of presentPos) positions[p] = { pts: Math.round((r.pos[p] ?? 0) * 10) / 10, rank: posRank[p](r.rosterId) };
      const strengths = presentPos.filter((p) => positions[p].rank <= q);
      const weaknesses = presentPos.filter((p) => positions[p].rank > n - q);
      const dr = depthRank(r.rosterId);
      if (dr <= q) strengths.push("Depth");
      if (dr > n - q) weaknesses.push("Depth");
      return {
        rosterId: r.rosterId, score: r.score, rank: scoreRank(r.rosterId),
        startNow: Math.round(r.startNow * 10) / 10, ros: Math.round(r.ros * 10) / 10, pfPerGame: Math.round(r.pfPerGame * 10) / 10,
        depth: Math.round(r.depth * 10) / 10, depthRank: dr, positions, strengths, weaknesses,
        dynastyValue: Math.round(r.dynastyValue), dynastyRank: dynRank(r.rosterId),
      };
    })
    .sort((a, b) => a.rank - b.rank);
}
