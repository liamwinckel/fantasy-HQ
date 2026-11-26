import { describe, expect, it } from "vitest";
import { optimizeLineup, lineupTotal } from "@/lib/engine/lineup";
import { canFill, primaryPosition, starterDemand, isSuperflex } from "@/lib/engine/positions";
import { scoreStatLine, scoringLabel } from "@/lib/engine/scoring";
import { buildPicks, pickValue, tierForSlot } from "@/lib/engine/picks";
import { ageMultiplier, computeValues, replacementLevels } from "@/lib/engine/values";
import { availabilityFor, project, type PlayerLite, type Projection } from "@/lib/engine/projections";
import { simulateSeason, winProbability } from "@/lib/engine/simulate";
import { classifyTeams, strategicPickValue, strategicPlayerValue, type TeamMetrics } from "@/lib/engine/classify";
import type { WeekStat } from "@/lib/nflverse";
import { packages, acceptChance } from "@/lib/engine/trade";

const p = (id: string, pos: string, points: number) => ({ id, positions: [pos], points });

describe("positions", () => {
  it("handles flex, superflex and IDP eligibility", () => {
    expect(canFill("FLEX", ["TE"])).toBe(true);
    expect(canFill("FLEX", ["QB"])).toBe(false);
    expect(canFill("SUPER_FLEX", ["QB"])).toBe(true);
    expect(canFill("IDP_FLEX", ["LB"])).toBe(true);
    expect(canFill("REC_FLEX", ["RB"])).toBe(false);
    expect(primaryPosition({ position: "DE" })).toBe("DL");
    expect(primaryPosition({ position: "CB" })).toBe("DB");
  });
  it("detects superflex and splits flex demand", () => {
    expect(isSuperflex(["QB", "SUPER_FLEX", "BN"])).toBe(true);
    expect(isSuperflex(["QB", "QB", "RB"])).toBe(true);
    expect(isSuperflex(["QB", "RB", "FLEX"])).toBe(false);
    const d = starterDemand(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "BN", "BN", "IR"]);
    expect(d.RB).toBeCloseTo(2.45);
    expect(d.TE).toBeCloseTo(1.1);
    expect(d.K).toBe(1);
  });
});

describe("lineup optimizer", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "BN"];
  const roster = [p("qb1", "QB", 22), p("qb2", "QB", 18), p("rb1", "RB", 15), p("rb2", "RB", 12), p("rb3", "RB", 11), p("wr1", "WR", 16), p("wr2", "WR", 14), p("wr3", "WR", 9), p("te1", "TE", 8)];
  it("fills restrictive slots first and puts the 2nd QB in superflex", () => {
    const lu = optimizeLineup(slots, roster);
    expect(lu.find((s) => s.slot === "SUPER_FLEX")?.playerId).toBe("qb2");
    expect(lu.find((s) => s.slot === "FLEX")?.playerId).toBe("rb3");
    expect(lineupTotal(lu)).toBeCloseTo(22 + 15 + 12 + 16 + 14 + 8 + 11 + 18);
  });
  it("keeps locked players and current slots when possible", () => {
    const current = ["qb1", "rb1", "rb2", "wr1", "wr3", "te1", "rb3", "qb2"];
    const lu = optimizeLineup(slots, roster.map((r) => (r.id === "wr3" ? { ...r, locked: true } : r)), current);
    expect(lu[4].playerId).toBe("wr3"); // locked stays
    expect(lu[0].playerId).toBe("qb1");
  });
  it("leaves a slot empty when nobody is eligible", () => {
    const lu = optimizeLineup(["QB", "K"], [p("qb1", "QB", 20)]);
    expect(lu[1].playerId).toBeNull();
  });
});

