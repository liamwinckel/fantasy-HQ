import type { LeagueContext } from "./league";
import { canFill } from "../engine/positions";

export interface Swap {
  inId: string;
  inName: string;
  outId: string | null;
  outName: string;
  gain: number;
  reason: string;
  /** Slot he starts in, and the slot the benched player leaves. */
  slot?: string;
  outSlot?: string;
}

/**
 * Turn "current vs best lineup" into moves that make sense slot by slot:
 *   "Start Bijan Robinson at RB, bench Michael Mayer"   (direct: he can play that slot)
 *   "Start X at FLEX; move Y from FLEX to RB, bench Z"   (when the bench player fits a different slot)
 * Each player coming in is matched to a player going out whose slot he (or a teammate he displaces) can fill.
 */
export function lineupSwaps(ctx: LeagueContext, rosterId: number): Swap[] {
  const lu = ctx.lineups.get(rosterId);
  if (!lu) return [];
  const pts = (id: string) => ctx.projections.get(id)?.median ?? 0;
  const pos = (id: string) => ctx.players.get(id)?.positions ?? [];
  const slotName = (sl: string) => sl.replace("SUPER_FLEX", "SUPERFLEX").replace("REC_FLEX", "W/T FLEX").replace("WRRB_FLEX", "W/R FLEX").replace("IDP_FLEX", "IDP FLEX");
  const cur = lu.current;
  const curIds = new Set(cur.map((s) => s.playerId).filter(Boolean) as string[]);
  const optIds = new Set(lu.optimal.map((s) => s.playerId).filter(Boolean) as string[]);
  const locked = new Set(lu.locked);
  const ins = [...optIds].filter((id) => !curIds.has(id)).sort((a, b) => pts(b) - pts(a));
  // Slots that open up: starters leaving (worst first) and empty slots.
  const open = cur.filter((s) => !s.playerId || !optIds.has(s.playerId)).sort((a, b) => (a.playerId ? pts(a.playerId) : -1) - (b.playerId ? pts(b.playerId) : -1));
  const used = new Set<number>();
  const out: Swap[] = [];
  for (const inId of ins) {
    let pick: { slot: (typeof cur)[number]; via: (typeof cur)[number] | null } | null = null;
    // 1) a direct fit
    for (const s of open) if (!used.has(s.index) && canFill(s.slot, pos(inId))) { pick = { slot: s, via: null }; break; }
    // 2) one shuffle: he takes a starter's slot, that starter slides into the open slot
    if (!pick) for (const s of open) {
      if (used.has(s.index)) continue;
      const m = cur.find((c) => c.playerId && optIds.has(c.playerId) && !locked.has(c.playerId) && canFill(s.slot, pos(c.playerId)) && canFill(c.slot, pos(inId)));
      if (m) { pick = { slot: s, via: m }; break; }
    }
    if (!pick) continue;
    used.add(pick.slot.index);
    const outId = pick.slot.playerId;
    const o = outId ? ctx.players.get(outId) : null;
    const op = outId ? ctx.projections.get(outId) : null;
    const at = slotName(pick.via ? pick.via.slot : pick.slot.slot);
    let reason = "Higher projection";
    if (!outId) reason = "Fills an empty starting slot";
    else if (op?.onBye) reason = `${o?.name} is on bye`;
    else if (o?.injury && ["Out", "IR", "PUP", "Sus", "Doubtful"].includes(o.injury)) reason = `${o.name} is ${o.injury}`;
    else if (o?.injury === "Questionable") reason = `${o.name} is questionable`;
    const shuffle = pick.via ? `Move ${ctx.players.get(pick.via.playerId!)?.name} to ${slotName(pick.slot.slot)}. ` : "";
    out.push({
      inId, inName: ctx.players.get(inId)?.name ?? inId, outId: outId ?? null, outName: o?.name ?? "Empty slot",
      gain: Math.round((pts(inId) - (outId ? pts(outId) : 0)) * 10) / 10,
      slot: at, outSlot: slotName(pick.slot.slot), reason: `${shuffle}${reason}`,
    });
  }
  return out.filter((s) => s.gain > 0.2);
}

