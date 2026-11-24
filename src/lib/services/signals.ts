/** Extra inputs for SHS AI, loaded alongside the league. Every piece is optional. */
import { markets, ngs, pfrAdv, xfp, type InjuryReport, type NgsRow, type PfrRow } from "../nflverse";
import type { MarketsFile } from "../markets";

export interface Signals {
  /** Expected vs actual fantasy points (PPR model) by GSIS ID, season to date. */
  xfp: Map<string, { games: number; xfp: number; fp: number; recentXfp: number }>;
  ngs: Map<string, NgsRow>;
  pfr: Map<string, PfrRow>;
  markets: MarketsFile | null;
  /** This week's practice participation by GSIS ID: e.g. ["LP", "LP", "FP"] (Wed → Fri), plus game status. */
  practice: Map<string, { days: string[]; status: string }>;
}

export const emptySignals = (): Signals => ({ xfp: new Map(), ngs: new Map(), pfr: new Map(), markets: null, practice: new Map() });

export async function loadSignals(season: string, injuries: InjuryReport[], week: number, force = false): Promise<Signals> {
  const [x, n, p, m] = await Promise.all([
    xfp(season, force).catch(() => null), ngs(season, force).catch(() => null), pfrAdv(season, force).catch(() => null), markets(force).catch(() => null),
  ]);
  const xm = new Map<string, { games: number; xfp: number; fp: number; recentXfp: number }>();
  const byId = new Map<string, { week: number; xfp: number; fp: number }[]>();
  for (const r of x?.data ?? []) if (r.week < week) (byId.get(r.gsis) ?? byId.set(r.gsis, []).get(r.gsis)!).push(r);
  for (const [id, rows] of byId) {
    rows.sort((a, b) => a.week - b.week);
    const recent = rows.slice(-4);
    xm.set(id, { games: rows.length, xfp: rows.reduce((a, r) => a + r.xfp, 0) / rows.length, fp: rows.reduce((a, r) => a + r.fp, 0) / rows.length, recentXfp: recent.reduce((a, r) => a + r.xfp, 0) / recent.length });
  }
  const practice = new Map<string, { days: string[]; status: string }>();
  for (const r of injuries) if (r.week === week) {
    const o = practice.get(r.gsis) ?? practice.set(r.gsis, { days: [], status: "" }).get(r.gsis)!;
    if (r.practice) o.days.push(r.practice);
    if (r.status) o.status = r.status;
  }
  // Markets are for open (upcoming) games only; ignore a stale file older than 4 days.
  const mk = m?.data && Date.now() - Date.parse(m.data.builtAt) < 4 * 86_400_000 ? m.data : null;
  return { xfp: xm, ngs: n?.data ?? new Map(), pfr: p?.data ?? new Map(), markets: mk, practice };
}
