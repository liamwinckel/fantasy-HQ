/**
 * Waiver Assistant (SHS model).
 * 1. Pool: the league's top projected free agents (Sleeper projections in this league's scoring). Anyone Out, on IR,
 *    suspended or not projected to play the rest of the way is left out.
 * 2. Needs: positions where your best lineup ranks in the bottom half of the league, plus this week's holes
 *    (starters on bye, injured or projected for nothing).
 * 3. Each candidate is scored on what he adds to YOUR best lineup this week and through the fantasy final.
 *    If your roster is full, the suggested drop comes off first, so losing that player counts against the add.
 */
import type { LeagueContext } from "./league";
import type { PlayerLite, Projection } from "../engine/projections";
import { optimizeLineup, lineupTotal } from "../engine/lineup";
import { powerRankings } from "../engine/power";

export interface WaiverPlayer {
  player: PlayerLite;
  proj: Projection;
  value: number; // standalone trade value, league's mode
  weekGain: number; // points added to your best lineup this week (after the drop, if any)
  rosGain: number; // points added to your best lineups through the fantasy final (after the drop, if any)
  score: number; // ranking score
  fills: string | null; // the need this player fills, e.g. "WR need" or "bye cover"
  snapTrend: number[] | null; // last 3 snap %
  reasons: string[];
  drop: { id: string; name: string; value: number } | null;
}

export interface WaiverReport {
  needs: { pos: string; rank: number; reason: string }[];
  holes: { id: string; name: string; pos: string; why: string }[];
  topAdds: WaiverPlayer[];
  streamers: WaiverPlayer[];
  rising: WaiverPlayer[];
  handcuffs: WaiverPlayer[];
  drops: { player: PlayerLite; value: number; proj: number; reason: string }[];
}

const UNAVAILABLE = ["IR", "Out", "PUP", "NFI", "Sus"];

