/** Rankings from Sleeper's projections: this week or rest of season, in this league's scoring. */
import type { LeagueContext } from "./league";

export interface RankRow {
  id: string; name: string; pos: string; team: string | null; injury: string | null; opp: string | null;
  owner: string; mine: boolean;
  pts: number; posRank: number; rank: number;
  passYd: number; passTd: number; int: number;
  rushYd: number; rec: number; recYd: number; td: number; // td = rush + receiving
  fg: number; sacks: number; tackles: number;
  games: number; // weeks with a projection (rest of season)
  /** FantasyPros expert consensus rank at his position (weekly or rest of season), when covered. */
  ecr: number | null;
  ecrRank: number | null; // our ordinal among players with an ECR at that position
}

export function rankings(ctx: LeagueContext, scope: "week" | "ros", week?: number): RankRow[] {
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const weeks = scope === "week" ? [week ?? w0] : Array.from({ length: ctx.lastWeek - w0 + 1 }, (_, i) => w0 + i);
  const owner = new Map<string, { name: string; mine: boolean }>();
  for (const t of ctx.teams) for (const id of t.players) owner.set(id, { name: t.rosterId === ctx.myRosterId ? "You" : t.name, mine: t.rosterId === ctx.myRosterId });
  const rows: RankRow[] = [];
  for (const p of ctx.players.values()) {
    const pr = ctx.projections.get(p.id);
    if (!pr) continue;
    let pts = 0, games = 0;
    const s: Record<string, number> = {};
    for (const w of weeks) {
      const v = pr.byWeek[w] ?? 0;
      pts += v;
      const st = ctx.projStats.get(w)?.get(p.id);
      if (st) { games++; for (const [k, x] of Object.entries(st)) s[k] = (s[k] ?? 0) + x; }
    }
    if (pts <= 0.05) continue;
    const g = (k: string) => s[k] ?? 0;
    const o = owner.get(p.id);
    rows.push({
      id: p.id, name: p.name, pos: p.pos, team: p.team, injury: p.injury,
      opp: scope === "week" && p.team ? ctx.nflOpponents.get(p.team)?.get(weeks[0]) ?? null : null,
      owner: o?.name ?? "Free agent", mine: !!o?.mine,
      pts: r1(pts), posRank: 0, rank: 0,
      passYd: Math.round(g("pass_yd")), passTd: r1(g("pass_td")), int: r1(g("pass_int")),
      rushYd: Math.round(g("rush_yd")), rec: r1(g("rec")), recYd: Math.round(g("rec_yd")), td: r1(g("rush_td") + g("rec_td")),
      fg: r1(g("fgm")), sacks: r1(g("sack") + g("idp_sack")), tackles: r1(g("idp_tkl_solo") + g("idp_tkl_ast")),
      games,
      ecr: (scope === "week" ? ctx.consensus[p.id]?.w : ctx.consensus[p.id]?.rp) ?? null, ecrRank: null,
    });
  }
  rows.sort((a, b) => b.pts - a.pts);
  const seen = new Map<string, number>();
  rows.forEach((r, i) => { r.rank = i + 1; const n = (seen.get(r.pos) ?? 0) + 1; seen.set(r.pos, n); r.posRank = n; });
  const byPos = new Map<string, RankRow[]>();
  for (const r of rows) if (r.ecr !== null) (byPos.get(r.pos) ?? byPos.set(r.pos, []).get(r.pos)!).push(r);
  for (const arr of byPos.values()) [...arr].sort((a, b) => a.ecr! - b.ecr!).forEach((r, i) => (r.ecrRank = i + 1));
  return rows;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
