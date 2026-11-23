import { canFill, slotRank, startingSlots } from "./positions";

export interface LineupCandidate {
  id: string;
  positions: string[];
  points: number; // projected points used for ranking
  locked?: boolean; // game already started: must stay where it is
}

export interface SlotAssignment {
  slot: string;
  index: number; // position in the Sleeper roster_positions starter list
  playerId: string | null;
  points: number;
}

/**
 * Best projected lineup for the league's starting slots.
 * Slots are filled most-restrictive first (QB, RB… then FLEX, then SUPER_FLEX), each with the best remaining
 * eligible player. For Sleeper's nested flex slots this greedy order gives the optimal total.
 * Locked players (game started) keep their current slot.
 */
export function optimizeLineup(
  rosterPositions: string[],
  candidates: LineupCandidate[],
  current: (string | null)[] = [],
): SlotAssignment[] {
  const slots = startingSlots(rosterPositions);
  const out: SlotAssignment[] = slots.map((slot, index) => ({ slot, index, playerId: null, points: 0 }));
  const used = new Set<string>();
  const byId = new Map(candidates.map((c) => [c.id, c]));

  // Keep locked players where they are.
  current.forEach((pid, i) => {
    if (!pid || i >= out.length) return;
    const c = byId.get(pid);
    if (c?.locked) {
      out[i].playerId = pid;
      out[i].points = c.points;
      used.add(pid);
    }
  });

  const order = out.filter((s) => !s.playerId).sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || a.index - b.index);
  const pool = candidates.filter((c) => !c.locked).sort((a, b) => b.points - a.points);
  for (const s of order) {
    const pick = pool.find((c) => !used.has(c.id) && canFill(s.slot, c.positions));
    if (pick) {
      s.playerId = pick.id;
      s.points = pick.points;
      used.add(pick.id);
    }
  }
  // Keep players in the slot they already occupy where possible, so a recommendation only shows real changes.
  const posOf = (id: string) => byId.get(id)?.positions ?? [];
  current.forEach((pid, i) => {
    if (!pid || i >= out.length || out[i].playerId === pid) return;
    const j = out.findIndex((s) => s.playerId === pid);
    if (j < 0) return;
    const other = out[i].playerId;
    if (!canFill(out[i].slot, posOf(pid)) || (other && !canFill(out[j].slot, posOf(other)))) return;
    [out[i].playerId, out[j].playerId] = [pid, other];
    [out[i].points, out[j].points] = [out[j].points, out[i].points];
  });
  return out;
}

export const lineupTotal = (a: SlotAssignment[]) => Math.round(a.reduce((t, s) => t + s.points, 0) * 10) / 10;

/** Points for a given set of starters (in slot order), using projected points. */
export function scoreStarters(rosterPositions: string[], starters: (string | null)[], pts: (id: string) => number): SlotAssignment[] {
  return startingSlots(rosterPositions).map((slot, index) => {
    const pid = starters[index] && starters[index] !== "0" ? starters[index] : null;
    return { slot, index, playerId: pid, points: pid ? pts(pid) : 0 };
  });
}