describe("scoring", () => {
  const line = { att: 30, cmp: 20, passYd: 300, passTd: 2, int: 1, pass2pt: 0, sacks: 2, car: 3, rushYd: 20, rushTd: 0, rush2pt: 0, rushFd: 1,
    tgt: 0, rec: 0, recYd: 0, recTd: 0, rec2pt: 0, recFd: 0, tgtShare: 0, airShare: 0, fumLost: 0,
    fgm0_19: 0, fgm20_29: 0, fgm30_39: 0, fgm40_49: 0, fgm50p: 0, fgMiss: 0, xpm: 0, xpMiss: 0, tklSolo: 0, tklAst: 0, tfl: 0, sack: 0, qbHit: 0, defInt: 0, pd: 0, ff: 0, fr: 0, defTd: 0, safety: 0 } as unknown as WeekStat;
  it("applies league scoring including bonuses", () => {
    const sc = { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, bonus_pass_yd_300: 3 };
    expect(scoreStatLine(line, sc, "QB")).toBeCloseTo(12 + 8 - 2 + 2 + 3);
  });
  it("labels scoring formats", () => {
    expect(scoringLabel({ rec: 0.5 })).toBe("Half PPR");
    expect(scoringLabel({ rec: 1, bonus_rec_te: 0.5 })).toBe("PPR · TE +0.5");
    expect(scoringLabel({})).toBe("Standard");
  });
});

describe("projections", () => {
  const player: PlayerLite = { id: "1", name: "Test", pos: "WR", positions: ["WR"], team: "BUF", age: 25, yearsExp: 3, injury: null, injuryPart: null, gsis: null, draftRound: null };
  const opponents = new Map([["BUF", new Map([[12, "MIA"], [14, "NYJ"]])]]);
  const log = [10, 12, 14, 16, 18, 20].map((pts, i) => ({ week: i + 1, pts, source: "sleeper" as const, opportunity: 6 + i, snapPct: null }));
  it("weights recent games, applies byes and stays within its range", () => {
    const pr = project({ player, log, prior: 8, currentWeek: 12, lastWeek: 14, opponents, defense: new Map() });
    // raw = .55×17 + .45×15 = 16.1; 6 games vs a prior of 8 → (6×16.1 + 8) / 7 ≈ 14.9
    expect(pr.base).toBeCloseTo(14.9, 1);
    expect(pr.byWeek[13]).toBe(0); // bye
    expect(pr.low).toBeLessThanOrEqual(pr.median);
    expect(pr.high).toBeGreaterThanOrEqual(pr.median);
    expect(pr.usageFactor).toBeGreaterThan(1);
  });
  it("zeroes Out players this week and shrinks small samples to the prior", () => {
    const out = project({ player: { ...player, injury: "Out" }, log, prior: 8, currentWeek: 12, lastWeek: 14, opponents, defense: new Map() });
    expect(out.median).toBe(0);
    expect(availabilityFor("Questionable", 0)).toBe(0.85);
    const thin = project({ player, log: log.slice(-1), prior: 8, currentWeek: 12, lastWeek: 14, opponents, defense: new Map() });
    expect(thin.base).toBeCloseTo((20 + 8) / 2);
  });
});

describe("values", () => {
  it("age curves peak and decline by position", () => {
    expect(ageMultiplier("RB", 24)).toBe(1);
    expect(ageMultiplier("RB", 30)).toBeLessThan(0.5);
    expect(ageMultiplier("QB", 30)).toBe(1);
  });
  it("redraft ignores age; dynasty prefers youth", () => {
    const mk = (id: string, age: number): PlayerLite => ({ id, name: id, pos: "RB", positions: ["RB"], team: "BUF", age, yearsExp: 4, injury: null, injuryPart: null, gsis: null, draftRound: null });
    const players = [mk("young", 23), mk("old", 30), mk("repl", 26)];
    const proj = (id: string, base: number): [string, Projection] => [id, { id, base, median: base, low: 0, high: 0, sd: 3, availability: 1, games: 10, seasonAvg: base, last4Avg: base, usageFactor: 1, envFactor: 1, matchupFactor: 1, opponent: null, onBye: false, confidence: "High" as const, byWeek: { 12: base, 13: base }, notes: [], source: "model" as const, modelMedian: 0 }];
    const projections = new Map([proj("young", 18), proj("old", 18), proj("repl", 10)]);
    const v = computeValues({ players, projections, replacement: { RB: 10 }, currentWeek: 12, playoffStart: 13, lastWeek: 13 });
    expect(v.get("young")!.redraft).toBe(v.get("old")!.redraft);
    expect(v.get("young")!.dynasty).toBeGreaterThan(v.get("old")!.dynasty);
    expect(v.get("repl")!.redraft).toBeLessThan(v.get("young")!.redraft * 0.35); // replacement-level depth keeps a small value
  });
  it("replacement level sits just past league starter demand", () => {
    const r = replacementLevels(new Map([["QB", [30, 25, 20, 15, 10]]]), { QB: 1 }, 3);
    expect(r.QB).toBe(15);
  });
});

