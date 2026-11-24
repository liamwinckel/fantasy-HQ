import { sleeper } from "../sleeper/client";
import { keeperPlan, type KeeperRow, type KeeperRules } from "../engine/keepers";
import type { DraftPick, League, TradedPick } from "../sleeper/types";
import type { AppSettings } from "../settings";
import type { LeagueContext } from "./league";
import { keeperRulesFor } from "./keeperRules";

/** One pick on next season's board. */
export interface BoardCell {
  key: string; // "2027-10-4" = season-round-original roster
  round: number; slot: number; overall: number; label: string; // "10.04"
  originalRosterId: number; ownerRosterId: number;
  keeper: { playerId: string; name: string; pos: string; team: string | null; mine: boolean; predicted: boolean; costRound: number } | null;
}
export interface KeeperSlot { key: string; label: string; via: string | null }
export interface MyKeeperRow extends KeeperRow { slots: KeeperSlot[]; keptAt: string | null; planned: boolean; slotNote: string | null }

/**
 * Keeper plan for a league: rules (saved → Sleeper → defaults), this season's draft board from Sleeper
 * (round, pick, who drafted him, whether he was a keeper), the draft's size, how many seasons in a row each
 * player has been kept, next season's board with who owns each pick, your planned keepers and every other
 * team's likely keepers.
 */
