/**
 * Rookie Report: this season's rookie class, scouted with real NFL data.
 * Grade = percentile within the class of a composite: 40% dynasty value, 25% opportunity (snap share / role),
 * 20% draft capital, 15% production per game. A ≥ 80th percentile, B ≥ 55th, C ≥ 30th, D below.
 * Upcoming-class (college) prospects aren't included: there's no free, key-less source until NFLverse
 * publishes combine and draft data in the spring.
 */
import type { LeagueContext } from "./league";

export interface RookieRow {
  id: string; name: string; pos: string; team: string | null; age: number | null;
  draft: string; draftRound: number | null; games: number; ppg: number; last4: number; snapL3: number | null;
  dynasty: number; redraft: number; rankInClass: number; posRankInClass: number; grade: "A" | "B" | "C" | "D";
  owner: string; mine: boolean; nextYearPpg: number; notes: string[];
}

export function rookieReport(ctx: LeagueContext): RookieRow[] {
  const season = Number(ctx.league.season);
  const rookies = [...ctx.players.values()].filter((p) => ["QB", "RB", "WR", "TE"].includes(p.pos) && (p.yearsExp === 0));
  const comp = rookies.map((p) => {
    const v = ctx.values.get(p.id);
    const pr = ctx.projections.get(p.id);
    const ex = ctx.extras.get(p.id);
    const log = ctx.logs.get(p.id) ?? [];
    const snaps = log.slice(-3).map((g) => g.snapPct).filter((x): x is number => x !== null);
    const snapL3 = snaps.length ? snaps.reduce((a, b) => a + b, 0) / snaps.length : null;
    const dc = p.draftRound === 1 ? 1 : p.draftRound === 2 ? 0.75 : p.draftRound === 3 ? 0.55 : p.draftRound ? 0.35 : 0.15;
    return { p, v, pr, ex, log, snapL3, dc };
  });
  const maxDyn = Math.max(1, ...comp.map((c) => c.v?.dynasty ?? 0));
  const maxPpg = Math.max(1, ...comp.map((c) => c.pr?.seasonAvg ?? 0));
  const scored = comp.map((c) => ({ ...c, s: 0.4 * ((c.v?.dynasty ?? 0) / maxDyn) + 0.25 * (c.snapL3 ?? 0) + 0.2 * c.dc + 0.15 * ((c.pr?.seasonAvg ?? 0) / maxPpg) }));
  scored.sort((a, b) => b.s - a.s);
  const n = scored.length;
  const posCount = new Map<string, number>();
  return scored.map((c, i) => {
    const pctile = n > 1 ? 1 - i / (n - 1) : 1;
    const pr = posCount.get(c.p.pos) ?? 0;
    posCount.set(c.p.pos, pr + 1);
    const owner = ctx.teams.find((t) => t.players.includes(c.p.id));
    const notes: string[] = [];
    if (c.snapL3 !== null && c.snapL3 >= 0.6) notes.push(`Every-down role: ${Math.round(c.snapL3 * 100)}% of snaps lately.`);
    else if (c.snapL3 !== null && c.snapL3 < 0.3) notes.push(`Limited role so far (${Math.round(c.snapL3 * 100)}% snaps).`);
    if (c.pr && c.pr.usageFactor >= 1.08) notes.push("Usage climbing.");
    if (c.pr && c.pr.last4Avg > c.pr.seasonAvg * 1.25 && c.pr.games >= 4) notes.push(`Producing more lately (${c.pr.last4Avg} pts/g last 4).`);
    if (!c.log.length) notes.push("Hasn't played yet this season.");
    return {
      id: c.p.id, name: c.p.name, pos: c.p.pos, team: c.p.team, age: c.p.age,
      draft: c.ex?.draftRound ? `${season} R${c.ex.draftRound}${c.ex.draftPick ? ` #${c.ex.draftPick}` : ""}` : "Undrafted",
      draftRound: c.p.draftRound, games: c.pr?.games ?? 0, ppg: c.pr?.seasonAvg ?? 0, last4: c.pr?.last4Avg ?? 0, snapL3: c.snapL3,
      dynasty: c.v?.dynasty ?? 0, redraft: c.v?.redraft ?? 0, rankInClass: i + 1, posRankInClass: pr + 1,
      grade: pctile >= 0.8 ? "A" : pctile >= 0.55 ? "B" : pctile >= 0.3 ? "C" : "D",
      owner: owner ? (owner.rosterId === ctx.myRosterId ? "You" : owner.name) : "Free agent", mine: owner?.rosterId === ctx.myRosterId,
      nextYearPpg: Math.round((c.pr?.base ?? 0) * (c.p.pos === "WR" || c.p.pos === "TE" ? 1.12 : 1.05) * 10) / 10,
      notes,
    };
  });
}