/** Highest-value players nobody in this league rosters. */
export function bestAvailable(ctx: LeagueContext, n = 5) {
  const rostered = new Set(ctx.teams.flatMap((t) => t.players));
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";
  return [...ctx.values.values()]
    .filter((v) => !rostered.has(v.id) && ctx.players.get(v.id)?.team)
    .sort((a, b) => b[key] - a[key])
    .slice(0, n)
    .map((v) => ({ id: v.id, player: ctx.players.get(v.id)!, value: v[key], proj: ctx.projections.get(v.id)! }));
}

// ---------------------------------------------------------------------------
// Week-by-week view: past weeks show actual results, the current week shows live + projected,
// future weeks show projected best lineups.
import { optimizeLineup, lineupTotal, scoreStarters } from "../engine/lineup";
import { winProbability } from "../engine/simulate";
import type { Matchup } from "../sleeper/types";

export type WeekKind = "past" | "current" | "future";

export interface WeekLine {
  slot: string;
  playerId: string | null;
  name: string;
  pos: string;
  team: string | null;
  injury: string | null;
  actual: number | null; // points scored (past / live)
  proj: number | null; // projected median for that week
  low: number | null;
  high: number | null;
  note: string; // "vs MIA", "BYE", …
}

export interface TeamWeek {
  rosterId: number;
  name: string;
  avatar: string | null;
  starters: WeekLine[];
  bench: WeekLine[];
  actual: number | null;
  projected: number | null;
  bestPossible: number | null; // past weeks: best lineup in hindsight
}

export interface GameView {
  week: number;
  kind: WeekKind;
  a: TeamWeek;
  b: TeamWeek | null;
  winProbA: number | null; // null for completed games
  result: "W" | "L" | "T" | null; // from A's side
}

export function weekKind(ctx: LeagueContext, w: number): WeekKind {
  if (ctx.seasonOver || w < ctx.currentWeek) return "past";
  return w === ctx.currentWeek ? "current" : "future";
}

export function projectionFor(ctx: LeagueContext, pid: string, w: number) {
  const pr = ctx.projections.get(pid);
  if (!pr) return { median: 0, low: 0, high: 0 };
  const med = pr.byWeek[w] ?? 0;
  if (w === ctx.currentWeek) return { median: pr.median, low: pr.low, high: pr.high };
  const scale = pr.base > 0 ? med / pr.base : 0;
  return { median: med, low: Math.round(Math.max(0, (pr.base - 0.84 * pr.sd) * scale) * 10) / 10, high: Math.round((pr.base + 0.84 * pr.sd) * scale * 10) / 10 };
}

function oppNote(ctx: LeagueContext, pid: string, w: number) {
  const p = ctx.players.get(pid);
  if (!p?.team) return "No team";
  const pr = ctx.projections.get(pid);
  if (w >= ctx.currentWeek && pr && pr.byWeek[w] === 0 && !p.injury) return "BYE";
  const log = ctx.logs.get(pid)?.find((g) => g.week === w);
  if (w < ctx.currentWeek && !log) return "Did not play";
  return "";
}

function line(ctx: LeagueContext, slot: string, pid: string | null, w: number, kind: WeekKind, m?: Matchup): WeekLine {
  if (!pid) return { slot, playerId: null, name: "Empty", pos: "", team: null, injury: null, actual: null, proj: null, low: null, high: null, note: "" };
  const p = ctx.players.get(pid);
  const pj = kind === "past" ? null : projectionFor(ctx, pid, w);
  return {
    slot, playerId: pid, name: p?.name ?? pid, pos: p?.pos ?? "", team: p?.team ?? null, injury: kind === "past" ? null : p?.injury ?? null,
    actual: kind === "future" ? null : m?.players_points[pid] ?? (kind === "past" ? 0 : null),
    proj: pj?.median ?? null, low: pj?.low ?? null, high: pj?.high ?? null, note: oppNote(ctx, pid, w),
  };
}

