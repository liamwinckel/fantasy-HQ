/**
 * Rookie draft pick valuation (Dynasty). Heuristic, on the same 0–100 scale as dynasty player values.
 *
 * value = slot base × superflex bump × league-size factor × years-out discount
 *   slot base (share of the league's top asset): R1 early .42 / mid .32 / late .24, R2 .14/.11/.08, R3 .05/.04/.03, R4+ .02
 *   superflex: 1st rounders ×1.12 (QBs go early)
 *   league size: (12 / teams)^0.25, so a pick in a smaller league is worth a bit more
 *   years out: next draft ×1.0, +1 year ×0.9, +2 years ×0.82; picks beyond next year default to "mid" (unknown slot)
 * Rookie class strength is NOT modelled: we don't have reliable free prospect data.
 * In Redraft and Keeper valuation, future picks are worth 0.
 */

import type { TradedPick } from "../sleeper/types";

export type Tier = "early" | "mid" | "late";

export interface PickAsset {
  key: string; // e.g. "2027-1-5" = season-round-original roster
  season: string;
  round: number;
  originalRosterId: number;
  ownerRosterId: number;
  tier: Tier;
  tierSource: "estimated" | "manual" | "default";
  estimatedSlot: number | null;
  value: number;
  label: string;
}

const BASE: Record<number, Record<Tier, number>> = {
  1: { early: 0.42, mid: 0.32, late: 0.24 },
  2: { early: 0.14, mid: 0.11, late: 0.08 },
  3: { early: 0.05, mid: 0.04, late: 0.03 },
};

export function pickValue(opts: { round: number; tier: Tier; teams: number; superflex: boolean; yearsOut: number }): number {
  const base = BASE[opts.round]?.[opts.tier] ?? 0.02;
  const sf = opts.superflex && opts.round === 1 ? 1.12 : 1;
  const size = Math.pow(12 / Math.max(4, opts.teams), 0.25);
  const disc = opts.yearsOut <= 0 ? 1 : opts.yearsOut === 1 ? 0.9 : 0.82;
  return Math.round(base * sf * size * disc * 1000) / 10;
}

export function tierForSlot(slot: number, teams: number): Tier {
  if (slot <= Math.ceil(teams / 3)) return "early";
  if (slot > teams - Math.ceil(teams / 3)) return "late";
  return "mid";
}

/**
 * Every pick each roster currently owns for the next `years` drafts, applying Sleeper's traded_picks.
 * `projectedOrder`: roster ids from worst (pick 1) to best, used to estimate next year's slots.
 */
export function buildPicks(opts: {
  rosterIds: number[];
  traded: TradedPick[];
  firstSeason: number;
  years: number;
  rounds: number;
  teams: number;
  superflex: boolean;
  projectedOrder: number[] | null;
  manualTiers?: Record<string, Tier>;
  valueOn: boolean; // false in redraft/keeper
}): PickAsset[] {
  const out: PickAsset[] = [];
  const tradedMap = new Map<string, number>();
  for (const t of opts.traded) tradedMap.set(`${t.season}-${t.round}-${t.roster_id}`, t.owner_id);
  for (let y = 0; y < opts.years; y++) {
    const season = String(opts.firstSeason + y);
    for (let round = 1; round <= Math.max(1, opts.rounds); round++) {
      for (const rid of opts.rosterIds) {
        const key = `${season}-${round}-${rid}`;
        const owner = tradedMap.get(key) ?? rid;
        let tier: Tier = "mid";
        let tierSource: PickAsset["tierSource"] = "default";
        let estimatedSlot: number | null = null;
        if (y === 0 && opts.projectedOrder) {
          const idx = opts.projectedOrder.indexOf(rid);
          if (idx >= 0) {
            estimatedSlot = idx + 1;
            tier = tierForSlot(estimatedSlot, opts.teams);
            tierSource = "estimated";
          }
        }
        const manual = opts.manualTiers?.[key];
        if (manual) {
          tier = manual;
          tierSource = "manual";
        }
        const value = opts.valueOn ? pickValue({ round, tier, teams: opts.teams, superflex: opts.superflex, yearsOut: y }) : 0;
        const tierLabel = tier[0].toUpperCase() + tier.slice(1);
        out.push({
          key, season, round, originalRosterId: rid, ownerRosterId: owner, tier, tierSource, estimatedSlot, value,
          label: `${season} Round ${round} · ${tierLabel}${tierSource === "estimated" ? " (est.)" : tierSource === "default" ? " (unknown slot)" : ""}`,
        });
      }
    }
  }
  return out;
}
