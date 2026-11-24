/**
 * End-to-end check of the league pipeline on Sleeper-shaped fixtures built from real NFLverse 2026 stats.
 * Generate fixtures first: npx tsx tests/fixtures/build.ts (needs the NFLverse CSVs in tests/fixtures/generated/nflverse).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = path.join(__dirname, "fixtures", "generated");
const have = fs.existsSync(path.join(dir, "sleeper", "league__fx1.json"));

describe.skipIf(!have)("league context on fixtures", () => {
  let mod: typeof import("@/lib/services/league");
  let trade: typeof import("@/lib/engine/trade");
  let power: typeof import("@/lib/engine/power");
  let views: typeof import("@/lib/services/views");
  let waivers: typeof import("@/lib/services/waivers");
  beforeAll(async () => {
    (await import("./transport")).useFixtures();
    mod = await import("@/lib/services/league");
    trade = await import("@/lib/engine/trade");
    power = await import("@/lib/engine/power");
    views = await import("@/lib/services/views");
    waivers = await import("@/lib/services/waivers");
  });

  it.each(["fx1", "fx2", "fx3"])("%s builds a consistent context", async (id) => {
    const ctx = await mod.getLeagueContext(id, { userId: "389682598735060992" });
    expect(ctx.myRosterId).toBe(1);
    expect(ctx.teams.length).toBe(ctx.teamsCount);
    // projections never negative, ranges ordered
    for (const pr of ctx.projections.values()) {
      expect(pr.median).toBeGreaterThanOrEqual(0);
      expect(pr.low).toBeLessThanOrEqual(pr.high + 1e-9);
    }
    // best lineup is at least as good as the current lineup for every team
    for (const lu of ctx.lineups.values()) expect(lu.optimalTotal + 1e-6).toBeGreaterThanOrEqual(lu.currentTotal);
    // odds are percentages that sum sensibly
    const playoffSum = Object.values(ctx.sim.playoffOdds).reduce((a, b) => a + b, 0);
    expect(playoffSum).toBeCloseTo((ctx.league.settings.playoff_teams || 6) * 100, -1);
    // every roster has a classification
    expect(ctx.classifications.size).toBe(ctx.showClasses ? ctx.teams.length : 0);
    // values are scaled 0-100
    const maxV = Math.max(...[...ctx.values.values()].map((v) => (ctx.valuationMode === "dynasty" ? v.dynasty : v.redraft)));
    expect(maxV).toBeCloseTo(100, 0);
  });

  it("redraft leagues give picks no value; dynasty leagues do", async () => {
    const rd = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const dy = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    expect(rd.picks.every((p) => p.value === 0)).toBe(true);
    expect(dy.picks.some((p) => p.value > 20)).toBe(true);
    // traded pick in fixture: fx1 2027 R1 of roster 10 now owned by roster 7
    expect(dy.picks.find((p) => p.key === "2027-1-10")?.ownerRosterId).toBe(7);
  });

  it("evaluates a player + pick trade from both sides", async () => {
    const ctx = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    const me = ctx.teams.find((t) => t.rosterId === 1)!;
    const them = ctx.teams.find((t) => t.rosterId === 2)!;
    const myPick = ctx.picks.find((p) => p.ownerRosterId === 1 && p.round === 1)!;
    const r = trade.evaluateTrade(ctx, { teamA: 1, teamB: 2, aSends: [`p:${me.players[0]}`, `k:${myPick.key}`], bSends: [`p:${them.players[0]}`], mode: "dynasty" });
    expect(r.assets.length).toBe(3);
    expect(r.market.netForA).toBeCloseTo(r.market.bSends - r.market.aSends, 1);
    expect(r.confidence).toBeGreaterThanOrEqual(40);
    expect(r.odds).not.toBeNull();
    const redraft = trade.evaluateTrade(ctx, { teamA: 1, teamB: 2, aSends: [`k:${myPick.key}`], bSends: [], mode: "redraft" });
    expect(redraft.market.aSends).toBe(0);
  });

  it("strategy labels exist only in dynasty leagues", async () => {
    const rd = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const dy = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    expect(rd.showClasses).toBe(false);
    expect(rd.classifications.size).toBe(0);
    expect(dy.showClasses).toBe(true);
    const me = rd.teams.find((t) => t.rosterId === 1)!;
    const r = trade.evaluateTrade(rd, { teamA: 1, teamB: 2, aSends: [`p:${me.players[0]}`], bSends: [], mode: "redraft" });
    expect(r.classA).toBeNull();
    expect(r.assets[0].toA).toBe(r.assets[0].market);
  });

  it("power rankings rank every team once and react to roster changes", async () => {
    const ctx = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    const p = power.powerRankings(ctx);
    expect(p.map((x) => x.rank).sort((a, b) => a - b)).toEqual(ctx.teams.map((_, i) => i + 1));
    expect(Math.max(...p.map((x) => x.score))).toBeLessThanOrEqual(100);
    // Give team 2 my best starter: team 2 should not get weaker
    const me = ctx.teams.find((t) => t.rosterId === 1)!;
    const two = ctx.teams.find((t) => t.rosterId === 2)!;
    const star = ctx.lineups.get(1)!.optimal.find((s) => s.playerId)!.playerId!;
    const after = power.powerRankings(ctx, new Map([[1, me.players.filter((x) => x !== star)], [2, [...two.players, star]]]));
    expect(after.find((x) => x.rosterId === 2)!.score).toBeGreaterThanOrEqual(p.find((x) => x.rosterId === 2)!.score);
    expect(after.find((x) => x.rosterId === 1)!.score).toBeLessThanOrEqual(p.find((x) => x.rosterId === 1)!.score);
  });

  it("trade result carries a balance, power shift and fair-deal suggestions", async () => {
    const ctx = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    const two = ctx.teams.find((t) => t.rosterId === 2)!;
    const best = [...two.players].sort((a, b) => (ctx.values.get(b)?.dynasty ?? 0) - (ctx.values.get(a)?.dynasty ?? 0))[0];
    const r = trade.evaluateTrade(ctx, { teamA: 1, teamB: 2, aSends: [], bSends: [`p:${best}`], mode: "dynasty" });
    expect(r.balance).toBeGreaterThan(0); // getting something for nothing = you win
    expect(r.power.length).toBe(ctx.teams.length);
    expect(r.suggestions.some((s) => s.action === "add" && s.side === "a")).toBe(true);
    expect(r.positionsA.some((x) => x.pos === "Depth")).toBe(true);
  });

  it("week views: past weeks are actual, future weeks are projected", async () => {
    const ctx = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    const past = views.gameView(ctx, 1, 3);
    expect(past.kind).toBe("past");
    expect(past.result).not.toBeNull();
    expect(past.a.bestPossible! + 1e-6).toBeGreaterThanOrEqual(past.a.actual!);
    const fut = views.gameView(ctx, 1, ctx.currentWeek + 1);
    expect(fut.kind).toBe("future");
    expect(fut.a.projected).toBeGreaterThan(0);
    expect(fut.winProbA).not.toBeNull();
    expect(views.weekGames(ctx, 3).length).toBe(ctx.teams.length / 2);
  });

  it("waiver report only suggests free agents and non-essential drops", async () => {
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const r = waivers.waiverReport(ctx, 1);
    const rostered = new Set(ctx.teams.flatMap((t) => t.players));
    expect(r.topAdds.length).toBeGreaterThan(0);
    expect(r.topAdds.every((w) => !rostered.has(w.player.id))).toBe(true);
    const myOptimal = new Set(ctx.lineups.get(1)!.optimal.map((s) => s.playerId));
    expect(r.drops.every((d) => !myOptimal.has(d.player.id))).toBe(true);
  });

  it("a stud beats a pile of depth, and extra bodies cost roster spots", async () => {
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const me = ctx.teams.find((t) => t.rosterId === 1)!;
    const two = ctx.teams.find((t) => t.rosterId === 2)!;
    const v = (id: string) => ctx.values.get(id)?.redraft ?? 0;
    const myStar = [...me.players].sort((a, b) => v(b) - v(a))[0];
    const depth = [...two.players].sort((a, b) => v(b) - v(a)).slice(4, 8); // four mid-value players
    const r = trade.evaluateTrade(ctx, { teamA: 1, teamB: 2, aSends: [`p:${myStar}`], bSends: depth.map((x) => `p:${x}`), mode: "redraft" });
    expect(r.market.bSends).toBeLessThan(r.market.bSendsRaw); // package discount applied
    expect(r.rosterSpots.a.extra).toBe(3);
    expect(r.rosterSpots.a.cost).toBeGreaterThanOrEqual(0);
    expect(r.rosterSpots.a.drops.length).toBe(3);
    const pl = r.assets.find((a) => a.kind === "player")!;
    expect(pl.drivers.some((d) => d.label === "Opportunity")).toBe(true);
  });

  it("dynasty players carry contract and durability drivers", async () => {
    const ctx = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    const me = ctx.teams.find((t) => t.rosterId === 1)!;
    const r = trade.evaluateTrade(ctx, { teamA: 1, teamB: 2, aSends: [`p:${me.players[0]}`], bSends: [], mode: "dynasty" });
    const labels = r.assets[0].drivers.map((d) => d.label);
    expect(labels).toEqual(expect.arrayContaining(["Age", "Contract", "Durability"]));
    const withContract = [...ctx.extras.values()].filter((e) => e.contract).length;
    expect(withContract).toBeGreaterThan(50);
  });

  it("keeper plan applies round modifiers and recommends at most N", async () => {
    const { keeperPlan } = await import("@/lib/engine/keepers");
    const { sleeper } = await import("@/lib/sleeper/client");
    const ctx = await mod.getLeagueContext("fx4", { userId: "389682598735060992" });
    expect(ctx.format).toBe("keeper");
    const picks = (await sleeper.draftPicks(ctx.league.draft_id!)).data;
    const rules = { maxKeepers: 3, modifier: "+1" as const, undraftedRound: 16, direction: "earlier" as const, overrides: {} };
    const rows = keeperPlan(ctx, 1, picks, rules, 16);
    const drafted = rows.find((r) => r.draftedRound && r.draftedRound > 1)!;
    expect(drafted.costRound).toBe(drafted.draftedRound! - 1);
    const firstRounder = rows.find((r) => r.draftedRound === 1);
    if (firstRounder) { expect(firstRounder.costRound).toBe(1); expect(firstRounder.capped).toBe(true); } // can't go earlier than round 1
    expect(rows.some((r) => r.costSource === "undrafted" && r.costRound === 16)).toBe(true);
    expect(rows.filter((r) => r.recommended).length).toBeLessThanOrEqual(3);
    const manual = keeperPlan(ctx, 1, picks, { ...rules, overrides: { [drafted.playerId]: 9 } }, 16);
    expect(manual.find((r) => r.playerId === drafted.playerId)!.costRound).toBe(9);
  });

  it("Trade Finder suggests deals that help both sides and only uses real assets", async () => {
    const { findTrades } = await import("@/lib/services/tradeFinder");
    for (const id of ["fx3", "fx1"]) {
      const ctx = await mod.getLeagueContext(id, { userId: "389682598735060992" });
      const { profiles, trades } = findTrades(ctx, 1);
      expect(profiles.length).toBe(ctx.teams.length);
      expect(trades.length).toBeGreaterThan(0);
      for (const t of trades) {
        const partner = ctx.teams.find((x) => x.rosterId === t.partner)!;
        const me = ctx.teams.find((x) => x.rosterId === 1)!;
        for (const g of t.give.filter((x) => x.id.startsWith("p:"))) expect(me.players).toContain(g.id.slice(2));
        for (const g of t.get.filter((x) => x.id.startsWith("p:"))) expect(partner.players).toContain(g.id.slice(2));
        for (const k of [...t.give, ...t.get].filter((x) => x.id.startsWith("k:"))) expect(ctx.picks.some((p) => `k:${p.key}` === k.id)).toBe(true);
        if (ctx.valuationMode === "redraft") { expect(t.myRos).toBeGreaterThan(0); expect(t.theirRos).toBeGreaterThan(-6.01); }
        expect(t.fairness).toBeLessThan(0.41);
      }
    }
  });

  it("waiver impact requires a drop when the roster is full", async () => {
    const w = await import("@/lib/services/waivers");
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const space = w.rosterSpace(ctx, 1);
    expect(space.full).toBe(true); // fixture rosters are drafted to the limit
    const add = w.waiverReport(ctx, 1).topAdds[0];
    const drop = add.drop!.id;
    const r = w.waiverImpact(ctx, 1, add.player.id, drop);
    expect(r.mustDrop).toBe(true);
    expect(r.drop?.id).toBe(drop);
    expect(r.rosAfter - r.rosBefore).toBeCloseTo(add.rosGain, 0);
  });

  it("Breakout Finder: only healthy rookies to third-year players with a role", async () => {
    const { breakouts } = await import("@/lib/services/breakouts");
    const ctx = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    const rows = breakouts(ctx);
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r) => r.score >= 25 && r.score <= 100)).toBe(true);
    expect(rows.every((r) => r.yearsExp <= 2)).toBe(true);
    expect(rows.every((r) => !["Out", "IR", "PUP", "Sus", "NFI", "Doubtful"].includes(r.injury ?? ""))).toBe(true);
    expect(rows.every((r) => (ctx.projections.get(r.id)!.median > 0 || ctx.projections.get(r.id)!.onBye))).toBe(true);
  });

  it("Waivers only suggest healthy players projected to play", async () => {
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const w = await import("@/lib/services/waivers");
    const r = w.waiverReport(ctx, 1);
    expect(r.topAdds.length).toBeGreaterThan(0);
    for (const a of r.topAdds) {
      expect(["IR", "Out", "PUP", "NFI", "Sus"]).not.toContain(a.player.injury ?? "");
      expect(Object.values(a.proj.byWeek).some((v) => v > 0.5)).toBe(true);
    }
  });

  it("Projections come from Sleeper when available", async () => {
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const withSleeper = [...ctx.projections.values()].filter((p) => p.source === "sleeper").length;
    expect(withSleeper).toBeGreaterThan(ctx.projections.size * 0.9);
  });

  it("Redraft values respect replacement level (waiver wire or last starter)", async () => {
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    for (const [pos, repl] of Object.entries(ctx.replacement)) expect(repl).toBeGreaterThanOrEqual(0.95 * (ctx.waiverLevel[pos] ?? 0) - 0.11);
  });

  it("Rookie Report grades only rookies", async () => {
    const { rookieReport } = await import("@/lib/services/rookies");
    const ctx = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    const rows = rookieReport(ctx);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => ctx.players.get(r.id)!.yearsExp === 0)).toBe(true);
    expect(rows[0].grade).toBe("A");
    expect(rows[rows.length - 1].grade).toBe("D");
  });
  it("SHS AI stays within ±25% of ECR and explains itself", async () => {
    const { rankings } = await import("@/lib/services/rankings");
    const { shsAi } = await import("@/lib/services/shsai");
    for (const scope of ["week", "ros", "dynasty"] as const) {
      const ctx = await mod.getLeagueContext(scope === "dynasty" ? "fx1" : "fx3", { userId: "389682598735060992" });
      const rows = rankings(ctx, scope);
      const ai = shsAi(ctx, rows, scope, null);
      for (const r of rows) {
        const a = ai.get(r.id)!;
        if (a.pct !== null) { expect(Math.abs(a.pct)).toBeLessThanOrEqual(25); expect(a.factors.length).toBeGreaterThan(0); }
        for (const f of a.factors) expect(Math.abs(f.value)).toBeLessThanOrEqual(1);
      }
    }
  });
});
