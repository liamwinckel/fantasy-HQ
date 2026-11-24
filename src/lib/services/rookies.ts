/**
 * Rookie Report: this season's rookie class, scouted with real NFL data.
 * Each rookie is scored against other rookies AT HIS POSITION (so tight ends aren't buried under receivers):
 *   35% production (fantasy points per game in your scoring) · 25% role (snap share, last 3 games)
 *   20% draft capital · 20% trade value in this league.
 * Grade by that score: A ≥ 0.70, B ≥ 0.50, C ≥ 0.30, D below. Rookies on an NFL team who have played
 * or were drafted in rounds 1–3 are listed; the rest of the class is left out as noise.
 */
import type { LeagueContext } from "./league";

export interface RookieRow {
  id: string; name: string; pos: string; team: string | null; age: number | null; injury: string | null;
  draft: string; draftRound: number | null; games: number; ppg: number; last4: number; snapL3: number | null;
  yards: number; yardsLabel: string; rec: number; td: number;
  value: number; score: number; rankInClass: number; posRankInClass: number; grade: "A" | "B" | "C" | "D";
  owner: string; mine: boolean; notes: string[];
}

export function rookieReport(ctx: LeagueContext): RookieRow[] {
  const season = Number(ctx.league.season);
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";
  const byGsis = new Map<string, typeof ctx.stats>();
  for (const s of ctx.stats) if (s.week < ctx.currentWeek) (byGsis.get(s.gsis) ?? byGsis.set(s.gsis, []).get(s.gsis)!).push(s);
  const rookies = [...ctx.players.values()].filter((p) => ["QB", "RB", "WR", "TE"].includes(p.pos) && p.yearsExp === 0 && p.team);
  const comp = rookies.map((p) => {
    const v = ctx.values.get(p.id)?.[key] ?? 0;
    const pr = ctx.projections.get(p.id);
    const ex = ctx.extras.get(p.id);
    const log = ctx.logs.get(p.id) ?? [];
    const st = p.gsis ? byGsis.get(p.gsis) ?? [] : [];
    const snaps = log.slice(-3).map((g) => g.snapPct).filter((x): x is number => x !== null);
    const snapL3 = snaps.length ? snaps.reduce((a, b) => a + b, 0) / snaps.length : null;
    const games = Math.max(log.length, st.length);
    const ppg = log.length ? log.reduce((a, g) => a + g.pts, 0) / log.length : 0;
    const t = (f: (s: (typeof st)[number]) => number) => st.reduce((a, s) => a + f(s), 0);
    const yards = p.pos === "QB" ? t((s) => s.passYd) : t((s) => s.rushYd + s.recYd);
    const dc = p.draftRound === 1 ? 1 : p.draftRound === 2 ? 0.75 : p.draftRound === 3 ? 0.55 : p.draftRound ? 0.35 : 0.15;
    return { p, v, pr, ex, log, snapL3, dc, games, ppg, yards, rec: t((s) => s.rec), td: t((s) => s.rushTd + s.recTd + (p.pos === "QB" ? s.passTd : 0)) };
  }).filter((c) => c.games > 0 || (c.p.draftRound !== null && c.p.draftRound <= 3));
  // Normalise each part within the position.
  const maxBy = (pos: string, f: (c: (typeof comp)[number]) => number) => Math.max(1e-6, ...comp.filter((c) => c.p.pos === pos).map(f));
  const scored = comp.map((c) => {
    const pos = c.p.pos;
    const s = 0.35 * (c.ppg / maxBy(pos, (x) => x.ppg)) + 0.25 * (c.snapL3 ?? 0) + 0.2 * c.dc + 0.2 * (c.v / maxBy(pos, (x) => x.v));
    return { ...c, s };
  }).sort((a, b) => b.s - a.s);
  const posCount = new Map<string, number>();
  return scored.map((c, i) => {
    const pr = (posCount.get(c.p.pos) ?? 0) + 1;
    posCount.set(c.p.pos, pr);
    const owner = ctx.teams.find((t) => t.players.includes(c.p.id));
    const notes: string[] = [];
    if (c.snapL3 !== null && c.snapL3 >= 0.6) notes.push(`Every-down role (${Math.round(c.snapL3 * 100)}% of snaps lately).`);
    else if (c.snapL3 !== null && c.snapL3 < 0.3) notes.push(`Part-time role (${Math.round(c.snapL3 * 100)}% of snaps).`);
    if (c.pr && c.pr.usageFactor >= 1.08) notes.push("Usage climbing.");
    if (c.pr && c.pr.last4Avg > c.ppg * 1.25 && c.games >= 4) notes.push(`Producing more lately (${c.pr.last4Avg} pts/g last 4).`);
    if (c.p.injury) notes.push(`Injury: ${c.p.injury}.`);
    if (!c.games) notes.push("Hasn't played yet.");
    return {
      id: c.p.id, name: c.p.name, pos: c.p.pos, team: c.p.team, age: c.p.age, injury: c.p.injury,
      draft: c.ex?.draftRound ? `${season} R${c.ex.draftRound}${c.ex.draftPick ? ` #${c.ex.draftPick}` : ""}` : "Undrafted",
      draftRound: c.p.draftRound, games: c.games, ppg: Math.round(c.ppg * 10) / 10, last4: c.pr?.last4Avg ?? 0, snapL3: c.snapL3,
      yards: Math.round(c.yards), yardsLabel: c.p.pos === "QB" ? "pass yds" : c.p.pos === "RB" ? "scrimmage yds" : "yds", rec: c.rec, td: c.td,
      value: c.v, score: Math.round(c.s * 100), rankInClass: i + 1, posRankInClass: pr,
      grade: c.s >= 0.7 ? "A" : c.s >= 0.5 ? "B" : c.s >= 0.3 ? "C" : "D",
      owner: owner ? (owner.rosterId === ctx.myRosterId ? "You" : owner.name) : "Free agent", mine: owner?.rosterId === ctx.myRosterId,
      notes,
    };
  });
}
