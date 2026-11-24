import { describe, expect, it } from "vitest";
import { fitMean, kalshiProb, marketMeans, marketPoints, parseKalshiLabel, parsePolyQuestion, statFromText } from "@/lib/markets";
import { parseNgs, parsePfrAdv, parseXfp } from "@/lib/nflverse/signals";
import { practiceCode } from "@/lib/nflverse/parse";

describe("prediction markets", () => {
  it("reads Kalshi labels and series titles", () => {
    expect(parseKalshiLabel("Dalton Kincaid: 30+")).toEqual({ name: "Dalton Kincaid", line: 30 });
    expect(parseKalshiLabel("Amon-Ra St. Brown: 100+")).toEqual({ name: "Amon-Ra St. Brown", line: 100 });
    expect(statFromText("BUF Bills vs NY Jets: Receiving Yards")).toBe("rec_yd");
    expect(statFromText("Pro Football Rushing + Receiving Yards")).toBe("rr_yd");
    expect(statFromText("NFL: 1000+ Receiving Yards Season")).toBeNull();
    expect(statFromText("Anytime Touchdown Scorer")).toBe("td");
  });
  it("prices from bid/ask or dollars", () => {
    expect(kalshiProb({ yes_bid: 60, yes_ask: 66 })).toBeCloseTo(0.63);
    expect(kalshiProb({ yes_bid_dollars: "0.40", yes_ask_dollars: "0.44" })).toBeCloseTo(0.42);
    expect(kalshiProb({ yes_bid: 0, yes_ask: 0, last_price: 51 })).toBeCloseTo(0.51);
  });
  it("reads Polymarket O/U questions", () => {
    expect(parsePolyQuestion("Josh Allen: Passing Yards O/U 249.5", ["Over", "Under"], [0.55, 0.45])).toEqual({ name: "Josh Allen", stat: "pass_yd", line: 250, p: 0.55 });
  });
  it("fits a sensible mean to a yardage ladder", () => {
    const mu = fitMean("rec_yd", [{ line: 30, p: 0.63 }, { line: 40, p: 0.51 }, { line: 60, p: 0.3 }])!;
    expect(mu).toBeGreaterThan(35); expect(mu).toBeLessThan(55);
    const td = marketMeans([{ stat: "td", line: 1, p: 0.4 }]).td!;
    expect(td).toBeCloseTo(-Math.log(0.6), 1);
  });
  it("scores market lines in league scoring, keeping uncovered stats", () => {
    const sc = { rec: 1, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, rush_td: 6 };
    const r = marketPoints([{ stat: "rec_yd", line: 50, p: 0.5 }, { stat: "td", line: 1, p: 0.4 }], { rec: 5, rec_yd: 60, rec_td: 0.4 }, sc, "WR")!;
    expect(r.covered.sort()).toEqual(["rec_yd", "td"]);
    expect(r.pts).toBeGreaterThan(8); expect(r.pts).toBeLessThan(16);
  });
});

describe("advanced signals", () => {
  it("parses xFP, NGS, PFR and practice codes", () => {
    const x = parseXfp("season,week,player_id,total_fantasy_points_exp,total_fantasy_points\n2026,1,00-1,12.5,15\n2025,1,00-1,1,1\n", 2026);
    expect(x).toEqual([{ gsis: "00-1", week: 1, xfp: 12.5, fp: 15 }]);
    const rec = "season,season_type,week,player_gsis_id,targets,receptions,avg_separation,avg_yac_above_expectation\n2026,REG,1,00-1,10,6,3,1\n2026,REG,2,00-1,30,20,2,0\n2026,REG,0,00-1,40,26,9,9\n";
    const n = parseNgs(rec, "", "", 2026)[0];
    expect(n.sep).toBeCloseTo(2.25); expect(n.tgt).toBe(40);
    const rush = "season,game_type,week,pfr_player_id,carries,rushing_yards_after_contact,rushing_broken_tackles\n2026,REG,1,AbcX00,10,30,2\n2026,REG,2,AbcX00,10,10,0\n";
    const p = parsePfrAdv("", rush, "", new Map([["AbcX00", "00-9"]]), 2026)[0];
    expect(p).toMatchObject({ gsis: "00-9", games: 2, yacoAtt: 2, btPerG: 1 });
    expect(practiceCode("Limited Participation in Practice", "Hamstring")).toBe("LP");
    expect(practiceCode("Did Not Participate In Practice", "Not injury related - resting player")).toBe("");
  });
});
