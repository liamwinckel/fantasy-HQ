import { describe, expect, it } from "vitest";
import { adjustedDefense, impliedRatio, stackPredict, type PosStack, type StackX } from "@/lib/services/shsStack";

const x: StackX = { E: 15, P: 17, pMiss: 0, xR: 16, xS: 15, fS: 14, xg: 6, p3: 18, g: 6, impl: 0.1, mAdj: 0.05, q: 0, vol: 0.4, early: 0 };
const ident = (n: number) => ({ w: [0, 1, ...new Array(n - 1).fill(0)] });

describe("SHS AI v2 stack", () => {
  it("ranks by expert points plus the head's view of the gaps", () => {
    const m: PosStack = { base: { experts: ident(1), projection: ident(2), opportunity: ident(5), context: ident(4) }, meta: { w: [0, 1, 0, 0, 0, 0, 0] }, range: 0, head: [0.5, 0, 0, 0, 0, 0] };
    const r = stackPredict(m, x);
    expect(r.pts).toBeCloseTo(15);
    expect(r.score).toBeCloseTo(15 + 0.5 * (17 - 15));
  });
  it("judges a defence against the offences it faced", () => {
    const s = (team: string, opp: string, week: number, pts: number) => ({ team, opp, week, position: "WR", pprPoints: pts }) as never;
    // A scores 30 a week except vs D (10): D looks tough even though 10 is about league average.
    const stats = [s("A", "X", 1, 30), s("A", "Y", 2, 30), s("A", "D", 3, 10), s("B", "D", 1, 20), s("B", "Z", 2, 20), s("B", "Q", 3, 20)];
    const d = adjustedDefense({ stats }, 4);
    expect(d.get("D:WR")!).toBeLessThan(0);
  });
  it("turns total and spread into implied points", () => {
    const r = impliedRatio({ games: [{ week: 5, home: "H", away: "A", total: 50, spread: 6, kickoff: null, homeScore: null, awayScore: null }] }, 5);
    expect(r.get("H")!).toBeGreaterThan(0);
    expect(r.get("A")!).toBeLessThan(0);
  });
});
