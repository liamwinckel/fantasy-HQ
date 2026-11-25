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
