import { describe, expect, it } from "vitest";
import { surname } from "@/lib/names";
import { marketForPick } from "@/lib/engine/picks";

describe("surname", () => {
  it("skips name suffixes", () => {
    expect(surname("Luther Burden III")).toBe("Burden");
    expect(surname("Brian Robinson Jr.")).toBe("Robinson");
    expect(surname("Marvin Harrison Jr")).toBe("Harrison");
    expect(surname("Bijan Robinson")).toBe("Robinson");
    expect(surname("Jr.")).toBe("Jr.");
  });
});

describe("pick market prices", () => {
  const pm = {
    "2027 Mid 1st": { e1: 70, e2: 64, v1: 3000, v2: 3200 },
    "2027 1st": { e1: 69, e2: 63, v1: 3010, v2: 3210 },
    "2028 1st": { e1: 79, e2: 72, v1: 2600, v2: 2800 },
    "2028 2nd": { e1: 168, e2: 162, v1: 900, v2: 950 },
  };
  it("uses the exact listing when there is one", () => {
    expect(marketForPick({ season: "2027", round: 1, tier: "mid", tierSource: "estimated" }, pm)?.v1).toBe(3000);
    expect(marketForPick({ season: "2028", round: 1, tier: "mid", tierSource: "default" }, pm)?.v1).toBe(2600);
  });
  it("prices drafts beyond the market's horizon below the furthest listed one, on the same scale", () => {
    const y3 = marketForPick({ season: "2029", round: 1, tier: "mid", tierSource: "default" }, pm)!;
    expect(y3.v1).toBe(2340);
    expect(y3.v1).toBeLessThan(pm["2028 1st"].v1);
    expect(marketForPick({ season: "2029", round: 2, tier: "mid", tierSource: "default" }, pm)!.v2).toBe(855);
    expect(marketForPick({ season: "2029", round: 7, tier: "mid", tierSource: "default" }, pm)).toBeNull();
  });
});