export function teamWeek(ctx: LeagueContext, rosterId: number, w: number): TeamWeek {
  const kind = weekKind(ctx, w);
  const t = ctx.teams.find((x) => x.rosterId === rosterId)!;
  const m = ctx.matchupsByWeek[w - 1]?.find((x) => x.roster_id === rosterId);
  const rp = ctx.league.roster_positions;
  if (kind === "past") {
    const starters = m?.starters ?? [];
    const lines = scoreStarters(rp, starters, () => 0).map((s) => line(ctx, s.slot, s.playerId, w, kind, m));
    const benchIds = (m?.players ?? []).filter((pid) => !starters.includes(pid));
    const best = m ? lineupTotal(optimizeLineup(rp, m.players.filter((pid) => ctx.players.has(pid)).map((pid) => ({ id: pid, positions: ctx.players.get(pid)!.positions, points: m.players_points[pid] ?? 0 })))) : null;
    return {
      rosterId, name: t.name, avatar: t.avatar, starters: lines, bench: benchIds.map((pid) => line(ctx, "BN", pid, w, kind, m)).sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0)),
      actual: m?.points ?? null, projected: null, bestPossible: best,
    };
  }
  if (kind === "current") {
    const lu = ctx.lineups.get(rosterId)!;
    const lines = lu.current.map((s) => line(ctx, s.slot, s.playerId, w, kind, m));
    const starterSet = new Set(lu.current.map((s) => s.playerId));
    const bench = t.players.filter((pid) => !starterSet.has(pid) && ctx.players.has(pid)).map((pid) => line(ctx, "BN", pid, w, kind, m));
    return { rosterId, name: t.name, avatar: t.avatar, starters: lines, bench: bench.sort((a, b) => (b.proj ?? 0) - (a.proj ?? 0)),
      actual: m?.points ?? null, projected: ctx.liveScore.get(rosterId)?.projected.mean ?? lu.currentTotal, bestPossible: null };
  }
  // future: projected best lineup for that week
  const ids = t.players.filter((pid) => !t.taxi.includes(pid) && !t.reserve.includes(pid) && ctx.players.has(pid));
  const lu = optimizeLineup(rp, ids.map((pid) => ({ id: pid, positions: ctx.players.get(pid)!.positions, points: projectionFor(ctx, pid, w).median })));
  const starterSet = new Set(lu.map((s) => s.playerId));
  return {
    rosterId, name: t.name, avatar: t.avatar, starters: lu.map((s) => line(ctx, s.slot, s.playerId, w, kind)),
    bench: ids.filter((pid) => !starterSet.has(pid)).map((pid) => line(ctx, "BN", pid, w, kind)).sort((a, b) => (b.proj ?? 0) - (a.proj ?? 0)),
    actual: null, projected: lineupTotal(lu), bestPossible: null,
  };
}

export function opponentOf(ctx: LeagueContext, rosterId: number, w: number): number | null {
  const ms = ctx.matchupsByWeek[w - 1];
  const me = ms?.find((m) => m.roster_id === rosterId);
  if (!me?.matchup_id) return null;
  return ms!.find((m) => m.matchup_id === me.matchup_id && m.roster_id !== rosterId)?.roster_id ?? null;
}

export function gameView(ctx: LeagueContext, rosterId: number, w: number): GameView {
  const kind = weekKind(ctx, w);
  const a = teamWeek(ctx, rosterId, w);
  const oppId = opponentOf(ctx, rosterId, w);
  const b = oppId !== null ? teamWeek(ctx, oppId, w) : null;
  let winProbA: number | null = null;
  let result: GameView["result"] = null;
  if (kind === "past" && b && a.actual !== null && b.actual !== null) result = a.actual > b.actual ? "W" : a.actual < b.actual ? "L" : "T";
  else if (b) {
    const sa = kind === "current" ? ctx.liveScore.get(rosterId)?.projected : ctx.weekStrength.get(rosterId)?.get(w);
    const sb = kind === "current" ? ctx.liveScore.get(b.rosterId)?.projected : ctx.weekStrength.get(b.rosterId)?.get(w);
    if (sa && sb) winProbA = winProbability(sa, sb);
  }
  return { week: w, kind, a, b, winProbA, result };
}

/** Every pairing in a week, for the league scoreboard. */
export function weekGames(ctx: LeagueContext, w: number) {
  const ms = ctx.matchupsByWeek[w - 1] ?? [];
  const seen = new Set<number>();
  const out: { a: number; b: number | null }[] = [];
  for (const m of ms) {
    if (seen.has(m.roster_id)) continue;
    const opp = opponentOf(ctx, m.roster_id, w);
    seen.add(m.roster_id);
    if (opp !== null) seen.add(opp);
    out.push({ a: m.roster_id, b: opp });
  }
  return out;
}