describe("draft picks", () => {
  it("values early > late, superflex 1sts higher, future years discounted", () => {
    const base = { round: 1, teams: 12, superflex: false, yearsOut: 0 };
    expect(pickValue({ ...base, tier: "early" })).toBeGreaterThan(pickValue({ ...base, tier: "late" }));
    expect(pickValue({ ...base, tier: "mid", superflex: true })).toBeGreaterThan(pickValue({ ...base, tier: "mid" }));
    expect(pickValue({ ...base, tier: "mid", yearsOut: 2 })).toBeLessThan(pickValue({ ...base, tier: "mid" }));
    expect(tierForSlot(1, 12)).toBe("early");
    expect(tierForSlot(12, 12)).toBe("late");
  });
  it("applies Sleeper traded picks and estimates next year's slot", () => {
    const picks = buildPicks({ rosterIds: [1, 2, 3], traded: [{ season: "2027", round: 1, roster_id: 3, owner_id: 1, previous_owner_id: 3 }], firstSeason: 2027, years: 2, rounds: 2, teams: 3, superflex: false, projectedOrder: [3, 2, 1], valueOn: true });
    const p = picks.find((x) => x.key === "2027-1-3")!;
    expect(p.ownerRosterId).toBe(1);
    expect(p.tier).toBe("early");
    expect(p.tierSource).toBe("estimated");
    expect(picks.find((x) => x.key === "2028-1-3")!.tierSource).toBe("default");
    const redraft = buildPicks({ rosterIds: [1], traded: [], firstSeason: 2027, years: 1, rounds: 1, teams: 10, superflex: false, projectedOrder: null, valueOn: false });
    expect(redraft[0].value).toBe(0);
  });
});

describe("simulation", () => {
  it("is deterministic, sums title odds to ~100% and favours the stronger team", () => {
    const input = {
      rosterIds: [1, 2, 3, 4], wins: { 1: 5, 2: 5, 3: 5, 4: 5 }, losses: { 1: 5, 2: 5, 3: 5, 4: 5 }, ties: {}, pointsFor: { 1: 1000, 2: 1000, 3: 1000, 4: 1000 },
      schedule: [{ week: 12, games: [[1, 2], [3, 4]] as [number, number][] }],
      strength: (rid: number) => ({ mean: rid === 1 ? 140 : 100, sd: 15 }), playoffTeams: 2, playoffWeeks: [15], runs: 2000, seed: 1,
    };
    const a = simulateSeason(input);
    const b = simulateSeason(input);
    expect(a).toEqual(b);
    const total = Object.values(a.titleOdds).reduce((x, y) => x + y, 0);
    expect(total).toBeGreaterThan(99);
    expect(a.titleOdds[1]).toBeGreaterThan(a.titleOdds[2]);
    expect(winProbability({ mean: 120, sd: 10 }, { mean: 100, sd: 10 })).toBeGreaterThan(85);
    expect(winProbability({ mean: 100, sd: 10 }, { mean: 100, sd: 10 })).toBeCloseTo(50, 0);
  });
});

