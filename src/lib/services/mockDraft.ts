/**
 * Mock draft simulator, in your league's own format:
 *   redraft  — snake draft, your league's rounds and roster spots, players ordered by expert ADP (FantasyPros
 *              consensus overall rank; superflex boosts QBs), your board ranked by SHS value.
 *   keeper   — next season's board with every team's (planned or predicted) keepers already in their cost picks,
 *              traded picks applied; the rest is drafted like redraft.
 *   rookie   — dynasty rookie draft: next season's rookie picks (order and owners, trades included) and the
 *              expert dynasty rookie rankings.
 *   startup  — dynasty startup: dynasty consensus ranks, dynasty values.
 * Other teams pick near ADP with some randomness, fill their starting lineup, and leave kickers/defences late.
 */
import type { LeagueContext } from "./league";
import type { BoardCell } from "./keeperData";
import type { RookieProspect } from "../nflverse";
import { optimizeLineup, lineupTotal } from "../engine/lineup";

export type MockMode = "redraft" | "keeper" | "rookie" | "startup";
export interface MockPlayer { id: string; name: string; pos: string; team: string | null; adp: number; value: number; inApp: boolean }
/** col = board column (the original owner's draft slot); owner = who makes the pick (after trades). */
export interface MockPick { overall: number; round: number; slot: number; col: number; label: string; owner: number; orig: number; playerId: string | null; keeper: boolean; manual?: boolean }
export type DraftType = "snake" | "linear";
export interface MockState { mode: MockMode; type: DraftType; picks: MockPick[]; pool: Map<string, MockPlayer>; me: number; teams: { rosterId: number; name: string }[]; columns: number[]; rounds: number; superflex: boolean; slots: string[] }
export interface MockOptions { slot?: number; board?: BoardCell[]; rookies?: RookieProspect[]; type?: DraftType; rounds?: number }

