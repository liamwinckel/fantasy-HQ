/**
 * Rankings. Default order = FantasyPros expert consensus (ECR). The SHS score says how much the SHS numbers
 * agree: for week / rest of season, his Sleeper projection vs the projection of the player at his expert rank;
 * for dynasty, the SHS model's dynasty value vs the model value at his expert rank. +20% = we like him more.
 */
import type { LeagueContext } from "./league";
import { isSuperflex } from "../engine/positions";
import { scoreSleeperStats } from "../engine/scoring";
import { adjustedDefense } from "./shsStack";

/**
 * View modifiers (Rankings only; they don't change trade values elsewhere). Defaults = this league's settings.
 *   sf     1QB or superflex: dynasty order and values use FantasyPros' superflex list / superflex market values.
 *   tep    TE premium (extra points per TE reception). Week / season: projections are re-scored. Dynasty: no expert
 *          list exists, so each TE's value is raised by how much the premium adds to his scoring (see tepFactor).
 *   ppr    points per reception;  passTd  points per passing TD (week / season re-scoring).
 */
export interface RankOpts { sf?: boolean; tep?: number; ppr?: number; passTd?: number; keep?: number }

export function leagueOpts(ctx: LeagueContext): Required<RankOpts> {
  const sc = ctx.league.scoring_settings as Record<string, number>;
  return { sf: isSuperflex(ctx.league.roster_positions), tep: sc.bonus_rec_te ?? 0, ppr: sc.rec ?? 0, passTd: sc.pass_td ?? 4, keep: 0 };
}

/**
 * Dynasty TE premium: the share of extra scoring the premium gives this TE (premium × his receptions per game ÷ his
 * points per game), counted 1.5× because the premium lifts startable TEs more than replacement ones (they catch more).
 * Capped at +60%. Receptions: this season's per game (3+ games), else his projection, else 3.5.
 */
export function tepFactor(ctx: LeagueContext, id: string, tep: number): number {
  if (!tep) return 1;
  const p = ctx.players.get(id);
  if (!p || p.pos !== "TE") return 1;
  const games = p.gsis ? ctx.stats.filter((s) => s.gsis === p.gsis) : [];
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const recPg = games.length >= 3 ? games.reduce((a, s) => a + s.rec, 0) / games.length : ctx.projStats.get(w0)?.get(id)?.rec ?? 3.5;
  const ppg = Math.max(5, ctx.projections.get(id)?.base ?? 0);
  return Math.min(1.6, 1 + (1.5 * tep * recPg) / ppg);
}

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
  /** Keeper leagues: next season's keep price (round) and surplus. */
  keepRound?: number | null; keepSurplus?: number | null;
  shsPos: number; // SHS rank at position (projection, or model dynasty value)
  shsScore: number | null; // +/- % SHS vs the experts
  rank: number; // overall order shown
}

