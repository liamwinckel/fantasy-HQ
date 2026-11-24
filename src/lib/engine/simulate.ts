/**
 * Monte Carlo season simulation (default 5,000 runs).
 * Each remaining game: each team scores Normal(mean, sd) from its best projected lineup that week.
 * Standings: wins, then points for (Sleeper's default tiebreak). Divisions are not modelled.
 * Playoffs: top N seeds; top seeds get byes up to the next power of two; higher seed plays lowest remaining seed.
 */

export interface TeamWeek { mean: number; sd: number }

export interface SimInput {
  rosterIds: number[];
  wins: Record<number, number>;
  losses: Record<number, number>;
  ties: Record<number, number>;
  pointsFor: Record<number, number>;
  /** Remaining regular-season games: week → list of [rosterA, rosterB] */
  schedule: { week: number; games: [number, number][] }[];
  strength: (rosterId: number, week: number) => TeamWeek;
  playoffTeams: number;
  playoffWeeks: number[];
  runs?: number;
  seed?: number;
}

export interface SimResult {
  playoffOdds: Record<number, number>;
  titleOdds: Record<number, number>;
  avgSeed: Record<number, number>;
  projectedWins: Record<number, number>;
  runs: number;
  /** % of simulations finishing at each seed (index 0 = 1st). */
  seedDist: Record<number, number[]>;
  /** % of simulations reaching each playoff round (index 0 = made playoffs … last = won title). */
  roundOdds: Record<number, number[]>;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function simulateSeason(inp: SimInput): SimResult {
  const runs = inp.runs ?? 5000;
  const r = rng(inp.seed ?? 42);
  const ids = inp.rosterIds;
  const playoff: Record<number, number> = {};
  const title: Record<number, number> = {};
  const seedSum: Record<number, number> = {};
  const winSum: Record<number, number> = {};
  const seedCount: Record<number, number[]> = {};
  const roundCount: Record<number, number[]> = {};
  for (const id of ids) { playoff[id] = 0; title[id] = 0; seedSum[id] = 0; winSum[id] = 0; seedCount[id] = ids.map(() => 0); roundCount[id] = []; }
  const draw = (id: number, week: number) => {
    const s = inp.strength(id, week);
    return s.mean + s.sd * normal(r);
  };

  for (let run = 0; run < runs; run++) {
    const w: Record<number, number> = {};
    const pf: Record<number, number> = {};
    for (const id of ids) { w[id] = (inp.wins[id] ?? 0) + 0.5 * (inp.ties[id] ?? 0); pf[id] = inp.pointsFor[id] ?? 0; }
    for (const wk of inp.schedule) {
      for (const [a, b] of wk.games) {
        const sa = draw(a, wk.week);
        const sb = draw(b, wk.week);
        pf[a] += sa; pf[b] += sb;
        if (sa > sb) w[a]++; else w[b]++;
      }
    }
    const standings = [...ids].sort((x, y) => w[y] - w[x] || pf[y] - pf[x]);
    standings.forEach((id, i) => { seedSum[id] += i + 1; winSum[id] += w[id]; seedCount[id][i]++; });
    const seeds = standings.slice(0, inp.playoffTeams);
    seeds.forEach((id) => playoff[id]++);
    // Bracket
    let alive = seeds.map((id, i) => ({ id, seed: i + 1 }));
    let size = 1;
    while (size < alive.length) size *= 2;
    let byes = size - alive.length;
    let round = 0;
    const reach = (list: { id: number }[], r: number) => { for (const t of list) roundCount[t.id][r] = (roundCount[t.id][r] ?? 0) + 1; };
    reach(alive, 0);
    while (alive.length > 1) {
      const week = inp.playoffWeeks[Math.min(round, inp.playoffWeeks.length - 1)] ?? 0;
      const sorted = [...alive].sort((a, b) => a.seed - b.seed);
      const byeTeams = sorted.slice(0, byes);
      const playing = sorted.slice(byes);
      const next = [...byeTeams];
      for (let i = 0; i < playing.length / 2; i++) {
        const hi = playing[i];
        const lo = playing[playing.length - 1 - i];
        next.push(draw(hi.id, week) >= draw(lo.id, week) ? hi : lo);
      }
      alive = next;
      byes = 0;
      round++;
      reach(alive, round);
    }
    if (alive[0]) title[alive[0].id]++;
  }
  const pct = (x: number) => Math.round((1000 * x) / runs) / 10;
  const o: SimResult = { playoffOdds: {}, titleOdds: {}, avgSeed: {}, projectedWins: {}, runs, seedDist: {}, roundOdds: {} };
  for (const id of ids) {
    o.playoffOdds[id] = pct(playoff[id]);
    o.titleOdds[id] = pct(title[id]);
    o.avgSeed[id] = Math.round((10 * seedSum[id]) / runs) / 10;
    o.projectedWins[id] = Math.round((10 * winSum[id]) / runs) / 10;
    o.seedDist[id] = seedCount[id].map(pct);
    o.roundOdds[id] = Array.from({ length: Math.max(1, ...ids.map((x) => roundCount[x].length)) }, (_, i) => pct(roundCount[id][i] ?? 0));
  }
  return o;
}

/** P(A outscores B) under independent normal scores. */
export function winProbability(a: TeamWeek, b: TeamWeek): number {
  const sd = Math.sqrt(a.sd ** 2 + b.sd ** 2) || 1;
  const z = (a.mean - b.mean) / sd;
  return Math.round(1000 * phi(z)) / 10;
}

function phi(z: number) {
  // Abramowitz–Stegun approximation of the standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
