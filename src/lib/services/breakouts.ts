/**
 * Breakout Finder (SHS model): rookies, second- and third-year players whose profile points to a jump.
 *
 * Only young players (0–2 years of NFL experience) who are healthy, on a team and projected to play
 * are scored; players who are already top-tier at their position are left out.
 *
 *   20% opportunity share   target share (WR/TE), share of team RB touches (RB), pass attempts (QB): percentile vs position
 *   15% efficiency          fantasy points per opportunity: percentile vs position
 *   15% opportunity trend   targets/carries over the last 3 games vs his season
 *   10% snap trend          snap share last 3 games vs season
 *   15% Sleeper outlook     Sleeper's rest-of-season projection vs what he's averaged so far
 *   15% draft capital       round 1 = 1.0 … undrafted = 0.15
 *   10% age                 younger for his class = more growth runway
 */
import type { LeagueContext } from "./league";
import type { WeekStat } from "../nflverse";

export interface BreakoutRow {
  id: string;
  name: string;
  pos: string;
  team: string | null;
  age: number | null;
  yearsExp: number;
  draftRound: number | null;
  injury: string | null;
  owner: string; // "You", team name, or "Free agent"
  mine: boolean;
  score: number; // 0–100
  tier: "Strong" | "Moderate" | "Watch";
  components: { label: string; value: number }[]; // 0–1 each
  evidence: string[];
  pointsTrend: number[]; // last 6 games
  oppTrend: number[]; // last 6 games, opportunity
  ppg: number;
  rosPpg: number; // Sleeper rest-of-season projection per game
  snapPct: number | null; // last 3 games
  value: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const OUT = ["Out", "IR", "PUP", "NFI", "Sus", "Doubtful"];
/** A real role: Sleeper rest-of-season points per game at least this, or a starter's snap share. */
const FLOOR: Record<string, number> = { QB: 12, RB: 6, WR: 6, TE: 4.5 };

export const CLASS_LABEL = ["Rookie", "2nd year", "3rd year"];

export function breakouts(ctx: LeagueContext): BreakoutRow[] {
  const stats = ctx.stats;
  const byGsis = new Map<string, WeekStat[]>();
  for (const s of stats) if (s.week < ctx.currentWeek) (byGsis.get(s.gsis) ?? byGsis.set(s.gsis, []).get(s.gsis)!).push(s);
  const teamRbTouches = new Map<string, number>();
  for (const s of stats) if (s.position === "RB") teamRbTouches.set(`${s.team}:${s.week}`, (teamRbTouches.get(`${s.team}:${s.week}`) ?? 0) + s.car + s.tgt);

  const skill = [...ctx.players.values()].filter((p) => ["QB", "RB", "WR", "TE"].includes(p.pos) && p.team);
  // Baselines use every skill player with a role, so a young player is compared to the whole position.
  const posRows = new Map<string, { share: number; ppo: number }[]>();
  const feat = new Map<string, { share: number; ppo: number; oppTrend: number; snapTrend: number; snapsL3: number | null; pts: number[]; opp: number[]; avg: number }>();
  for (const p of skill) {
    const log = (ctx.logs.get(p.id) ?? []).slice().sort((a, b) => a.week - b.week);
    if (log.length < 2) continue;
    const st = p.gsis ? (byGsis.get(p.gsis) ?? []).sort((a, b) => a.week - b.week) : [];
    const opp = log.map((g) => g.opportunity ?? 0);
    const pts = log.map((g) => g.pts);
    let share = 0;
    if (p.pos === "WR" || p.pos === "TE") share = mean(st.slice(-4).map((s) => s.tgtShare));
    else if (p.pos === "RB") share = mean(st.slice(-4).map((s) => (s.car + s.tgt) / Math.max(1, teamRbTouches.get(`${s.team}:${s.week}`) ?? 1)));
    else share = mean(opp.slice(-4)) / 40;
    const totalOpp = opp.reduce((a, b) => a + b, 0);
    const ppo = totalOpp ? pts.reduce((a, b) => a + b, 0) / totalOpp : 0;
    const snaps = log.map((g) => g.snapPct).filter((x): x is number => x !== null);
    feat.set(p.id, {
      share, ppo,
      oppTrend: mean(opp) && opp.length >= 4 ? mean(opp.slice(-3)) / mean(opp) - 1 : 0,
      snapTrend: snaps.length >= 4 ? (mean(snaps.slice(-3)) - mean(snaps)) * 100 : 0,
      snapsL3: snaps.length ? mean(snaps.slice(-3)) : null, pts: pts.slice(-6), opp: opp.slice(-6), avg: mean(pts),
    });
    if (log.length >= 4) (posRows.get(p.pos) ?? posRows.set(p.pos, []).get(p.pos)!).push({ share, ppo });
  }
  const pct = (pos: string, k: "share" | "ppo", v: number) => {
    const arr = (posRows.get(pos) ?? []).map((r) => r[k]);
    return arr.length ? arr.filter((x) => x < v).length / arr.length : 0.5;
  };
  const rankAtPos = new Map<string, number>();
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    skill.filter((p) => p.pos === pos).sort((a, b) => (ctx.projections.get(b.id)?.base ?? 0) - (ctx.projections.get(a.id)?.base ?? 0)).forEach((p, i) => rankAtPos.set(p.id, i + 1));
  }
  const eliteCut = (pos: string) => (pos === "TE" || pos === "QB" ? 5 : 10);
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";

