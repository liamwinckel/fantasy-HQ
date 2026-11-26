/** League history on fixtures: FAAB market + bid suggestions, trade grades, draft grades, manager habits. */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const have = fs.existsSync(path.join(__dirname, "fixtures", "generated", "sleeper", "league__fx3-2025.json"));

describe.skipIf(!have)("league history on fixtures", () => {
  let league: typeof import("@/lib/services/league");
  let hist: typeof import("@/lib/services/history");
  beforeAll(async () => {
    (await import("./transport")).useFixtures();
    league = await import("@/lib/services/league");
    hist = await import("@/lib/services/history");
  });

  it("follows the season chain and reads FAAB bids, including losing ones", async () => {
    const ctx = await league.getLeagueContext("fx3", { userId: "389682598735060992" });
    const h = await hist.loadHistory(ctx);
    expect(h.seasons.map((s) => s.season)).toEqual(["2026", "2025"]);
    const m = hist.faabMarket(h);
    expect(m.budget).toBe(100);
    expect(m.wins.length).toBeGreaterThan(20);
    expect(m.bids.some((b) => !b.won)).toBe(true);
    // percentiles rise with demand
    expect(m.q(0.9)).toBeGreaterThan(m.q(0.5));
    const hot = hist.suggestBid({ market: m, myLeft: 60, rivalsLeft: [80, 40], fitRank: 1, trendRank: 2, weeksLeft: 3, seasonWeeks: 14, minBid: 0 });
    const meh = hist.suggestBid({ market: m, myLeft: 60, rivalsLeft: [80, 40], fitRank: 12, trendRank: null, weeksLeft: 3, seasonWeeks: 14, minBid: 0 });
    expect(hot.tier).toBe("Must-add");
    expect(hot.bid).toBeGreaterThan(meh.bid);
    expect(hot.bid).toBeLessThanOrEqual(60);
  }, 30000);

  it("grades trades and drafts", async () => {
    const ctx = await league.getLeagueContext("fx1", { userId: "389682598735060992" });
    const h = await hist.loadHistory(ctx);
    const drafts = await hist.loadDrafts(h);
    expect(drafts.length).toBe(2);
    const trades = await hist.tradeGrades(h, ctx);
    expect(trades.length).toBe(4);
    const mine = trades.find((t) => t.season === "2026" && t.sides.some((s) => s.rosterId === 1))!;
    expect(mine.sides).toHaveLength(2);
    expect(mine.sides.find((s) => s.rosterId === 4)!.got.some((g) => g.pos === "PICK")).toBe(true);
    for (const t of trades) if (!t.sides.some((s) => s.titles.length)) expect(t.sides.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 5);
    // Two grades: at the time (market value that month) and hindsight; last season's champion gets "worth it".
    for (const t of trades) for (const s of t.sides) expect(s.grade).toMatch(/^[A-F]/);
    if (fs.existsSync(path.join(__dirname, "..", "public", "data", "values-history.json"))) expect(trades.filter((t) => t.sides.every((s) => s.atGrade)).length).toBeGreaterThan(2);
    const won = trades.find((t) => t.season === "2025" && t.sides.some((s) => s.rosterId === 1))!;
    const me = won.sides.find((s) => s.rosterId === 1)!;
    if (me.pts > 0) { expect(me.titles).toEqual(["2025"]); expect(won.story).toMatch(/title/); expect(me.share).toBeGreaterThanOrEqual(0.55); }
    const g = await hist.gradeDraft(drafts[1], h, ctx);
    expect(g.teams).toHaveLength(10);
    expect(g.teams[0].surplus).toBeGreaterThanOrEqual(g.teams.at(-1)!.surplus);
    const habits = hist.managerHabits(h, null);
    expect(habits.find((x) => x.owner === "389682598735060992")!.trades).toBe(2);
  }, 30000);

  it("grades last season's redraft draft from season stats", async () => {
    const ctx = await league.getLeagueContext("fx3", { userId: "389682598735060992" });
    const h = await hist.loadHistory(ctx);
    const drafts = await hist.loadDrafts(h);
    const past = drafts.find((d) => d.season.season === "2025")!;
    const g = await hist.gradeDraft(past, h, ctx);
    expect(g.basis).toMatch(/2025 season points/);
    expect(g.teams.flatMap((t) => t.picks).some((p) => p.outcome > 50)).toBe(true);
  }, 30000);
});