describe("classification", () => {
  const base: Omit<TeamMetrics, "rosterId"> = { wins: 6, losses: 5, ties: 0, pointsFor: 1200, pointsAgainst: 1200, gamesPlayed: 11, strength: 120, allPlayPct: 0.5, playoffOdds: 50, titleOdds: 10, youth: 26, capital: 30, futureShare: 0.5, topHeavy: 0.25, benchedWeeks: [], vetsSoldForFuture: 0 };
  const teams: TeamMetrics[] = [
    { ...base, rosterId: 1, wins: 9, losses: 2, strength: 150, pointsFor: 1450, playoffOdds: 99, titleOdds: 35, allPlayPct: 0.75 },
    { ...base, rosterId: 2, wins: 9, losses: 2, strength: 105, pointsFor: 1150, playoffOdds: 85, titleOdds: 6, allPlayPct: 0.4, topHeavy: 0.4 },
    { ...base, rosterId: 3, wins: 3, losses: 8, strength: 95, pointsFor: 1050, playoffOdds: 3, titleOdds: 0.5, youth: 23.5, capital: 80, futureShare: 0.7 },
    { ...base, rosterId: 4, wins: 2, losses: 9, strength: 90, pointsFor: 1000, playoffOdds: 1, titleOdds: 0.1, benchedWeeks: [{ week: 7, gap: 30 }, { week: 8, gap: 25 }, { week: 9, gap: 40 }, { week: 10, gap: 35 }, { week: 11, gap: 30 }], vetsSoldForFuture: 2, capital: 70 },
    { ...base, rosterId: 5 },
  ];
  it("separates contender, pretender, rebuilder and tanking", () => {
    const c = new Map(classifyTeams(teams, "dynasty").map((x) => [x.rosterId, x]));
    expect(c.get(1)!.primary).toBe("Contender");
    expect(c.get(2)!.primary).toBe("Pretender");
    expect(c.get(3)!.primary).toBe("Rebuilder");
    expect(c.get(4)!.primary).toBe("Tanking");
    expect(c.get(4)!.evidence.join(" ")).toMatch(/not a statement of intent/);
  });
  it("does not label a team tanking without lineup evidence", () => {
    const c = classifyTeams(teams.map((t) => ({ ...t, benchedWeeks: [], vetsSoldForFuture: 0 })), "dynasty");
    expect(c.some((x) => x.primary === "Tanking")).toBe(false);
  });
  it("strategic value re-weights without changing market value", () => {
    const v = { redraft: 50, dynastyNow: 20, dynastyFuture: 40 };
    expect(strategicPlayerValue("Contender", "dynasty", v, 25)).toBeCloseTo(20 * 1.2 + 40 * 0.7);
    expect(strategicPlayerValue("Rebuilder", "dynasty", v, 30)).toBeCloseTo((20 * 0.75 + 40 * 1.25) * 0.8);
    expect(strategicPickValue("Tanking", 30)).toBeGreaterThan(strategicPickValue("Contender", 30));
  });
});

describe("four quarters for a dollar", () => {
  it("consolidates packages so depth can't add up to a star", () => {
    // One-for-one: straight values.
    expect(packages([80], [70])).toMatchObject({ a: 80, b: 70, adjA: 0, adjB: 0 });
    // Four quarters don't make a dollar…
    const q = packages([80], [20, 20, 20, 20]);
    expect(q.b).toBeLessThan(45);
    expect(q.adjA).toBeGreaterThan(35);
    // …but piling on real value always wins: the adjustment is capped below the star's own value.
    const whole = packages([100], [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40]);
    expect(whole.b).toBeGreaterThan(whole.a * 4);
    expect(whole.adjA).toBeLessThanOrEqual(90);
    // A star for a lesser starter + mid pieces still favours the star's side…
    const k = packages([999], [550, 425, 352]);
    expect(k.a).toBeGreaterThan(k.b);
    // …but a top RB for a top-10 RB and two top-10 WRs is an overpay by the three-player side.
    const o = packages([970], [650, 560, 520]);
    expect(o.b / o.a).toBeGreaterThan(1.2);
    // The best player in a deal needs a premium to move.
    expect(acceptChance([80], [50, 40])).toBeLessThan(0.2);
    expect(acceptChance([50], [55])).toBeGreaterThan(0.5);
    expect(packages([], []).a).toBe(0);
  });
});

describe("playoff bracket estimate", () => {
  it("uses Sleeper's fixed bracket and records likely opponents", async () => {
    const { bracketOrder, simulateSeason } = await import("@/lib/engine/simulate");
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const r = simulateSeason({ rosterIds: ids, wins: { 1: 9, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2 }, losses: {}, ties: {}, pointsFor: {}, schedule: [],
      strength: (id) => ({ mean: 100 + (8 - id) * 3, sd: 15 }), playoffTeams: 6, playoffWeeks: [15, 16, 17], runs: 2000 });
    // Round 1: seeds 1 and 2 on bye, 3 v 6, 4 v 5; 7 and 8 out.
    expect(r.playoffOpp[15][1].bye).toBe(100);
    expect(r.playoffOpp[15][3]["6"]).toBe(100);
    expect(r.playoffOpp[15][7].out).toBe(100);
    // Round 2: seed 1 meets the 4/5 winner, never 3 or 6.
    expect((r.playoffOpp[16][1]["4"] ?? 0) + (r.playoffOpp[16][1]["5"] ?? 0)).toBeCloseTo(100, 0);
    expect(r.playoffPairs[15][0].pct).toBe(100);
  });
});