/** Put a board in draft order: columns are draft slots; snake reverses every other round. */
function order(cells: { round: number; col: number; owner: number; orig: number; playerId: string | null; keeper: boolean }[], type: DraftType, n: number): MockPick[] {
  const out: MockPick[] = [];
  const rounds = Math.max(0, ...cells.map((c) => c.round));
  let overall = 0;
  for (let r = 1; r <= rounds; r++) {
    const row = cells.filter((c) => c.round === r).sort((a, b) => a.col - b.col);
    const seq = type === "snake" && r % 2 === 0 ? [...row].reverse() : row;
    seq.forEach((c, i) => out.push({ ...c, overall: ++overall, slot: i + 1, label: lab(r, i + 1) }));
  }
  void n;
  return out;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const lab = (r: number, s: number) => `${r}.${String(s).padStart(2, "0")}`;

export function mockModes(ctx: LeagueContext): MockMode[] {
  return ctx.format === "dynasty" ? ["rookie", "startup"] : ctx.format === "keeper" ? ["keeper", "redraft"] : ["redraft"];
}
export const MODE_LABEL: Record<MockMode, string> = { redraft: "Redraft", keeper: "Keeper draft", rookie: "Rookie draft", startup: "Dynasty startup" };

export const defaultType = (mode: MockMode): DraftType => (mode === "rookie" ? "linear" : "snake");

export function buildMock(ctx: LeagueContext, mode: MockMode, opts: MockOptions): MockState {
  const type = opts.type ?? defaultType(mode);
  const rp = ctx.league.roster_positions;
  const superflex = rp.includes("SUPER_FLEX") || rp.filter((x) => x === "QB").length > 1;
  const slots = rp.filter((x) => !["BN", "IR", "TAXI"].includes(x));
  const me = ctx.myRosterId ?? ctx.teams[0].rosterId;
  const teams = ctx.teams.map((t) => ({ rosterId: t.rosterId, name: t.name }));
  const N = teams.length;
  const cons = ctx.consensus ?? {};
  const pool = new Map<string, MockPlayer>();
  const positions = new Set<string>();
  slots.forEach((s) => ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"].forEach((p) => { if (s === p || (s === "FLEX" && ["RB", "WR", "TE"].includes(p)) || (s === "SUPER_FLEX" && ["QB", "RB", "WR", "TE"].includes(p)) || (s === "REC_FLEX" && ["WR", "TE"].includes(p)) || (s === "WRRB_FLEX" && ["RB", "WR"].includes(p)) || (s === "IDP_FLEX" && ["DL", "LB", "DB"].includes(p))) positions.add(p); }));
  let rounds = opts.rounds || ctx.league.settings.draft_rounds || rp.length;

  if (mode === "rookie") {
    const list = opts.rookies ?? [];
    list.forEach((r, i) => {
      const id = r.s && ctx.players.has(r.s) ? r.s : `rk:${r.n}`;
      pool.set(id, { id, name: r.n, pos: r.p, team: r.t || null, adp: r.e, value: r1(100 * Math.exp(-(i) / 18)), inApp: id === r.s });
    });
    const seasons = [...new Set(ctx.picks.map((p) => p.season))].sort();
    const ps = ctx.picks.filter((p) => p.season === seasons[0]);
    const have = Math.max(1, ...ps.map((p) => p.round));
    rounds = Math.min(opts.rounds || have, have);
    // Columns: projected finish, worst team picks first (the pick model's estimate).
    const finish = (rid: number) => ps.find((p) => p.originalRosterId === rid && p.round === 1)?.estimatedSlot ?? (ctx.sim.projectedWins[rid] ?? 0);
    const columns = [...new Set(ps.map((p) => p.originalRosterId))].sort((x, y) => finish(x) - finish(y));
    const picks = order(ps.filter((p) => p.round <= rounds).map((p) => ({ round: p.round, col: columns.indexOf(p.originalRosterId), owner: p.ownerRosterId, orig: p.originalRosterId, playerId: null, keeper: false })), type, columns.length);
    return { mode, type, picks, pool, me, teams, columns, rounds, superflex, slots };
  }

  // Redraft / keeper / startup pool.
  const dyn = mode === "startup";
  for (const p of ctx.players.values()) {
    if (!p.team || !positions.has(p.pos)) continue;
    const c = cons[p.id];
    const v = ctx.values.get(p.id);
    const value = v ? (dyn ? v.dynasty : v.redraft) : 0;
    let adp = dyn ? (superflex ? c?.dsf : c?.do) : c?.ro;
    if (!dyn && superflex && p.pos === "QB" && c?.rp) adp = c.rp * 2.2 - 1;
    if (adp === undefined) adp = 250 + (100 - value) * 3; // not ranked by the experts: late, by our value
    if (value <= 0 && adp > 250) continue;
    pool.set(p.id, { id: p.id, name: p.name, pos: p.pos, team: p.team, adp, value: r1(value), inApp: true });
  }
  if (mode === "keeper" && opts.board?.length) {
    const cols: number[] = [];
    for (const c of opts.board.filter((x) => x.round === 1).sort((x, y) => x.slot - y.slot)) cols.push(c.originalRosterId);
    rounds = Math.max(...opts.board.map((c) => c.round));
    const picks = order(opts.board.map((c) => ({ round: c.round, col: cols.indexOf(c.originalRosterId), owner: c.ownerRosterId, orig: c.originalRosterId, playerId: c.keeper?.playerId ?? null, keeper: !!c.keeper })), type, cols.length);
    for (const p of picks) if (p.playerId && !pool.has(p.playerId)) { const pl = ctx.players.get(p.playerId); if (pl) pool.set(pl.id, { id: pl.id, name: pl.name, pos: pl.pos, team: pl.team, adp: 999, value: 0, inApp: true }); }
    return { mode, type, picks, pool, me, teams, columns: cols, rounds, superflex, slots };
  }
  if (dyn && !opts.rounds) rounds = rp.length;
  // You at your chosen slot, everyone else in roster order.
  const slot = Math.max(1, Math.min(N, opts.slot ?? 1));
  const others = teams.filter((t) => t.rosterId !== me).map((t) => t.rosterId);
  const columns = [...others.slice(0, slot - 1), me, ...others.slice(slot - 1)];
  const cells = [];
  for (let r = 1; r <= rounds; r++) for (let c = 0; c < columns.length; c++) cells.push({ round: r, col: c, owner: columns[c], orig: columns[c], playerId: null, keeper: false });
  const picks = order(cells, type, columns.length);
  return { mode, type, picks, pool, me, teams, columns, rounds, superflex, slots };
}

export const taken = (s: MockState) => new Set(s.picks.filter((p) => p.playerId).map((p) => p.playerId!));
export const available = (s: MockState) => { const t = taken(s); return [...s.pool.values()].filter((p) => !t.has(p.id)).sort((a, b) => a.adp - b.adp); };
export const nextPick = (s: MockState) => s.picks.find((p) => !p.playerId) ?? null;
/**
 * The pick on the clock: the first empty pick after the last one made in order. Picks you cleared or filled by hand
 * out of order don't move the clock; holes behind it wait for you (and are filled at the end).
 */
export function clockPick(s: MockState): MockPick | null {
  const last = Math.max(0, ...s.picks.filter((p) => p.playerId && !p.keeper && !p.manual).map((p) => p.overall));
  return s.picks.find((p) => !p.playerId && p.overall > last) ?? s.picks.find((p) => !p.playerId) ?? null;
}
export const rosterOf = (s: MockState, rid: number) => s.picks.filter((p) => p.owner === rid && p.playerId).map((p) => s.pool.get(p.playerId!)!).filter(Boolean);

/** How many of a position a team wants: starters (flex spots spread over eligible positions) plus a sensible bench. */
function wants(s: MockState, pos: string) {
  const st = s.slots.filter((x) => x === pos).length;
  const flex = s.slots.filter((x) => x === "FLEX" || x === "WRRB_FLEX" || x === "REC_FLEX").length;
  const sf = s.slots.filter((x) => x === "SUPER_FLEX").length;
  if (pos === "K" || pos === "DEF") return { start: st, max: st };
  if (pos === "QB") return { start: st + sf, max: st + sf + (s.mode === "rookie" ? 3 : 1) };
  if (pos === "TE") return { start: st, max: st + 1 + (flex ? 1 : 0) };
  return { start: st + (flex ? Math.ceil(flex / 2) : 0), max: st + flex + 4 };
}

/** A computer team's pick: near ADP with randomness, filling needs, kickers/defences only at the end. */
export function botPick(s: MockState, rand: () => number, pk: MockPick | null = clockPick(s), noise = 1): string | null {
  if (!pk) return null;
  const mine = rosterOf(s, pk.owner);
  const left = s.picks.filter((p) => p.owner === pk.owner && !p.playerId).length;
  const count = (pos: string) => mine.filter((p) => p.pos === pos).length;
  const lateNeeds = ["K", "DEF"].filter((pos) => wants(s, pos).start > count(pos)).length;
  const cands = available(s).slice(0, noise > 1.2 ? 26 : 18);
  let best: MockPlayer | null = null, bestScore = Infinity;
  for (const p of cands) {
    const w = wants(s, p.pos);
    let score = p.adp + (rand() + rand() + rand() - 1.5) * (2 + p.adp * 0.07) * noise;
    if (s.mode !== "rookie") {
      if ((p.pos === "K" || p.pos === "DEF") && left > lateNeeds) score += 500;
      if (count(p.pos) >= w.max) score += 60;
      else if (count(p.pos) < w.start && pk.round > s.rounds * 0.45) score -= 8;
    } else if (count(p.pos) >= 3) score += 6;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best?.id ?? cands[0]?.id ?? null;
}

/** Your board: best available by SHS value, nudged toward what your lineup still needs. */
export function suggestions(s: MockState, n = 5) {
  const pk = clockPick(s);
  const mine = rosterOf(s, s.me);
  const count = (pos: string) => mine.filter((p) => p.pos === pos).length;
  const left = s.picks.filter((p) => p.owner === s.me && !p.playerId).length;
  return available(s).slice(0, 60).map((p) => {
    const w = wants(s, p.pos);
    let score = p.value;
    if (s.mode !== "rookie") {
      if ((p.pos === "K" || p.pos === "DEF") && left > 2) score -= 100;
      if (count(p.pos) < w.start) score *= 1.12; else if (count(p.pos) >= w.max) score *= 0.6;
    }
    const reach = pk ? Math.round(p.adp - pk.overall) : 0;
    return { p, score, why: count(p.pos) < w.start && s.mode !== "rookie" ? `Fills a starting ${p.pos} spot` : reach >= 8 ? `Value: usually goes ${reach} picks later` : reach <= -8 ? `Falling: ADP ${Math.round(p.adp)}` : "Best value left" };
  }).sort((a, b) => b.score - a.score).slice(0, n);
}

/** Grade every team: projected starting lineup (redraft/keeper) or total value (dynasty). */
export function gradeDraft(ctx: LeagueContext, s: MockState) {
  const rows = s.teams.map((t) => {
    const roster = rosterOf(s, t.rosterId);
    let score: number;
    if (s.mode === "redraft" || s.mode === "keeper") {
      const lu = optimizeLineup(ctx.league.roster_positions, roster.filter((p) => p.inApp).map((p) => ({ id: p.id, positions: ctx.players.get(p.id)?.positions ?? [p.pos], points: ctx.projections.get(p.id)?.base ?? 0 })));
      score = lineupTotal(lu);
    } else score = roster.reduce((a, p) => a + p.value, 0);
    return { rosterId: t.rosterId, name: t.name, score: r1(score), roster };
  }).sort((a, b) => b.score - a.score);
  const n = rows.length;
  return rows.map((r, i) => ({ ...r, rank: i + 1, grade: i < n * 0.15 ? "A" : i < n * 0.4 ? "B" : i < n * 0.75 ? "C" : "D" }));
}