export function rankings(ctx: LeagueContext, scope: RankScope, opts: RankOpts = {}): RankRow[] {
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const weeks = scope === "week" ? [w0] : Array.from({ length: ctx.lastWeek - w0 + 1 }, (_, i) => w0 + i);
  const owner = new Map<string, { name: string; mine: boolean }>();
  for (const t of ctx.teams) for (const id of t.players) owner.set(id, { name: t.rosterId === ctx.myRosterId ? "You" : t.name, mine: t.rosterId === ctx.myRosterId });
  const rows: RankRow[] = [];
  const lo = leagueOpts(ctx);
  const opt = { ...lo, ...opts };
  const sf = opt.sf;
  // Re-scoring for week / season when a scoring modifier differs from the league.
  const scLeague = ctx.league.scoring_settings as Record<string, number>;
  const rescore = scope !== "dynasty" && (opt.tep !== lo.tep || opt.ppr !== lo.ppr || opt.passTd !== lo.passTd);
  const scOv = { ...scLeague, bonus_rec_te: opt.tep, rec: opt.ppr, pass_td: opt.passTd };
  // Dynasty market scale for the chosen format.
  const mkt = (id: string) => (sf ? ctx.consensus[id]?.v2 : ctx.consensus[id]?.v1) ?? null;
  const maxMk = scope === "dynasty" ? Math.max(1, ...[...ctx.players.keys()].map((id) => mkt(id) ?? 0)) : 1;
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
      if (rescore) {
        let a = 0, b = 0;
        for (const w of weeks) { const st = ctx.projStats.get(w)?.get(p.id); if (st) { a += scoreSleeperStats(st, scLeague, p.pos); b += scoreSleeperStats(st, scOv, p.pos); } }
        if (a > 0.3) pts *= b / a;
      }
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
      value: scope === "dynasty" ? Math.round((mkt(p.id) !== null ? (100 * mkt(p.id)!) / maxMk : v?.dynasty ?? 0) * tepFactor(ctx, p.id, opt.tep) * 10) / 10 : v?.redraft ?? 0,
      ecr, ecrPos: null, shsPos: 0, shsScore: null, rank: 0,
      keepRound: ctx.keeperCost.get(p.id)?.round ?? null, keepSurplus: ctx.keeperCost.get(p.id)?.surplus ?? null,
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
    // Market values are built from FantasyPros' dynasty list for the chosen format, so this is their order; with a
    // TE premium on, TEs move up by their adjusted value.
    rows.sort((a, b) => b.value - a.value || (a.ecrAll ?? 1e9) - (b.ecrAll ?? 1e9));
  } else {
    // Keeper cost (optional, Season view in keeper leagues): a player who'd be a bargain keep next year moves up, an
    // overpriced one moves down. Factor = 1 + weight × 0.5 × (his surplus ÷ the league's biggest), floored at 0.7:
    // "Some" (0.5) moves the biggest bargain up 25%, "Full" (1) up 50%.
    const maxKeep = Math.max(1e-9, ...[...ctx.keeperCost.values()].map((k) => Math.abs(k.surplus)));
    const kf = (r: RankRow) => (opt.keep && r.keepSurplus != null ? Math.max(0.7, 1 + opt.keep * 0.5 * (r.keepSurplus / maxKeep)) : 1);
    const key = (r: RankRow) => (r.ecrPos !== null ? atRank(r.pos, r.ecrPos) * kf(r) + 1e6 : r.pts * kf(r));
    // Equal converted points (common: projections are rounded) keep the experts' order within a position.
    rows.sort((a, b) => key(b) - key(a) || (a.pos === b.pos ? (a.ecrPos ?? 1e9) - (b.ecrPos ?? 1e9) : 0) || b.pts - a.pts);
  }
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Rookie picks for the dynasty list: every pick in this league, valued on the players' market scale. */
export function pickRows(ctx: LeagueContext, opts: RankOpts = {}): RankRow[] {
  const o = { ...leagueOpts(ctx), ...opts };
  const mk = (id: string) => (o.sf ? ctx.consensus[id]?.v2 : ctx.consensus[id]?.v1) ?? 0;
  const maxMk = Math.max(1, ...[...ctx.players.keys()].map(mk));
  const team = (rid: number) => ctx.teams.find((t) => t.rosterId === rid);
  return ctx.picks.map((p) => {
    const owner = team(p.ownerRosterId);
    const from = p.originalRosterId !== p.ownerRosterId ? team(p.originalRosterId)?.name : null;
    const value = p.market ? Math.round((1000 * (o.sf ? p.market.v2 : p.market.v1)) / maxMk) / 10 : p.value;
    return {
      id: `pick:${p.key}`, name: `${p.season} ${["", "1st", "2nd", "3rd", "4th", "5th"][p.round] ?? `R${p.round}`}${p.tierSource !== "default" ? ` · ${p.tier[0].toUpperCase()}${p.tier.slice(1)}` : ""}`, pos: "PICK", team: null, injury: null, opp: from ? `via ${from}` : null,
      age: null, yearsExp: null, owner: owner ? (owner.rosterId === ctx.myRosterId ? "You" : owner.name) : "—", mine: p.ownerRosterId === ctx.myRosterId,
      pts: value, games: 0, passYd: 0, passTd: 0, int: 0, rushYd: 0, rec: 0, recYd: 0, td: 0, fg: 0, sacks: 0, tackles: 0,
      value, ecr: null, ecrPos: null, ecrAll: p.market ? (o.sf ? p.market.e2 : p.market.e1) : null, shsPos: 0, shsScore: null, rank: 0,
    } as RankRow;
  });
}

/** This week's matchup grade: the opponent's opponent-adjusted points allowed to his position, ranked among all
 *  defences and turned into a letter (A+ easiest … F toughest). QB / RB / WR / TE; others get none. */
export interface Grade { letter: string; pct: number; opp: string; pos: string }
const LETTERS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
export function matchupGrades(ctx: LeagueContext, rows: RankRow[], week: number): Map<string, Grade> {
  const def = adjustedDefense(ctx, week);
  const out = new Map<string, Grade>();
  const byPos = new Map<string, { d: string; v: number }[]>();
  for (const [k, v] of def) { const [d, pos] = k.split(":"); (byPos.get(pos) ?? byPos.set(pos, []).get(pos)!).push({ d, v }); }
  for (const list of byPos.values()) list.sort((a, b) => b.v - a.v); // easiest first
  for (const r of rows) {
    if (!["QB", "RB", "WR", "TE"].includes(r.pos) || !r.team) continue;
    const opp = ctx.nflOpponents.get(r.team)?.get(week);
    if (!opp) { out.set(r.id, { letter: "BYE", pct: 0, opp: "", pos: r.pos }); continue; }
    const list = byPos.get(r.pos);
    const i = list?.findIndex((x) => x.d === opp) ?? -1;
    if (!list || i < 0) continue;
    out.set(r.id, { letter: LETTERS[Math.min(LETTERS.length - 1, Math.floor((i / list.length) * LETTERS.length))], pct: Math.round(list[i].v * 100), opp, pos: r.pos });
  }
  return out;
}