export function waiverReport(ctx: LeagueContext, rosterId: number): WaiverReport {
  const me = ctx.teams.find((t) => t.rosterId === rosterId)!;
  const rp = ctx.league.roster_positions;
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const weeks = ctx.seasonOver ? [] : Array.from({ length: ctx.lastWeek - w0 + 1 }, (_, i) => w0 + i);
  const mine = me.players.filter((p) => !me.taxi.includes(p) && !me.reserve.includes(p) && ctx.players.has(p));
  const cand = (ids: string[], w: number) => ids.map((id) => ({ id, positions: ctx.players.get(id)!.positions, points: ctx.projections.get(id)?.byWeek[w] ?? 0 }));
  const weekTotal = (ids: string[], w: number) => lineupTotal(optimizeLineup(rp, cand(ids, w)));
  const baseWeek = weeks.map((w) => weekTotal(mine, w));
  const value = (id: string) => ctx.values.get(id)?.[key] ?? 0;

  // Needs: bottom-half positions in the league, by best-lineup strength.
  const power = powerRankings(ctx).find((p) => p.rosterId === rosterId);
  const half = Math.ceil(ctx.teamsCount / 2);
  const needs = Object.entries(power?.positions ?? {})
    .filter(([pos, r]) => r.rank > half && !["K", "DEF"].includes(pos))
    .sort((a, b) => b[1].rank - a[1].rank)
    .map(([pos, r]) => ({ pos, rank: r.rank, reason: `${ordinal(r.rank)} of ${ctx.teamsCount} at ${pos}` }));
  // Holes this week: starters who won't play.
  const holes: WaiverReport["holes"] = [];
  if (weeks.length) {
    for (const s of optimizeLineup(rp, cand(mine, w0))) {
      if (!s.playerId) { holes.push({ id: s.slot, name: "Empty slot", pos: s.slot, why: "nobody to start" }); continue; }
      const pr = ctx.projections.get(s.playerId);
      const p = ctx.players.get(s.playerId)!;
      if (pr && pr.median <= 0) holes.push({ id: p.id, name: p.name, pos: p.pos, why: pr.onBye ? "on bye" : p.injury ? p.injury : "not projected to play" });
    }
  }
  const needPos = new Set(needs.map((n) => n.pos));
  const holePos = new Set(holes.map((h) => h.pos));

  // Players in any of my best lineups for remaining weeks are not drop candidates.
  const needed = new Set<string>();
  for (const w of weeks) for (const s of optimizeLineup(rp, cand(mine, w))) if (s.playerId) needed.add(s.playerId);
  const dropPool = mine.filter((id) => !needed.has(id)).sort((a, b) => value(a) - value(b));
  const space = rosterSpace(ctx, rosterId);
  const fallbackDrop = [...mine].sort((a, b) => value(a) - value(b))[0];
  const dropId = space.full ? dropPool[0] ?? fallbackDrop ?? null : null;
  const drop = dropPool[0] ? { id: dropPool[0], name: ctx.players.get(dropPool[0])!.name, value: value(dropPool[0]) } : fallbackDrop ? { id: fallbackDrop, name: ctx.players.get(fallbackDrop)!.name, value: value(fallbackDrop) } : null;
  const after = (add: string) => [...mine.filter((x) => x !== dropId), add];

  const rostered = new Set(ctx.teams.flatMap((t) => t.players));
  const avail = [...ctx.players.values()].filter((p) => {
    if (rostered.has(p.id) || !p.team || UNAVAILABLE.includes(p.injury ?? "")) return false;
    const pr = ctx.projections.get(p.id);
    if (!pr) return false;
    // Must be projected to play from here on (not just a name on a depth chart).
    return Object.values(pr.byWeek).some((v) => v > 0.5);
  });
  // Top projected free agents: rest-of-season rate and this week.
  const shortlist = [...avail]
    .sort((a, b) => (ctx.projections.get(b.id)!.base + ctx.projections.get(b.id)!.median) - (ctx.projections.get(a.id)!.base + ctx.projections.get(a.id)!.median))
    .slice(0, 60);

  const evalPlayer = (p: PlayerLite): WaiverPlayer => {
    const proj = ctx.projections.get(p.id)!;
    let rosGain = 0;
    let weekGain = 0;
    const team = after(p.id);
    weeks.forEach((w, i) => {
      const g = weekTotal(team, w) - baseWeek[i];
      rosGain += g;
      if (w === w0) weekGain = g;
    });
    const snaps = (ctx.logs.get(p.id) ?? []).slice(-3).map((g) => g.snapPct).filter((x): x is number => x !== null).map((x) => Math.round(x * 100));
    const fills = holePos.has(p.pos) && weekGain > 0 ? (holes.find((h) => h.pos === p.pos)?.why === "on bye" ? `${p.pos} bye cover` : `${p.pos} hole this week`) : needPos.has(p.pos) && rosGain > 0 ? `${p.pos} need` : null;
    const reasons: string[] = [];
    if (fills) reasons.push(fills === `${p.pos} need` ? `You're ${needs.find((n) => n.pos === p.pos)!.reason}.` : `Covers ${holes.filter((h) => h.pos === p.pos).map((h) => `${h.name} (${h.why})`).join(", ")}.`);
    if (rosGain > 0.5) reasons.push(`Adds ${rosGain.toFixed(1)} pts to your best lineups through Week ${ctx.lastWeek}${dropId ? ` after dropping ${ctx.players.get(dropId)!.name}` : ""}.`);
    if (proj.usageFactor >= 1.08) reasons.push(`Usage up ${Math.round((proj.usageFactor - 1) * 100 / 0.4)}% over the last 3 games.`);
    if (snaps.length >= 2 && snaps[snaps.length - 1] - snaps[0] >= 10) reasons.push(`Snap share rising: ${snaps.join("% → ")}%.`);
    const score = 0.45 * weekGain + 0.55 * (rosGain / Math.max(1, weeks.length)) * 2 + (fills ? 1.5 : 0) + (ctx.valuationMode === "dynasty" ? value(p.id) / 15 : 0);
    return { player: p, proj, value: value(p.id), weekGain: r1(weekGain), rosGain: r1(rosGain), score, fills, snapTrend: snaps.length ? snaps : null, reasons, drop };
  };
  const evaluated = shortlist.map(evalPlayer);

  const topAdds = evaluated.filter((x) => x.rosGain > 0 || x.weekGain > 0 || ctx.valuationMode === "dynasty").sort((a, b) => b.score - a.score).slice(0, 10);
  const streamers = evaluated.filter((x) => x.weekGain > 0.2).sort((a, b) => b.weekGain - a.weekGain).slice(0, 6);
  const rising = evaluated
    .filter((x) => x.proj.usageFactor >= 1.08 || (x.snapTrend && x.snapTrend.length >= 2 && x.snapTrend[x.snapTrend.length - 1] - x.snapTrend[0] >= 10))
    .sort((a, b) => b.proj.base - a.proj.base)
    .slice(0, 6);
  // Handcuffs: healthy free-agent RBs on the same NFL team as your top RBs
  const myRbTeams = mine.filter((id) => ctx.players.get(id)!.pos === "RB").sort((a, b) => value(b) - value(a)).slice(0, 3)
    .map((id) => ({ team: ctx.players.get(id)!.team, name: ctx.players.get(id)!.name })).filter((x) => x.team);
  const handcuffs = [...ctx.players.values()]
    .filter((p) => !rostered.has(p.id) && p.pos === "RB" && !UNAVAILABLE.includes(p.injury ?? "") && myRbTeams.some((t) => t.team === p.team) && (ctx.projections.get(p.id)?.base ?? 0) > 0)
    .sort((a, b) => (ctx.projections.get(b.id)!.base - ctx.projections.get(a.id)!.base))
    .slice(0, 4)
    .map((p) => {
      const e = evalPlayer(p);
      e.reasons.unshift(`Backup to your ${myRbTeams.find((t) => t.team === p.team)!.name}.`);
      return e;
    });
  const drops = dropPool.slice(0, 5).map((id) => {
    const p = ctx.players.get(id)!;
    const pr = ctx.projections.get(id)!;
    const reason = p.injury && ["IR", "Out", "PUP"].includes(p.injury) ? `${p.injury}; not in any of your best lineups` : "Not in any of your best lineups for the rest of the season";
    return { player: p, value: value(id), proj: pr.median, reason };
  });
  return { needs, holes, topAdds, streamers, rising, handcuffs, drops };
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Active roster limit (bench included, IR and taxi excluded) and how many spots are used. */
export function rosterSpace(ctx: LeagueContext, rosterId: number) {
  const t = ctx.teams.find((x) => x.rosterId === rosterId)!;
  const limit = ctx.league.roster_positions.filter((s) => s !== "IR" && s !== "TAXI").length;
  const used = t.players.filter((p) => !t.reserve.includes(p) && !t.taxi.includes(p)).length;
  return { limit, used, full: used >= limit };
}

export interface WaiverImpact {
  add: { id: string; name: string; pos: string };
  drop: { id: string; name: string; pos: string } | null;
  mustDrop: boolean;
  weekBefore: number; weekAfter: number;
  rosBefore: number; rosAfter: number;
  power: { before: { score: number; rank: number }; after: { score: number; rank: number } };
  positions: { pos: string; before: number; after: number }[];
  valueChange: number;
}

/** Effect of adding a free agent (and dropping someone if the roster is full) on your team. */
export function waiverImpact(ctx: LeagueContext, rosterId: number, addId: string, dropId: string | null): WaiverImpact {
  const t = ctx.teams.find((x) => x.rosterId === rosterId)!;
  const space = rosterSpace(ctx, rosterId);
  const rp = ctx.league.roster_positions;
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";
  const after = [...t.players.filter((p) => p !== dropId), addId];
  const active = (ids: string[]) => ids.filter((p) => !t.taxi.includes(p) && !t.reserve.includes(p) && ctx.players.has(p));
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const total = (ids: string[], w: number) => lineupTotal(optimizeLineup(rp, active(ids).map((id) => ({ id, positions: ctx.players.get(id)!.positions, points: ctx.projections.get(id)?.byWeek[w] ?? 0 }))));
  let rosBefore = 0, rosAfter = 0;
  if (!ctx.seasonOver) for (let w = w0; w <= ctx.lastWeek; w++) { rosBefore += total(t.players, w); rosAfter += total(after, w); }
  const pb = powerRankings(ctx).find((p) => p.rosterId === rosterId)!;
  const pa = powerRankings(ctx, new Map([[rosterId, after]])).find((p) => p.rosterId === rosterId)!;
  const info = (id: string) => ({ id, name: ctx.players.get(id)?.name ?? id, pos: ctx.players.get(id)?.pos ?? "" });
  return {
    add: info(addId), drop: dropId ? info(dropId) : null, mustDrop: space.full,
    weekBefore: r1(total(t.players, w0)), weekAfter: r1(total(after, w0)),
    rosBefore: r1(rosBefore), rosAfter: r1(rosAfter),
    power: { before: { score: pb.score, rank: pb.rank }, after: { score: pa.score, rank: pa.rank } },
    positions: Object.keys(pb.positions).map((pos) => ({ pos, before: pb.positions[pos].rank, after: pa.positions[pos]?.rank ?? pb.positions[pos].rank })),
    valueChange: r1((ctx.values.get(addId)?.[key] ?? 0) - (dropId ? ctx.values.get(dropId)?.[key] ?? 0 : 0)),
  };
}
