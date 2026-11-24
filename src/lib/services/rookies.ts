/**
 * Rookie Report: this season's rookie class, scouted with real NFL data.
 *
 * Model (draft-capital first, the approach most rookie models that hold up are built on — NFL teams' own investment
 * is the single best predictor of a rookie's career — then what the NFL is actually doing with him):
 *   Draft capital 35% · Role 25% (snap share; QBs: share of team dropbacks) · Opportunity & production 25%
 *   (expected points from his touches/targets + points per game) · Age 10% (younger at draft = more runway) ·
 *   Landing spot 5% (his offense's scoring rank).
 * Every part is scored against rookies at his own position, so tight ends and QBs aren't buried under receivers.
 * Grade: A ≥ 70, B ≥ 50, C ≥ 30, D below. Listed: rookies on an NFL team who have played or were drafted.
 */
import type { LeagueContext } from "./league";

export interface RookieParts { capital: number; role: number; output: number; age: number; spot: number }
export interface RookieRow {
  id: string; name: string; pos: string; team: string | null; age: number | null; injury: string | null;
  draft: string; draftRound: number | null; games: number; ppg: number; last4: number; snapL3: number | null;
  yards: number; yardsLabel: string; rec: number; td: number; xfpg: number | null;
  value: number; score: number; rankInClass: number; posRankInClass: number; grade: "A" | "B" | "C" | "D";
  parts: RookieParts;
  owner: string; mine: boolean; notes: string[];
}
export const ROOKIE_WEIGHTS: RookieParts = { capital: 0.35, role: 0.25, output: 0.25, age: 0.1, spot: 0.05 };

/** Draft capital 0–1 from the overall pick (round fallback): steep at the top, like real hit rates. */
export function capitalScore(pick: number | null | undefined, round: number | null | undefined): number {
  const pk = pick ?? (round ? (round - 0.5) * 32 : null);
  if (!pk) return 0.05;
  return Math.max(0.05, Math.exp(-(pk - 1) / 60));
}

