import { describe, expect, it } from "vitest";
import { expectedBonuses, scoreSleeperStats } from "@/lib/engine/scoring";

describe("expected scoring bonuses", () => {
  it("prices a 100-yard bonus by the chance of reaching it", () => {
    const sc = { bonus_rec_yd_100: 3 };
    const near = expectedBonuses({ rec_yd: 95 }, sc);
    const far = expectedBonuses({ rec_yd: 30 }, sc);
    expect(near).toBeGreaterThan(1);
    expect(near).toBeLessThan(2);
    expect(far).toBeLessThan(0.05);
  });
  it("spreads a defence's points allowed across the league's tiers", () => {
    const sc = { pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4 };
    const good = scoreSleeperStats({ pts_allow: 12 }, sc, "DEF");
    const bad = scoreSleeperStats({ pts_allow: 30 }, sc, "DEF");
    expect(good).toBeGreaterThan(bad + 3);
  });
  it("leaves projections that already carry the bonus key alone", () => {
    expect(expectedBonuses({ rush_yd: 120, bonus_rush_yd_100: 0.7 }, { bonus_rush_yd_100: 3 })).toBe(0);
  });
});

describe("return yards in projections", () => {
  it("scores a returner's def_kr_yd / def_pr_yd projection with the league's kr_yd / pr_yd", async () => {
    const { scoreSleeperStats } = await import("@/lib/engine/scoring");
    const sc = { rec: 0.5, rec_yd: 0.1, kr_yd: 0.04, pr_yd: 0.04 };
    const pts = scoreSleeperStats({ rec: 1, rec_yd: 10, def_kr_yd: 75, def_pr_yd: 10 }, sc, "WR");
    expect(pts).toBeCloseTo(0.5 + 1 + 3 + 0.4, 5);
    // a team defense keeps its own def_ keys
    expect(scoreSleeperStats({ def_kr_yd: 75 }, sc, "DEF")).toBe(0);
  });
});
