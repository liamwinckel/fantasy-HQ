/** Which player positions can fill each Sleeper roster slot. */
export const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  DL: ["DL", "DE", "DT"],
  LB: ["LB"],
  DB: ["DB", "CB", "S"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  IDP_FLEX: ["DL", "DE", "DT", "LB", "DB", "CB", "S"],
};

export const NON_STARTING = new Set(["BN", "IR", "TAXI"]);

/** Fill order: most restrictive first, widest flex last. Greedy in this order is optimal for nested slots. */
const FILL_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB", "WRRB_FLEX", "REC_FLEX", "FLEX", "IDP_FLEX", "SUPER_FLEX"];
export const slotRank = (slot: string) => {
  const i = FILL_ORDER.indexOf(slot);
  return i === -1 ? FILL_ORDER.length : i;
};

export function startingSlots(rosterPositions: string[]): string[] {
  return rosterPositions.filter((s) => !NON_STARTING.has(s));
}

/** Normalise a player's eligible positions (Sleeper uses fantasy_positions, falling back to position). */
export function playerPositions(p: { position?: string | null; fantasy_positions?: string[] | null }): string[] {
  const set = new Set<string>([...(p.fantasy_positions ?? []), ...(p.position ? [p.position] : [])]);
  return [...set];
}

export function canFill(slot: string, positions: string[]): boolean {
  const elig = SLOT_ELIGIBILITY[slot];
  if (!elig) return positions.includes(slot);
  return positions.some((p) => elig.includes(p));
}

/** The position we group a player under for replacement levels and rankings. */
export function primaryPosition(p: { position?: string | null; fantasy_positions?: string[] | null }): string {
  const pos = p.position ?? p.fantasy_positions?.[0] ?? "?";
  if (["DE", "DT"].includes(pos)) return "DL";
  if (["CB", "S", "SS", "FS"].includes(pos)) return "DB";
  if (["ILB", "OLB", "MLB"].includes(pos)) return "LB";
  return pos;
}

/**
 * How many starters each position effectively takes per team.
 * Flex slots are split by how they are usually filled. These shares are assumptions, shown on the methodology page.
 */
export const FLEX_SHARES: Record<string, Record<string, number>> = {
  FLEX: { RB: 0.45, WR: 0.45, TE: 0.1 },
  WRRB_FLEX: { RB: 0.5, WR: 0.5 },
  REC_FLEX: { WR: 0.8, TE: 0.2 },
  SUPER_FLEX: { QB: 0.85, RB: 0.05, WR: 0.08, TE: 0.02 },
  IDP_FLEX: { DL: 0.3, LB: 0.4, DB: 0.3 },
};

export function starterDemand(rosterPositions: string[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const slot of startingSlots(rosterPositions)) {
    const shares = FLEX_SHARES[slot] ?? { [slot]: 1 };
    for (const [pos, s] of Object.entries(shares)) d[pos] = (d[pos] ?? 0) + s;
  }
  return d;
}

export const isSuperflex = (rp: string[]) => rp.includes("SUPER_FLEX") || rp.filter((s) => s === "QB").length >= 2;
