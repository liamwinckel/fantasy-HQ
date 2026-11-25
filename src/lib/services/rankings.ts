/**
 * Rankings. Default order = FantasyPros expert consensus (ECR). The SHS score says how much the SHS numbers
 * agree: for week / rest of season, his Sleeper projection vs the projection of the player at his expert rank;
 * for dynasty, the SHS model's dynasty value vs the model value at his expert rank. +20% = we like him more.
 */
import type { LeagueContext } from "./league";
import { isSuperflex } from "../engine/positions";

export type RankScope = "week" | "ros" | "dynasty";

export interface RankRow {
  id: string; name: string; pos: string; team: string | null; injury: string | null; opp: string | null;
  age: number | null; yearsExp: number | null;
  owner: string; mine: boolean;
  pts: number; games: number;
  passYd: number; passTd: number; int: number;
  rushYd: number; rec: number; recYd: number; td: number;
  fg: number; sacks: number; tackles: number;
  value: number; // trade value (dynasty scope)
  ecr: number | null; // raw expert consensus rank at position
  ecrPos: number | null; // ordinal among players here with an ECR at that position
  /** Dynasty only: FantasyPros dynasty overall rank (superflex list in superflex leagues). */
  ecrAll?: number | null;
  shsPos: number; // SHS rank at position (projection, or model dynasty value)
  shsScore: number | null; // +/- % SHS vs the experts
  rank: number; // overall order shown
}

export function rankings(ctx: LeagueContext, scope: RankScope): RankRow[] {
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const weeks = scope === "week" ? [w0] : Array.from({ length: ctx.lastWeek - w0 + 1 }, (_, i) => w0 + i);
  const owner = new Map<string, { name: string; mine: boolean }>();
  for (const t of ctx.teams) for (const id of t.players) owner.set(id, { name: t.rosterId === ctx.myRosterId ? "You" : t.name, mine: t.rosterId === ctx.myRosterId });
  const rows: RankRow[] = [];
  const sf = isSuperflex(ctx.league.roster_positions);
  for (const p of ctx.players.values()) {
    const pr = ctx.projections.get(p.id);
    const v = ctx.values.get(p.id);
    const c = ctx.consensus[p.id];
    let pts = 0, games = 0;
    const s: Record<string, number> = {};
    if (scope !== "dynasty" && pr) {
      for (const w of weeks) {
        pts += pr.byWeek[w] ?? 0;
        const st = ctx.projStats.get(w)?.get(p.id);
        if (st) { games++; for (const [k, x] of Object.entries(st)) s[k] = (s[k] ?? 0) + x; }
      }
      if (pts <= 0.05 && !c) continue;
    }
    if (scope === "dynasty" && !(v && (v.dynasty > 0.5 || c?.dp))) continue;
    const ecr = (scope === "week" ? c?.w : scope === "ros" ? c?.rp : c?.dp) ?? null;
    if (scope !== "dynasty" && pts <= 0.05 && ecr === null) continue;
    const g = (k: string) => s[k] ?? 0;
    const o = owner.get(p.id);
    rows.push({
      id: p.id, name: p.name, pos: p.pos, team: p.team, injury: p.injury, age: p.age, yearsExp: p.yearsExp,
      opp: scope === "week" && p.team ? ctx.nflOpponents.get(p.team)?.get(w0) ?? null : null,
      owner: o?.name ?? "Free agent", mine: !!o?.mine,
      pts: scope === "dynasty" ? v?.dynastyModel ?? v?.dynasty ?? 0 : r1(pts), games,
      passYd: Math.round(g("pass_yd")), passTd: r1(g("pass_td")), int: r1(g("pass_int")),
      rushYd: Math.round(g("rush_yd")), rec: r1(g("rec")), recYd: Math.round(g("rec_yd")), td: r1(g("rush_td") + g("rec_td")),
      fg: r1(g("fgm")), sacks: r1(g("sack") + g("idp_sack")), tackles: r1(g("idp_tkl_solo") + g("idp_tkl_ast")),
      value: scope === "dynasty" ? v?.dynasty ?? 0 : v?.redraft ?? 0,
      ecr, ecrPos: null, shsPos: 0, shsScore: null, rank: 0,
      ecrAll: scope === "dynasty" ? (sf ? c?.dsf ?? c?.do : c?.do) ?? null : null,
    });
  }
  // Ranks within each position: SHS (by pts / model value) and experts.
  const byPos = new Map<string, RankRow[]>();
  for (const r of rows) (byPos.get(r.pos) ?? byPos.set(r.pos, []).get(r.pos)!).push(r);
  const shsCurve = new Map<string, number[]>();
  for (const [pos, arr] of byPos) {
    const sorted = [...arr].sort((a, b) => b.pts - a.pts);
    sorted.forEach((r, i) => (r.shsPos = i + 1));
    shsCurve.set(pos, sorted.map((r) => r.pts));
    [...arr].filter((r) => r.ecr !== null).sort((a, b) => a.ecr! - b.ecr!).forEach((r, i) => (r.ecrPos = i + 1));
  }
  // Points (or model value) a player at a given positional rank gets: turns expert ranks into a common scale.
  const atRank = (pos: string, k: number) => shsCurve.get(pos)?.[Math.min(k, (shsCurve.get(pos)?.length ?? 1)) - 1] ?? 0;
  for (const r of rows) {
    if (r.ecrPos === null) continue;
    const ref = atRank(r.pos, r.ecrPos);
    if (ref > 0.5) r.shsScore = Math.round(Math.max(-99, Math.min(99, (r.pts / ref - 1) * 100)));
  }
  // Overall order. Dynasty: FantasyPros' own dynasty overall list (superflex list in superflex leagues), as on their
  // site. Week / rest of season: experts' positional ranks converted to this league's scoring. Then anyone unranked.
  if (scope === "dynasty") {
    rows.sort((a, b) => (a.ecrAll ?? 1e9) - (b.ecrAll ?? 1e9) || (a.ecr ?? 1e9) - (b.ecr ?? 1e9) || b.value - a.value);
  } else {
    const key = (r: RankRow) => (r.ecrPos !== null ? atRank(r.pos, r.ecrPos) + 1e6 : r.pts);
    rows.sort((a, b) => key(b) - key(a) || b.pts - a.pts);
  }
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
