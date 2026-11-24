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
    const rules = { maxKeepers: 3, modifier: "+1" as const, undraftedRound: 16, direction: "earlier" as const, overrides: {}, perYearKept: 0, maxYears: 0, protectedRounds: 0, horizon: 1 as const, draftedMode: "drafted" as const, undraftedMode: "round" as const, adpOffset: 0, anyPick: true, missingPick: "earlier" as const };
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

  it("lineup moves only put players in slots they can play", async () => {
    const { lineupSwaps } = await import("@/lib/services/views");
    const { canFill } = await import("@/lib/engine/positions");
    for (const id of ["fx1", "fx2", "fx3"]) {
      const ctx = await mod.getLeagueContext(id, { userId: "389682598735060992" });
      for (const t of ctx.teams) for (const sw of lineupSwaps(ctx, t.rosterId)) {
        const slot = ctx.lineups.get(t.rosterId)!.current.find((c) => c.playerId === sw.outId)?.slot;
        const at = ctx.lineups.get(t.rosterId)!.current.find((c) => (sw.slot ?? "").startsWith(c.slot.replace("SUPER_FLEX", "SUPERFLEX").split("_")[0]))?.slot ?? slot;
        if (!sw.reason.startsWith("Move")) expect(canFill(slot ?? at ?? "BN", ctx.players.get(sw.inId)!.positions)).toBe(true);
      }
    }
  });

  it("keeper board places your keepers and predicts other teams' keepers at picks they own", async () => {
    const { loadKeeperPlan } = await import("@/lib/services/keeperData");
    const { getSettings } = await import("@/lib/settings");
    const ctx = await mod.getLeagueContext("fx4", { userId: "389682598735060992" });
    const p = await loadKeeperPlan(getSettings(), ctx.league, ctx);
    expect(p.board.length).toBe(p.rounds * p.order.length);
    const kept = p.board.filter((c) => c.keeper);
    expect(kept.length).toBeGreaterThan(0);
    expect(new Set(kept.map((c) => c.key)).size).toBe(kept.length); // one keeper per pick
    for (const c of kept) expect(c.keeper!.mine ? c.ownerRosterId === ctx.myRosterId : c.ownerRosterId !== ctx.myRosterId).toBe(true);
    for (const t of p.others) expect(t.keepers.length).toBeLessThanOrEqual(p.rules.maxKeepers);
    for (const r of p.rows) if (r.costRound !== null) expect(r.expectedRound).toBeGreaterThanOrEqual(1);
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
    expect(rows.every((r) => { const p = ctx.players.get(r.id)!; return p.rookieSeason === Number(ctx.league.season) || (p.rookieSeason == null && p.yearsExp === 0); })).toBe(true);
    expect(rows.some((r) => r.pos === "QB")).toBe(true);
    expect(rows[0].grade).toBe("A");
    expect(rows[rows.length - 1].grade).toBe("D");
  });
  it("SHS AI mixes experts, projection and factors, and explains itself", async () => {
    const { rankings } = await import("@/lib/services/rankings");
    const { shsAi } = await import("@/lib/services/shsai");
    for (const scope of ["week", "ros", "dynasty"] as const) {
      const ctx = await mod.getLeagueContext(scope === "dynasty" ? "fx1" : "fx3", { userId: "389682598735060992" });
      const rows = rankings(ctx, scope);
      const ai = shsAi(ctx, rows, scope, null);
      for (const r of rows) {
        const a = ai.get(r.id)!;
        if (a.pct !== null) { expect(Number.isFinite(a.pct)).toBe(true); expect(a.blend.expert + a.blend.sleeper + a.blend.market + a.blend.factors).toBeCloseTo(1); }
        if (scope !== "dynasty") for (const f of a.factors) expect(["age", "team", "coach", "usage", "draft", "college"]).not.toContain(f.key); // no dynasty data in redraft
        else for (const f of a.factors) expect(["weather", "inj", "matchup", "vegas", "script", "sched"]).not.toContain(f.key);
        if (ctx.players.get(r.id)?.pos === "QB") expect(a.factors.some((f) => f.key === "snap")).toBe(false);
        for (const f of a.factors) expect(Math.abs(f.value)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("weekly SHS AI blends prediction markets when a player has lines", async () => {
    const { rankings } = await import("@/lib/services/rankings");
    const { shsAi } = await import("@/lib/services/shsai");
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const rows = rankings(ctx, "week").filter((r) => r.ecrPos !== null && ["WR", "RB"].includes(r.pos));
    const target = rows[0];
    const proj = ctx.projStats.get(Math.min(ctx.currentWeek, ctx.lastWeek))?.get(target.id);
    ctx.signals.markets = { builtAt: new Date().toISOString(), counts: {}, players: { [target.id]: { name: target.name, team: target.team, src: ["kalshi"], lines: [{ stat: "rec_yd", line: Math.round((proj?.rec_yd ?? 50) * 2), p: 0.6 }] } } };
    const a = shsAi(ctx, rankings(ctx, "week"), "week", null).get(target.id)!;
    ctx.signals.markets = null;
    expect(a.market).not.toBeNull();
    const { DEFAULT_SHS: D } = await import("@/lib/settings");
    expect(a.mode).toBe("shs"); expect(a.blend.market).toBeCloseTo(D.lines / 100);
    // Lines above his rank value pull the SHS value up.
    expect(a.parts.some((x) => x.key === "lines")).toBe(true);
    // Markets imply roughly double his projected receiving yards → more points than Sleeper projects.
    expect(a.market!.pts).toBeGreaterThan(target.pts);
    expect(Math.abs(a.market!.value)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.pct!)).toBeLessThanOrEqual(50);
  });

  it("backtest replays past weeks without future data and grades SHS AI vs experts", async () => {
    const { runBacktest } = await import("@/lib/services/backtest");
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const S = path.join(dir, "sleeper");
    const made: string[] = [];
    for (let w = 1; w < ctx.currentWeek; w++) {
      const f = path.join(S, `projections__2026__${w}.json`);
      if (!fs.existsSync(f)) { fs.copyFileSync(path.join(S, "projections__2026__12.json"), f); made.push(f); }
    }
    // Expert ranks for each past week: players ordered by what they actually scored, scrambled a little.
    const weeks: Record<number, { at: string; rows: [string, number, number | null][] }> = {};
    for (let w = 1; w < ctx.currentWeek; w++) {
      const rows: [string, number, number | null][] = [];
      for (const pos of ["QB", "RB", "WR", "TE"]) {
        const list = [...ctx.players.values()].filter((p) => p.pos === pos).map((p) => ({ id: p.id, pts: ctx.logs.get(p.id)?.find((g) => g.week === w)?.pts ?? -1 }))
          .filter((x) => x.pts >= 0).sort((a, b) => b.pts - a.pts);
        list.forEach((x, i) => rows.push([x.id, i + 1 + ((i * 7) % 5) - 2, null]));
      }
      weeks[w] = { at: `2026-09-${10 + w}T12:00:00Z`, rows };
    }
    const file = path.join(__dirname, "..", "public", "data", "ecr-weekly-2026.json");
    const had = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    fs.writeFileSync(file, JSON.stringify({ season: 2026, weeks }));
    try {
      const r = (await runBacktest(ctx))!;
      expect(r.weeks.length).toBeGreaterThanOrEqual(4);
      for (const g of r.weeks) {
        for (const k of ["shs", "ecr", "sleeper"] as const) { expect(g[k].pairAcc).toBeGreaterThanOrEqual(0); expect(g[k].pairAcc).toBeLessThanOrEqual(100); }
      }
      // Experts here were built from the results, so they should beat a coin flip comfortably.
      expect(r.total.ecr.pairAcc).toBeGreaterThan(60);
      expect(r.tuned).not.toBeNull();
      for (const m of Object.values(r.tuned!.mult)) { expect(m).toBeGreaterThanOrEqual(0.5); expect(m).toBeLessThanOrEqual(1.5); }
    } finally {
      if (had !== null) fs.writeFileSync(file, had); else fs.rmSync(file);
      for (const f of made) fs.rmSync(f);
    }
  }, 60_000);

  it("new tools: start/sit, waiver planner, mock drafts, ask", async () => {
    const ctx = await mod.getLeagueContext("fx3", { userId: "389682598735060992" });
    const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId)!;
    const { startSit } = await import("@/lib/services/startSit");
    const ids = me.players.filter((id) => ["WR"].includes(ctx.players.get(id)?.pos ?? "")).slice(0, 3);
    const ss = startSit(ctx, ids, Math.min(ctx.currentWeek, ctx.lastWeek));
    expect(ss.reduce((a, r) => a + r.best, 0)).toBeCloseTo(100, 0);
    const { waiverPlan } = await import("@/lib/services/waiverPlan");
    const wp = waiverPlan(ctx, me.rosterId);
    expect(wp.weeks.length).toBeGreaterThan(0);
    const md = await import("@/lib/services/mockDraft");
    const st = md.buildMock(ctx, "redraft", { slot: 3 });
    expect(st.picks.filter((p) => p.round === 1)[2].owner).toBe(st.me);
    let r = 0.3; const rand = () => (r = (r * 9301 + 49297) % 233280 / 233280);
    for (let i = 0; i < st.picks.length; i++) { const pk = md.nextPick(st)!; pk.playerId = pk.owner === st.me ? md.suggestions(st, 1)[0].p.id : md.botPick(st, rand); }
    expect(new Set(st.picks.map((p) => p.playerId)).size).toBe(st.picks.length);
    // nobody drafts a kicker in round 1, every team ends with its starting QB
    expect(st.picks.filter((p) => p.round <= 3).every((p) => !["K", "DEF"].includes(st.pool.get(p.playerId!)!.pos))).toBe(true);
    const g = md.gradeDraft(ctx, st);
    expect(g[0].grade).toBe("A");
    const dy = await mod.getLeagueContext("fx1", { userId: "389682598735060992" });
    const rk = md.buildMock(dy, "rookie", { rookies: [{ n: "Test Prospect", p: "WR", t: "OSU", e: 1, s: null }] });
    expect(rk.picks.length).toBeGreaterThan(0);
    const { ask, findPlayers } = await import("@/lib/services/ask");
    const a = ctx.players.get(ids[0])!, b = ctx.players.get(ids[1])!;
    expect(findPlayers(ctx, `start ${a.name} or ${b.name}?`)).toEqual([a.id, b.id]);
    expect(ask(ctx, `Should I start ${a.name} or ${b.name}?`).answer.text).toMatch(/start /);
    // Same players, any wording: rest of season, then a follow-up that only changes the time frame.
    const ros = ask(ctx, `${a.name} or ${b.name} rest of season`);
    expect(ros.answer.text).toMatch(/^Rest of season/);
    expect(ask(ctx, `rest of season who's better, ${b.name} vs ${a.name}`).answer.text).toMatch(/^Rest of season/);
    const fu = ask(ctx, "what about this week?", [], ros.memory);
    expect(fu.answer.text).toMatch(/^This week: start/);
    expect(ask(ctx, "for the playoffs", [], ros.memory).answer.text).toMatch(/^For the playoffs/);
    expect(ask(ctx, "what are my playoff odds").answer.text).toMatch(/playoffs/);
    expect(ask(ctx, "top 5 wrs rest of season").answer.bullets!.length).toBe(5);
    expect(ask(ctx, "hello").answer.bullets!.length).toBeGreaterThan(3);
    // A suggestion-style question after a player question must not reuse the old player.
    const one = ask(ctx, `tell me about ${a.name}`);
    const pick = ask(ctx, "Best RB pickups", [], one.memory);
    expect(pick.memory.players).toEqual([]);
    expect(pick.answer.text).toMatch(/pickups|free agent/i);
    expect(ask(ctx, "is he worth it rest of season", [], one.memory).memory.players).toEqual([a.id]);
    // Trades: first names and one-sided trade questions.
    const other = ctx.teams.find((t) => t.rosterId !== me.rosterId)!;
    const theirs = other.players.find((id) => ["RB", "WR"].includes(ctx.players.get(id)?.pos ?? ""))!;
    const tr = ask(ctx, `trade ${a.name} for ${ctx.players.get(theirs)!.name}, fair?`);
    expect(tr.answer.text).toMatch(/favours|even|Fits|Add assets/i);
    const solo = ask(ctx, `what would it take to trade for ${ctx.players.get(theirs)!.name}`);
    expect(solo.memory.topic).toBe("trade");
    const { suggestionsFor } = await import("@/lib/services/ask");
    expect(suggestionsFor(ctx).length).toBeGreaterThan(5);
  });
});
