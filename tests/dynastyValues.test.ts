import { describe, expect, it } from "vitest";
import { blendWithMarket, type PlayerValue } from "@/lib/engine/values";

const pv = (id: string, dyn: number): PlayerValue => ({ id, redraft: 50, dynasty: dyn, dynastyNow: dyn * 0.4, dynastyFuture: dyn * 0.6, rosVorp: 0, posRankRedraft: 0, posRankDynasty: 0 });

describe("dynasty trade values", () => {
  it("follow the dynasty market order exactly, top asset = 100", () => {
    // Model disagrees with the market; values must still follow the market (built from dynasty ECR).
    const values = new Map([["a", pv("a", 70)], ["b", pv("b", 100)], ["c", pv("c", 95)], ["d", pv("d", 60)]]);
    const players = ["a", "b", "c", "d"].map((id) => ({ id, pos: "WR" }) as never);
    const cons = { a: { v1: 10000 }, b: { v1: 9500 }, c: { v1: 8000 }, d: { v1: 7900 } };
    blendWithMarket(values, players, cons, false);
    const order = [...values.values()].sort((x, y) => y.dynasty - x.dynasty).map((v) => v.id);
    expect(order).toEqual(["a", "b", "c", "d"]);
    expect(values.get("a")!.dynasty).toBe(100);
    expect(values.get("b")!.dynasty).toBeCloseTo(100 * Math.pow(0.95, 0.45), 1);
    expect(values.get("b")!.dynastyModel).toBe(100);
  });
  it("keeps uncovered players below covered ones the model rates higher", () => {
    const values = new Map([["a", pv("a", 100)], ["b", pv("b", 50)], ["x", pv("x", 40)]]);
    const players = ["a", "b", "x"].map((id) => ({ id, pos: "WR" }) as never);
    blendWithMarket(values, players, { a: { v1: 10000 }, b: { v1: 2000 } }, false);
    expect(values.get("x")!.dynasty).toBeLessThanOrEqual(values.get("b")!.dynasty);
  });
});