export function rookieReport(ctx: LeagueContext): RookieRow[] {
  const season = Number(ctx.league.season);
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";
  const byGsis = new Map<string, typeof ctx.stats>();
  for (const s of ctx.stats) if (s.week < ctx.currentWeek) (byGsis.get(s.gsis) ?? byGsis.set(s.gsis, []).get(s.gsis)!).push(s);
  const teamAtt = new Map<string, number>();
  for (const s of ctx.stats) if (s.week < ctx.currentWeek) teamAtt.set(`${s.team}:${s.week}`, (teamAtt.get(`${s.team}:${s.week}`) ?? 0) + s.att);
  // Rookie = first NFL season is this one (nflverse), or Sleeper says 0 years of experience.
  const isRookie = (p: { yearsExp: number | null; rookieSeason?: number | null }) => p.rookieSeason === season || (p.rookieSeason == null && p.yearsExp === 0);
  const rookies = [...ctx.players.values()].filter((p) => ["QB", "RB", "WR", "TE"].includes(p.pos) && p.team && isRookie(p));
  const comp = rookies.map((p) => {
    const v = ctx.values.get(p.id)?.[key] ?? 0;
    const pr = ctx.projections.get(p.id);
    const ex = ctx.extras.get(p.id);
    const log = ctx.logs.get(p.id) ?? [];
    const st = p.gsis ? (byGsis.get(p.gsis) ?? []).sort((a, b) => a.week - b.week) : [];
    const snaps = log.slice(-3).map((g) => g.snapPct).filter((x): x is number => x !== null);
    let role: number | null = snaps.length ? snaps.reduce((a, b) => a + b, 0) / snaps.length : null;
    if (p.pos === "QB") {
      const last = st.slice(-3);
      role = last.length ? last.reduce((a, s) => a + Math.min(1, s.att / Math.max(1, teamAtt.get(`${s.team}:${s.week}`) ?? 1)), 0) / last.length : null;
    }
    const games = Math.max(log.length, st.length);
    const ppg = log.length ? log.reduce((a, g) => a + g.pts, 0) / log.length : 0;
    const t = (f: (s: (typeof st)[number]) => number) => st.reduce((a, s) => a + f(s), 0);
    const yards = p.pos === "QB" ? t((s) => s.passYd + s.rushYd) : t((s) => s.rushYd + s.recYd);
    const xf = p.gsis ? ctx.signals.xfp.get(p.gsis) : undefined;
    const xfpg = xf && xf.games ? xf.recentXfp : null;
    const pick = p.draftPick ?? ex?.draftPick ?? null;
    const round = p.draftRound ?? ex?.draftRound ?? null;
    return { p, v, pr, ex, snapL3: role, games, ppg, yards, xfpg, pick, round, cap: capitalScore(pick, round),
      rec: t((s) => s.rec), td: t((s) => s.rushTd + s.recTd + (p.pos === "QB" ? s.passTd : 0)) };
  }).filter((c) => c.games > 0 || c.round !== null);
  const maxBy = (pos: string, f: (c: (typeof comp)[number]) => number) => Math.max(1e-6, ...comp.filter((c) => c.p.pos === pos).map(f));
  const scored = comp.map((c) => {
    const pos = c.p.pos;
    const out = c.games ? (c.xfpg !== null ? 0.5 * (c.xfpg / maxBy(pos, (x) => x.xfpg ?? 0)) + 0.5 * (c.ppg / maxBy(pos, (x) => x.ppg)) : c.ppg / maxBy(pos, (x) => x.ppg)) : 0;
    const ageAtDraft = c.p.age !== null ? c.p.age - (new Date().getMonth() >= 4 ? (new Date().getMonth() - 3) / 12 : 0) : null;
    const age = ageAtDraft === null ? 0.5 : Math.max(0, Math.min(1, (23.5 - ageAtDraft) / 3 + 0.5)); // 22 → 1.0, 23.5 → 0.5, 25 → 0
    const rank = c.ex?.offense?.rank ?? null;
    const spot = rank ? (33 - rank) / 32 : 0.5;
    const parts: RookieParts = { capital: c.cap, role: c.snapL3 ?? 0, output: out, age, spot };
    const s = (Object.keys(ROOKIE_WEIGHTS) as (keyof RookieParts)[]).reduce((a, k) => a + ROOKIE_WEIGHTS[k] * parts[k], 0);
    return { ...c, s, parts };
  }).sort((a, b) => b.s - a.s);
  const posCount = new Map<string, number>();
  return scored.map((c, i) => {
    const pr = (posCount.get(c.p.pos) ?? 0) + 1;
    posCount.set(c.p.pos, pr);
    const owner = ctx.teams.find((t) => t.players.includes(c.p.id));
    const notes: string[] = [];
    if (c.round === 1) notes.push("First-round investment.");
    if (c.snapL3 !== null && c.snapL3 >= (c.p.pos === "QB" ? 0.8 : 0.6)) notes.push(c.p.pos === "QB" ? "Starting." : `Every-down role (${Math.round(c.snapL3 * 100)}% of snaps lately).`);
    else if (c.snapL3 !== null && c.snapL3 < 0.3 && c.games) notes.push(c.p.pos === "QB" ? "Not starting yet." : `Part-time role (${Math.round(c.snapL3 * 100)}% of snaps).`);
    if (c.xfpg !== null && c.games >= 3 && c.ppg < c.xfpg * 0.8) notes.push("Scoring below his opportunity: due for more.");
    if (c.pr && c.pr.usageFactor >= 1.08) notes.push("Usage climbing.");
    if (c.p.injury) notes.push(`Injury: ${c.p.injury}.`);
    if (!c.games) notes.push("Hasn't played yet.");
    return {
      id: c.p.id, name: c.p.name, pos: c.p.pos, team: c.p.team, age: c.p.age, injury: c.p.injury,
      draft: c.round ? `R${c.round}${c.pick ? ` · #${c.pick}` : ""}` : "Undrafted",
      draftRound: c.round, games: c.games, ppg: Math.round(c.ppg * 10) / 10, last4: c.pr?.last4Avg ?? 0, snapL3: c.snapL3,
      yards: Math.round(c.yards), yardsLabel: c.p.pos === "QB" ? "pass+rush yds" : c.p.pos === "RB" ? "scrimmage yds" : "yds", rec: c.rec, td: c.td,
      xfpg: c.xfpg !== null ? Math.round(c.xfpg * 10) / 10 : null,
      value: c.v, score: Math.round(c.s * 100), rankInClass: i + 1, posRankInClass: pr,
      grade: c.s >= 0.7 ? "A" : c.s >= 0.5 ? "B" : c.s >= 0.3 ? "C" : "D",
      parts: c.parts,
      owner: owner ? (owner.rosterId === ctx.myRosterId ? "You" : owner.name) : "Free agent", mine: owner?.rosterId === ctx.myRosterId,
      notes,
    };
  });
}