  const rows: BreakoutRow[] = [];
  for (const p of skill) {
    const yrs = p.yearsExp ?? 99;
    if (yrs > 2) continue; // rookies, 2nd and 3rd year only
    if (OUT.includes(p.injury ?? "")) continue; // not playing
    const pr = ctx.projections.get(p.id);
    if (!pr) continue;
    if (pr.median <= 0 && !pr.onBye) continue; // not projected to play this week
    const f = feat.get(p.id);
    const ros = pr.base;
    const role = ros >= (FLOOR[p.pos] ?? 6) || (f?.snapsL3 ?? 0) >= 0.5;
    if (!role) continue; // borderline irrelevant
    if ((rankAtPos.get(p.id) ?? 99) <= eliteCut(p.pos)) continue; // already broken out

    const age = p.age ?? 23;
    const classAge = 22 + yrs; // typical age for his class
    const c = {
      share: f ? pct(p.pos, "share", f.share) : 0.3,
      eff: f ? pct(p.pos, "ppo", f.ppo) : 0.4,
      opp: f ? clamp01(f.oppTrend / 0.4) : 0,
      snap: f ? clamp01(f.snapTrend / 20) : 0,
      outlook: clamp01(((f?.avg ? ros / f.avg : 1.2) - 0.9) / 0.5),
      draft: p.draftRound === 1 ? 1 : p.draftRound === 2 ? 0.75 : p.draftRound === 3 ? 0.55 : p.draftRound ? 0.35 : 0.15,
      age: clamp01(0.5 + (classAge - age) / 4),
    };
    const raw = 0.2 * c.share + 0.15 * c.eff + 0.15 * c.opp + 0.1 * c.snap + 0.15 * c.outlook + 0.15 * c.draft + 0.1 * c.age;
    const score = Math.round(100 * raw);
    if (score < 25) continue;
    const ev: string[] = [];
    if (f && c.share >= 0.7) ev.push(`${p.pos === "RB" ? "Backfield touch" : p.pos === "QB" ? "Pass volume" : "Target"} share in the top ${Math.round((1 - c.share) * 100) || 1}% at ${p.pos} (${p.pos === "QB" ? `${Math.round(f.share * 40)} att/g` : `${Math.round(f.share * 100)}%`}).`);
    if (f && c.eff >= 0.7) ev.push("Top-tier efficiency: fantasy points per opportunity among the best at his position.");
    if (f && f.oppTrend > 0.15) ev.push(`Opportunity up ${Math.round(f.oppTrend * 100)}% over the last 3 games.`);
    if (f && f.snapTrend > 8) ev.push(`Snap share up ${Math.round(f.snapTrend)} pts (now ${Math.round((f.snapsL3 ?? 0) * 100)}%).`);
    if (f?.avg && ros > f.avg * 1.1) ev.push(`Sleeper projects ${ros.toFixed(1)} pts/g the rest of the way, up from his ${f.avg.toFixed(1)} average.`);
    if (p.draftRound && p.draftRound <= 2) ev.push(`Round ${p.draftRound} draft capital: the team is invested.`);
    if (!f) ev.push("Hasn't played enough yet for usage trends; scored on draft capital, age and Sleeper's outlook.");
    const owner = ctx.teams.find((t) => t.players.includes(p.id));
    rows.push({
      id: p.id, name: p.name, pos: p.pos, team: p.team, age: p.age, yearsExp: yrs, draftRound: p.draftRound, injury: p.injury,
      owner: owner ? (owner.rosterId === ctx.myRosterId ? "You" : owner.name) : "Free agent", mine: owner?.rosterId === ctx.myRosterId,
      score, tier: score >= 60 ? "Strong" : score >= 45 ? "Moderate" : "Watch",
      components: [
        { label: "Opportunity share", value: c.share }, { label: "Efficiency", value: c.eff }, { label: "Opportunity trend", value: c.opp },
        { label: "Snap trend", value: c.snap }, { label: "Sleeper outlook", value: c.outlook }, { label: "Draft capital", value: c.draft }, { label: "Age for class", value: c.age },
      ],
      evidence: ev, pointsTrend: f?.pts ?? [], oppTrend: f?.opp ?? [], ppg: pr.seasonAvg, rosPpg: ros, snapPct: f?.snapsL3 ?? null, value: ctx.values.get(p.id)?.[key] ?? 0,
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}
