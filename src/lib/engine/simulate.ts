/**
 * Monte Carlo season simulation (default 5,000 runs).
 * Each remaining game: each team scores Normal(mean, sd) from its best projected lineup that week.
 * Standings: wins, then points for (Sleeper's default tiebreak). Divisions are not modelled.
 * Playoffs: top N seeds; top seeds get byes up to the next power of two. Fixed bracket like Sleeper's default
 * (1 v 8, 4 v 5, 2 v 7, 3 v 6 …, winners meet in bracket order), or re-seeded each round when the league re-seeds.
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
  /** Re-seed each round (highest seed plays lowest remaining) instead of a fixed bracket. */
  reseed?: boolean;
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
  /**
   * Playoff weeks: who each team plays, as % of simulations. Keys: opponent roster id, "bye", or "out"
   * (missed the playoffs or already eliminated). Also the most common pairings each week.
   */
  playoffOpp: Record<number, Record<number, Record<string, number>>>;
  playoffPairs: Record<number, { a: number; b: number; pct: number }[]>;
}

/** Standard bracket slot order for a power-of-two field: 1,8,4,5,2,7,3,6 for 8. */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) { const n = order.length * 2 + 1; order = order.flatMap((x) => [x, n - x]); }
  return order;
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
  const oppCount: Record<number, Record<number, Record<string, number>>> = {};
  const pairCount: Record<number, Record<string, number>> = {};
  for (const wk of inp.playoffWeeks) { oppCount[wk] = {}; pairCount[wk] = {}; for (const id of ids) oppCount[wk][id] = {}; }
  const note = (wk: number, id: number, k: string) => { if (oppCount[wk]) oppCount[wk][id][k] = (oppCount[wk][id][k] ?? 0) + 1; };
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
    let size = 1;
    while (size < seeds.length) size *= 2;
    const reach = (list: { id: number }[], r: number) => { for (const t of list) roundCount[t.id][r] = (roundCount[t.id][r] ?? 0) + 1; };
    // slots: fixed bracket positions (null = bye); re-seeding rebuilds them each round.
    let slots: ({ id: number; seed: number } | null)[] = bracketOrder(size).map((sd) => (sd <= seeds.length ? { id: seeds[sd - 1], seed: sd } : null));
    let alive = seeds.map((id, i) => ({ id, seed: i + 1 }));
    reach(alive, 0);
    let round = 0;
    while (alive.length > 1) {
      const week = inp.playoffWeeks[Math.min(round, inp.playoffWeeks.length - 1)] ?? 0;
      if (inp.reseed && round > 0) {
        const sorted = [...alive].sort((x, y) => x.seed - y.seed);
        let sz = 1; while (sz < sorted.length) sz *= 2;
        slots = bracketOrder(sz).map((k) => sorted[k - 1] ?? null);
      }
      const aliveIds = new Set(alive.map((t) => t.id));
      if (round < inp.playoffWeeks.length) for (const id of ids) if (!aliveIds.has(id)) note(week, id, "out");
      const next: typeof slots = [];
      for (let i = 0; i < slots.length; i += 2) {
        const x = slots[i], y = slots[i + 1];
        if (x && y) {
          if (round < inp.playoffWeeks.length) {
            note(week, x.id, String(y.id)); note(week, y.id, String(x.id));
            const k = x.id < y.id ? `${x.id}-${y.id}` : `${y.id}-${x.id}`;
            pairCount[week][k] = (pairCount[week][k] ?? 0) + 1;
          }
          next.push(draw(x.id, week) >= draw(y.id, week) ? x : y);
        } else {
          const t = x ?? y;
          if (t && round < inp.playoffWeeks.length) note(week, t.id, "bye");
          next.push(t);
        }
      }
      slots = next;
      alive = next.filter((t): t is { id: number; seed: number } => !!t);
      round++;
      reach(alive, round);
    }
    // Weeks after the title game is decided (or a shorter bracket): everyone is out.
    for (let k = round; k < inp.playoffWeeks.length; k++) for (const id of ids) note(inp.playoffWeeks[k], id, "out");
    if (alive[0]) title[alive[0].id]++;
  }
  const pct = (x: number) => Math.round((1000 * x) / runs) / 10;
  const o: SimResult = { playoffOdds: {}, titleOdds: {}, avgSeed: {}, projectedWins: {}, runs, seedDist: {}, roundOdds: {}, playoffOpp: {}, playoffPairs: {} };
  for (const wk of inp.playoffWeeks) {
    o.playoffOpp[wk] = {};
    for (const id of ids) o.playoffOpp[wk][id] = Object.fromEntries(Object.entries(oppCount[wk][id]).map(([k, v]) => [k, pct(v)]));
    o.playoffPairs[wk] = Object.entries(pairCount[wk]).map(([k, v]) => { const [a, b] = k.split("-").map(Number); return { a, b, pct: pct(v) }; }).sort((x, y) => y.pct - x.pct);
  }
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
