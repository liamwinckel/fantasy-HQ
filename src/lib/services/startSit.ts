/**
 * Who should I start: 2–4 players for one week. Each player's week is a distribution (projection, floor/ceiling,
 * boom/bust from ranges.ts); 20,000 simulated weeks say how often each one scores the most.
 */
import type { LeagueContext } from "./league";
import { playerDist, type Dist } from "../engine/ranges";
import { defenseTable } from "./stats";

export interface StartSitRow {
  id: string; name: string; pos: string; team: string | null; injury: string | null;
  dist: Dist; best: number; opp: string | null; bye: boolean; matchup: number | null; implied: number | null; reasons: string[];
}

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Gamma draw (Marsaglia–Tsang) with the given mean and sd. */
function gamma(r: () => number, mean: number, sd: number) {
  if (mean <= 0) return 0;
  const k = Math.max(0.3, (mean / Math.max(0.1, sd)) ** 2), th = mean / k;
  const d = (k < 1 ? k + 1 : k) - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { const u1 = r() || 1e-9, u2 = r(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) { let g = d * v * th; if (k < 1) g *= r() ** (1 / k); return g; }
  }
}

export function startSit(ctx: LeagueContext, ids: string[], week: number): StartSitRow[] {
  const def = new Map(defenseTable(ctx).map((d) => [d.team, d]));
  const games = ctx.games.filter((g) => g.week === week);
  const rows = ids.map((id) => {
    const p = ctx.players.get(id)!;
    const dist = playerDist(ctx, id, week);
    const opp = p.team ? ctx.nflOpponents.get(p.team)?.get(week) ?? null : null;
    const bye = !!p.team && !opp;
    const f = opp ? def.get(opp)?.factor[p.pos as "QB"] : undefined;
    const g = games.find((x) => x.home === p.team || x.away === p.team);
    const implied = g?.total && g.spread != null ? (g.home === p.team ? (g.total + g.spread) / 2 : (g.total - g.spread) / 2) : null;
    const reasons: string[] = [];
    if (bye) reasons.push("On bye");
    if (p.injury) reasons.push(`Listed ${p.injury}`);
    if (f && Math.abs(f - 1) >= 0.08) reasons.push(`${f > 1 ? "Soft" : "Tough"} matchup: ${opp} allows ${Math.round(Math.abs(f - 1) * 100)}% ${f > 1 ? "more" : "fewer"} pts to ${p.pos}s`);
    if (implied) reasons.push(`${p.team} implied for ${implied.toFixed(1)} pts`);
    if (dist.market) reasons.push("Betting lines included");
    return { id, name: p.name, pos: p.pos, team: p.team, injury: p.injury, dist, best: 0, opp, bye, matchup: f ?? null, implied, reasons };
  });
  // How often each scores the most.
  const r = rng(week * 7919 + ids.length);
  const wins = new Array(rows.length).fill(0), N = 20000;
  for (let i = 0; i < N; i++) {
    let bi = -1, bv = -1;
    rows.forEach((x, j) => { const v = x.bye || ["Out", "IR", "Doubtful", "Sus", "PUP", "NFI"].includes(x.injury ?? "") ? 0 : gamma(r, x.dist.mean, x.dist.sd); if (v > bv) { bv = v; bi = j; } });
    wins[bi]++;
  }
  rows.forEach((x, j) => (x.best = Math.round((1000 * wins[j]) / N) / 10));
  return rows;
}