export async function loadKeeperPlan(settings: AppSettings, league: League, ctx: LeagueContext) {
  const sleeperMax = Number((league.settings as Record<string, unknown>).max_keepers) || 0;
  const rules: KeeperRules = keeperRulesFor(settings, league);
  const plan = settings.keeperRules[league.league_id]?.plan ?? {};
  let rounds = league.settings.draft_rounds || 15;
  let teams = ctx.teamsCount;
  let draftType: string | null = null;
  let picks: DraftPick[] = [];
  let note: string | null = null;
  try {
    const drafts = (await sleeper.drafts(league.league_id)).data;
    const d = drafts.find((x) => x.draft_id === league.draft_id) ?? drafts[0];
    if (d) {
      const st = (d.settings ?? {}) as Record<string, unknown>;
      rounds = Number(st.rounds) || rounds;
      teams = Number(st.teams) || teams;
      draftType = d.type ?? null;
      picks = (await sleeper.draftPicks(d.draft_id)).data;
    } else note = "No draft found for this season on Sleeper.";
  } catch {
    note = "Couldn't load this season's draft from Sleeper, so every player is treated as undrafted until it loads.";
  }
  // Seasons in a row kept: this season's draft, then previous seasons' drafts while he keeps showing up as a keeper.
  const yearsKept = new Map<string, number>();
  for (const p of picks) if (p.is_keeper) yearsKept.set(p.player_id, 1);
  let prev = league.previous_league_id ?? null;
  let alive = new Set(yearsKept.keys());
  for (let i = 0; i < 4 && prev && alive.size; i++) {
    try {
      const pl = await sleeper.league(prev);
      const ds = (await sleeper.drafts(prev)).data;
      const keptThen = new Set<string>();
      for (const d of ds) for (const p of (await sleeper.draftPicks(d.draft_id)).data) if (p.is_keeper) keptThen.add(p.player_id);
      alive = new Set([...alive].filter((id) => keptThen.has(id)));
      for (const id of alive) yearsKept.set(id, (yearsKept.get(id) ?? 0) + 1);
      prev = pl.data.previous_league_id ?? null;
    } catch { break; }
  }
  const teamName = (rid: number) => ctx.teams.find((t) => t.rosterId === rid)?.name ?? `Team ${rid}`;
  const extra = { yearsKept, teams, teamName };

  // ---- next season's board: estimated order (worst projected record picks first), traded picks applied ----
  const season = String(Number(league.season) + 1);
  let traded: TradedPick[] = [];
  try { traded = (await sleeper.tradedPicks(league.league_id)).data; } catch { /* no trades */ }
  const order = [...ctx.teams].sort((a, b) => (ctx.sim.projectedWins[a.rosterId] ?? 0) - (ctx.sim.projectedWins[b.rosterId] ?? 0)).map((t) => t.rosterId);
  const snake = draftType !== "linear";
  const board: BoardCell[] = [];
  for (let r = 1; r <= rounds; r++) {
    const ids = snake && r % 2 === 0 ? [...order].reverse() : order;
    ids.forEach((orig, i) => {
      const t = traded.find((x) => x.season === season && x.round === r && x.roster_id === orig);
      const slot = i + 1;
      board.push({ key: `${season}-${r}-${orig}`, round: r, slot, overall: (r - 1) * order.length + slot, label: `${r}.${String(slot).padStart(2, "0")}`, originalRosterId: orig, ownerRosterId: t ? t.owner_id : orig, keeper: null });
    });
  }
  const used = new Set<string>();
  const options = (rid: number, round: number) => board.filter((c) => c.round === round && c.ownerRosterId === rid && (rules.anyPick || c.originalRosterId === rid));
  /** Pick a free cell for a keeper: preferred key, else the earliest in his cost round, else the missing-pick rule. */
  const place = (rid: number, round: number, pref?: string): { cell: BoardCell | null; note: string | null } => {
    const free = (r: number) => options(rid, r).filter((c) => !used.has(c.key));
    const inRound = free(round);
    const want = pref ? inRound.find((c) => c.key === pref) ?? null : null;
    if (want) return { cell: want, note: null };
    if (inRound.length) return { cell: inRound[0], note: null };
    if (rules.missingPick === "none") return { cell: null, note: `No round ${round} pick available` };
    const step = rules.missingPick === "earlier" ? -1 : 1;
    for (let r = round + step; r >= 1 && r <= rounds; r += step) {
      const f = free(r);
      if (f.length) return { cell: f[0], note: `No round ${round} pick, so it uses your round ${r} pick` };
    }
    return { cell: null, note: `No pick left to keep him with` };
  };

  // ---- your keepers: your plan, or the recommended ones ----
  const mine = ctx.myRosterId;
  const rows = mine !== null ? keeperPlan(ctx, mine, picks, rules, rounds, extra) : [];
  const hasPlan = Object.keys(plan).length > 0;
  const myKeep = rows.filter((r) => r.costRound !== null && (hasPlan ? plan[r.playerId] && plan[r.playerId] !== "none" : r.recommended));
  const myRows: MyKeeperRow[] = rows.map((r) => ({
    ...r,
    slots: r.costRound === null || mine === null ? [] : options(mine, r.costRound).map((c) => ({ key: c.key, label: c.label, via: c.originalRosterId !== mine ? teamName(c.originalRosterId) : null })),
    keptAt: null, planned: myKeep.includes(r), slotNote: null,
  }));
  for (const r of myRows.filter((x) => x.planned)) {
    const pl = place(mine!, r.costRound!, plan[r.playerId]);
    r.slotNote = pl.note;
    if (pl.cell) {
      used.add(pl.cell.key);
      r.keptAt = pl.cell.key;
      pl.cell.keeper = { playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, mine: true, predicted: false, costRound: r.costRound! };
    }
  }

  // ---- every other team's likely keepers ----
  const others: { rosterId: number; name: string; keepers: (KeeperRow & { at: string | null; note: string | null })[] }[] = [];
  for (const t of ctx.teams) {
    if (t.rosterId === mine) continue;
    const list = keeperPlan(ctx, t.rosterId, picks, rules, rounds, extra)
      .filter((r) => r.costRound !== null && r.keepScore > 0.2)
      .sort((a, b) => b.keepScore - a.keepScore)
      .slice(0, rules.maxKeepers);
    const keepers = list.map((r) => {
      const pl = place(t.rosterId, r.costRound!);
      if (pl.cell) {
        used.add(pl.cell.key);
        pl.cell.keeper = { playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, mine: false, predicted: true, costRound: r.costRound! };
      }
      return { ...r, at: pl.cell?.label ?? null, note: pl.note };
    });
    others.push({ rosterId: t.rosterId, name: t.name, keepers });
  }
  return { rules, rounds, teams, draftType, sleeperMax, rows: myRows, note, board, order, season, others, hasPlan };
}
