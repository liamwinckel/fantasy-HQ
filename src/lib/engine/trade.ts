import type { LeagueContext } from "../services/league";
import { optimizeLineup, lineupTotal } from "./lineup";
import { simulateSeason, type TeamWeek } from "./simulate";
import { strategicPickValue, strategicPlayerValue, type TeamClass } from "./classify";
import type { Mode } from "../settings";
import { powerRankings, POS_ORDER } from "./power";

export interface TradeRequest {
  teamA: number; // usually you
  teamB: number;
  aSends: string[]; // "p:<playerId>" or "k:<pickKey>"
  bSends: string[];
  mode: Mode;
}

export interface AssetLine {
  id: string;
  kind: "player" | "pick";
  name: string;
  detail: string;
  from: number;
  market: number;
  toA: number; // strategic value to team A
  toB: number;
  note?: string;
  drivers: { label: string; value: string; tone: "pos" | "neg" | "neutral" }[];
}

/**
 * "Four quarters don't make a dollar": package value = (Σ vᵢ^1.8)^(1/1.8).
 * One 80 stays 80; four 20s are worth ~43, not 80; 50 + 40 is worth ~66, not 90 — which is how trades actually
 * clear in real leagues: the side getting the best player wins unless the other side is clearly paid more.
 * Applies to players and draft picks alike. A single lineup slot can't hold four depth players.
 */
export const CONSOLIDATION_POWER = 1.8;

/**
 * How likely the other manager is to accept, judged the way real managers judge trades: by market value
 * (package-adjusted), wanting to come out a little ahead, and asking for a clear premium to give up the best
 * player in the deal ("stud tax"). Returns 0.03–0.95.
 */
export function acceptChance(theyGive: number[], theyGet: number[]): number {
  const give = packageValue(theyGive), get = packageValue(theyGet);
  if (give <= 0) return get > 0 ? 0.95 : 0.5;
  const studTheirs = Math.max(0, ...theyGive) > Math.max(0, ...theyGet);
  const premium = 0.03 + (studTheirs ? 0.07 : 0);
  const x = (get / give - (1 + premium)) / 0.07;
  return Math.max(0.03, Math.min(0.95, 1 / (1 + Math.exp(-x))));
}
export function packageValue(values: number[]): number {
  const s = values.reduce((t, v) => t + Math.pow(Math.max(0, v), CONSOLIDATION_POWER), 0);
  return Math.round(Math.pow(s, 1 / CONSOLIDATION_POWER) * 10) / 10;
}

export interface PowerShift {
  rosterId: number;
  name: string;
  before: { score: number; rank: number };
  after: { score: number; rank: number };
}

export interface PositionShift {
  pos: string;
  before: { pts: number; rank: number };
  after: { pts: number; rank: number };
}

export interface BalanceSuggestion {
  action: "add" | "remove";
  side: "a" | "b"; // whose side of the trade changes
  assetId: string;
  name: string;
  detail: string;
  value: number;
  gapAfter: number; // remaining market gap (positive = you still win)
}

export interface BuildRow {
  slot: string; // e.g. "RB2", "FLEX"
  before: { id: string | null; name: string; ppg: number };
  after: { id: string | null; name: string; ppg: number };
  delta: number;
}

export interface TradeResult {
  mode: Mode;
  /** Strategy labels only exist in dynasty valuation. */
  classA: TeamClass | null;
  classB: TeamClass | null;
  /** -100 (they win big) … 0 (even) … +100 (you win big), on the same basis as the verdict. */
  balance: number;
  power: PowerShift[];
  positionsA: PositionShift[];
  positionsB: PositionShift[];
  suggestions: BalanceSuggestion[];
  assets: AssetLine[];
  market: { aSends: number; bSends: number; aSendsRaw: number; bSendsRaw: number; netForA: number; pctForA: number };
  rosterSpots: { a: { extra: number; cost: number; drops: string[] }; b: { extra: number; cost: number; drops: string[] } };
  strategic: { aNet: number; bNet: number };
  lineup: {
    aWeekBefore: number; aWeekAfter: number; bWeekBefore: number; bWeekAfter: number;
    /** Rest of season, points per game from your best lineup each week (byes, matchups and bench fill-ins included). */
    aRosDelta: number; bRosDelta: number;
    aRosBefore: number; aRosAfter: number; bRosBefore: number; bRosAfter: number;
    /** Your team's actual points per game so far. */
    aActualPpg: number | null;
    /** Week by week, your best lineup before → after. */
    aWeeks: { week: number; before: number; after: number; byes: string[] }[];
    weeks: number;
  };
  /** Chance the other manager accepts, from how they'd see the market value. */
  accept: number;
  odds: { aTitleBefore: number; aTitleAfter: number; bTitleBefore: number; bTitleAfter: number; aPlayoffBefore: number; aPlayoffAfter: number } | null;
  verdict: string;
  verdictTone: "good" | "bad" | "even";
  explanation: string[];
  /** Team build: who would start at each lineup spot before and after (healthy points per game). */
  build: { a: BuildRow[]; b: BuildRow[] };
  /** Full starting lineups before → after, slot by slot in lineup order (unchanged spots included). */
  lineups: { a: BuildRow[]; b: BuildRow[] };
  confidence: number;
  limitations: string[];
}

export function evaluateTrade(ctx: LeagueContext, req: TradeRequest): TradeResult {
  const { mode } = req;
  const dynasty = mode === "dynasty" && ctx.showClasses;
  const classOf = (rid: number): TeamClass | null => {
    if (!dynasty) return null;
    const c = ctx.classifications.get(rid);
    return (c?.override ?? c?.primary ?? null) as TeamClass | null;
  };
  const classA = classOf(req.teamA);
  const classB = classOf(req.teamB);
  const stratP = (cls: TeamClass | null, v: { redraft: number; dynastyNow: number; dynastyFuture: number; dynasty: number }, age: number | null) =>
    cls ? strategicPlayerValue(cls, mode, v, age) : mode === "redraft" ? v.redraft : v.dynasty;
  const stratK = (cls: TeamClass | null, value: number) => (cls ? strategicPickValue(cls, value) : value);

  const line = (id: string, from: number): AssetLine | null => {
    if (id.startsWith("p:")) {
      const pid = id.slice(2);
      const p = ctx.players.get(pid);
      const v = ctx.values.get(pid);
      if (!p || !v) return null;
      const market = mode === "redraft" ? v.redraft : v.dynasty;
      const pr = ctx.projections.get(pid);
      const ex = ctx.extras.get(pid);
      const drivers: AssetLine["drivers"] = [];
      const pct = (f: number) => `${f >= 1 ? "+" : ""}${Math.round((f - 1) * 100)}%`;
      if (pr) {
        drivers.push({ label: "Production", value: `${pr.seasonAvg} pts/g (last 4: ${pr.last4Avg})`, tone: "neutral" });
        drivers.push({ label: "Rest of season", value: `${Object.values(pr.byWeek).reduce((a, b) => a + b, 0).toFixed(0)} proj pts`, tone: "neutral" });
        drivers.push({ label: "Opportunity", value: pr.usageFactor === 1 ? "Steady" : pct(1 + (pr.usageFactor - 1) / 0.4), tone: pr.usageFactor > 1.02 ? "pos" : pr.usageFactor < 0.98 ? "neg" : "neutral" });
      }
      if (ex?.offense) drivers.push({ label: "Offense", value: `#${ex.offense.rank} (${ex.offense.trend >= 0 ? "+" : ""}${ex.offense.trend}% last 4)`, tone: ex.offense.rank <= 10 ? "pos" : ex.offense.rank >= 23 ? "neg" : "neutral" });
      if (ex) drivers.push({ label: "Schedule ahead", value: ex.outlookRos === 1 ? "Average" : `${ex.outlookRos > 1 ? "Easier" : "Harder"} (${pct(ex.outlookRos)})`, tone: ex.outlookRos >= 1.05 ? "pos" : ex.outlookRos <= 0.95 ? "neg" : "neutral" });
      drivers.push({ label: "Injury", value: p.injury ?? "Healthy", tone: p.injury ? "neg" : "pos" });
      const ks = ctx.keeperSurplus?.get(p.id);
      if (ctx.format === "keeper") drivers.push({ label: "Keeper value", value: ks ? `+${ks.toFixed(1)} pts/g over his keeper round` : "Not a keeper bargain", tone: ks ? "pos" : "neutral" });
      const c = ctx.consensus?.[p.id];
      if (c && (dynasty ? c.dp : c.rp)) drivers.push({ label: "Experts", value: `${p.pos}${Math.round((dynasty ? c.dp : c.rp)!)} ${dynasty ? "dynasty" : "rest of season"}`, tone: "neutral" });
      if (mode === "dynasty") {
        if (p.age) drivers.push({ label: "Age", value: `${Math.floor(p.age)}`, tone: (p.pos === "RB" && p.age >= 27) || p.age >= 30 ? "neg" : p.age <= 25 ? "pos" : "neutral" });
        if (ex) drivers.push({ label: "Contract", value: ex.yearsLeft === null ? "Unknown" : ex.yearsLeft <= 0 ? "Expiring" : `${ex.yearsLeft + 1} seasons left`, tone: ex.contractFactor > 1 ? "pos" : ex.contractFactor < 1 ? "neg" : "neutral" });
        if (ex) drivers.push({ label: "Durability", value: `${ex.durabilityPct}% of games${ex.reportsOut ? ` · out ${ex.reportsOut} wks` : ""}`, tone: ex.durability < 1 ? "neg" : "pos" });
      }
      return {
        id, kind: "player", name: p.name, from, market, drivers,
        detail: `${p.pos}${p.team ? ` · ${p.team}` : ""}${p.age ? ` · ${Math.floor(p.age)}` : ""} · ${pr?.base ?? 0} pts/g`,
        toA: stratP(classA, v, p.age),
        toB: stratP(classB, v, p.age),
        note: p.injury ? p.injury : undefined,
      };
    }
    const key = id.slice(2);
    const pk = ctx.picks.find((x) => x.key === key);
    if (!pk) return null;
    const market = mode === "redraft" ? 0 : pk.value;
    const orig = ctx.teams.find((t) => t.rosterId === pk.originalRosterId);
    return {
      id, kind: "pick", name: `${pk.season} Round ${pk.round}`, from, market,
      detail: `${orig ? `Orig. ${orig.name}` : ""} · ${pk.tier}${pk.tierSource === "estimated" ? ` (est. slot ${pk.estimatedSlot})` : pk.tierSource === "default" ? " (slot unknown)" : " (manual)"}`,
      toA: stratK(classA, market),
      toB: stratK(classB, market),
      note: mode === "redraft" ? "No current-season value in Redraft" : undefined,
      drivers: [{ label: "Pick", value: `${pk.season} R${pk.round} · ${pk.tier}`, tone: "neutral" }],
    };
  };

  const assets = [
    ...req.aSends.map((id) => line(id, req.teamA)),
    ...req.bSends.map((id) => line(id, req.teamB)),
  ].filter((x): x is AssetLine => !!x);
  const sum = (from: number, f: (a: AssetLine) => number) => assets.filter((a) => a.from === from).reduce((t, a) => t + f(a), 0);
  const pkg = (from: number, f: (a: AssetLine) => number) => packageValue(assets.filter((a) => a.from === from).map(f));
  const aSendsRaw = sum(req.teamA, (a) => a.market);
  const bSendsRaw = sum(req.teamB, (a) => a.market);
  const aSendsMkt = pkg(req.teamA, (a) => a.market);
  const bSendsMkt = pkg(req.teamB, (a) => a.market);
  const netForA = r1(bSendsMkt - aSendsMkt);
  const pctForA = Math.round((100 * netForA) / Math.max(1, Math.max(aSendsMkt, bSendsMkt)));

  // Roster spots: taking back more players than you send means cutting your weakest players.
  const valueKey = mode === "redraft" ? "redraft" : "dynasty";
  const rostered = new Set(ctx.teams.flatMap((t) => t.players));
  const bestFA = [...ctx.values.values()].filter((v) => !rostered.has(v.id)).map((v) => v[valueKey]).sort((x, y) => y - x);
  const inTradeIds = new Set([...req.aSends, ...req.bSends].filter((x) => x.startsWith("p:")).map((x) => x.slice(2)));
  const spotCost = (rid: number, incoming: number, outgoing: number) => {
    const t = ctx.teams.find((x) => x.rosterId === rid)!;
    const extra = incoming - outgoing;
    if (extra > 0) {
      const cut = t.players.filter((pid) => !inTradeIds.has(pid) && !t.taxi.includes(pid) && !t.reserve.includes(pid))
        .sort((x, y) => (ctx.values.get(x)?.[valueKey] ?? 0) - (ctx.values.get(y)?.[valueKey] ?? 0)).slice(0, extra);
      return { extra, cost: r1(cut.reduce((a, pid) => a + (ctx.values.get(pid)?.[valueKey] ?? 0), 0)), drops: cut.map((pid) => ctx.players.get(pid)?.name ?? pid) };
    }
    if (extra < 0) return { extra, cost: -r1(bestFA.slice(0, Math.min(3, -extra)).reduce((a, v) => a + v, 0) * 0.5), drops: [] };
    return { extra: 0, cost: 0, drops: [] };
  };
  const nPlayers = (list: string[]) => list.filter((x) => x.startsWith("p:")).length;
  const rosterSpots = {
    a: spotCost(req.teamA, nPlayers(req.bSends), nPlayers(req.aSends)),
    b: spotCost(req.teamB, nPlayers(req.aSends), nPlayers(req.bSends)),
  };
  const aNet = r1(pkg(req.teamB, (a) => a.toA) - pkg(req.teamA, (a) => a.toA) - rosterSpots.a.cost);
  const bNet = r1(pkg(req.teamA, (a) => a.toB) - pkg(req.teamB, (a) => a.toB) - rosterSpots.b.cost);

  // Lineup impact
  const ids = (list: string[]) => list.filter((x) => x.startsWith("p:")).map((x) => x.slice(2));
  const aOut = new Set(ids(req.aSends));
  const bOut = new Set(ids(req.bSends));
  const teamA = ctx.teams.find((t) => t.rosterId === req.teamA)!;
  const teamB = ctx.teams.find((t) => t.rosterId === req.teamB)!;
  const usable = (t: typeof teamA) => t.players.filter((p) => !t.taxi.includes(p) && !t.reserve.includes(p) && ctx.players.has(p));
  const aBefore = usable(teamA);
  const bBefore = usable(teamB);
  const aAfter = [...aBefore.filter((p) => !aOut.has(p)), ...bOut];
  const bAfter = [...bBefore.filter((p) => !bOut.has(p)), ...aOut];
  const weekly = (roster: string[], w: number) => {
    const lu = optimizeLineup(ctx.league.roster_positions, roster.map((pid) => ({
      id: pid, positions: ctx.players.get(pid)?.positions ?? [], points: ctx.projections.get(pid)?.byWeek[w] ?? 0,
    })));
    const sd = Math.sqrt(lu.reduce((a, s) => a + (s.playerId ? (ctx.projections.get(s.playerId)?.sd ?? 0) ** 2 : 0), 0));
    return { mean: lineupTotal(lu), sd: Math.max(8, sd) } as TeamWeek;
  };
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const rosWeeks = ctx.seasonOver ? [] : Array.from({ length: ctx.lastWeek - w0 + 1 }, (_, i) => w0 + i);
  // Calibrate to what the team actually scores: model PPG vs real PPG so far, half-weighted, capped at ±10%.
  const calib = (t: typeof teamA) => {
    const gp = t.wins + t.losses + t.ties;
    if (gp < 3 || !t.pointsFor) return 1;
    const model = rosWeeks.length ? weekly(usable(t), w0).mean : 0;
    if (model <= 0) return 1;
    return Math.max(0.9, Math.min(1.1, 1 + 0.5 * (t.pointsFor / gp / model - 1)));
  };
  const rosPpg = (roster: string[], k: number) => rosWeeks.length ? (rosWeeks.reduce((a, w) => a + weekly(roster, w).mean, 0) / rosWeeks.length) * k : 0;
  const ka = calib(teamA), kb = calib(teamB);
  const byesOn = (roster: string[], w: number) => roster.filter((pid) => { const pr = ctx.projections.get(pid); return pr && pr.base >= (ctx.replacement[ctx.players.get(pid)?.pos ?? ""] ?? 99) && (pr.byWeek[w] ?? 1) === 0 && !ctx.players.get(pid)?.injury; }).map((pid) => ctx.players.get(pid)?.name ?? pid);
  const aRosBefore = r1(rosPpg(aBefore, ka)), aRosAfter = r1(rosPpg(aAfter, ka)), bRosBefore = r1(rosPpg(bBefore, kb)), bRosAfter = r1(rosPpg(bAfter, kb));
  const gpA = teamA.wins + teamA.losses + teamA.ties;
  const lineup = {
    aWeekBefore: weekly(aBefore, w0).mean, aWeekAfter: weekly(aAfter, w0).mean,
    bWeekBefore: weekly(bBefore, w0).mean, bWeekAfter: weekly(bAfter, w0).mean,
    aRosDelta: ctx.seasonOver ? 0 : r1(aRosAfter - aRosBefore),
    bRosDelta: ctx.seasonOver ? 0 : r1(bRosAfter - bRosBefore),
    aRosBefore, aRosAfter, bRosBefore, bRosAfter,
    aActualPpg: gpA ? r1(teamA.pointsFor / gpA) : null,
    aWeeks: rosWeeks.map((w) => ({ week: w, before: r1(weekly(aBefore, w).mean * ka), after: r1(weekly(aAfter, w).mean * ka), byes: byesOn(aAfter, w) })),
    weeks: rosWeeks.length,
  };

  // Title odds before/after (re-simulated with the new rosters for both teams)
  let odds: TradeResult["odds"] = null;
  if (!ctx.seasonOver) {
    const cacheA = new Map<number, TeamWeek>();
    const cacheB = new Map<number, TeamWeek>();
    const after = simulateSeason({
      rosterIds: ctx.teams.map((t) => t.rosterId),
      wins: Object.fromEntries(ctx.teams.map((t) => [t.rosterId, t.wins])),
      losses: Object.fromEntries(ctx.teams.map((t) => [t.rosterId, t.losses])),
      ties: Object.fromEntries(ctx.teams.map((t) => [t.rosterId, t.ties])),
      pointsFor: Object.fromEntries(ctx.teams.map((t) => [t.rosterId, t.pointsFor])),
      schedule: remainingSchedule(ctx),
      strength: (rid, w) => {
        if (rid === req.teamA) { if (!cacheA.has(w)) cacheA.set(w, weekly(aAfter, w)); return cacheA.get(w)!; }
        if (rid === req.teamB) { if (!cacheB.has(w)) cacheB.set(w, weekly(bAfter, w)); return cacheB.get(w)!; }
        return ctx.weekStrength.get(rid)?.get(w) ?? { mean: 100, sd: 20 };
      },
      playoffTeams: ctx.league.settings.playoff_teams || 6,
      playoffWeeks: Array.from({ length: ctx.lastWeek - ctx.playoffStart + 1 }, (_, i) => ctx.playoffStart + i),
      runs: 3000,
      seed: 99,
    });
    odds = {
      aTitleBefore: ctx.sim.titleOdds[req.teamA] ?? 0, aTitleAfter: after.titleOdds[req.teamA] ?? 0,
      bTitleBefore: ctx.sim.titleOdds[req.teamB] ?? 0, bTitleAfter: after.titleOdds[req.teamB] ?? 0,
      aPlayoffBefore: ctx.sim.playoffOdds[req.teamA] ?? 0, aPlayoffAfter: after.playoffOdds[req.teamA] ?? 0,
    };
  }

  // Team build: the lineup each side would actually field, spot by spot (healthy points per game).
  const buildRows = (before: string[], after: string[], all = false): BuildRow[] => {
    const lu = (roster: string[]) => optimizeLineup(ctx.league.roster_positions, roster.map((pid) => ({
      id: pid, positions: ctx.players.get(pid)?.positions ?? [], points: ctx.projections.get(pid)?.base ?? 0,
    })));
    const b = lu(before), a = lu(after);
    // Compare the two best lineups slot by slot (QB, RB1, RB2, …, FLEX). Players sliding into a flex spot
    // count as filling it, so adding a receiver who takes the flex isn't read as losing a running back.
    const count = new Map<string, number>();
    const names = b.map((x) => { const n = (count.get(x.slot) ?? 0) + 1; count.set(x.slot, n); return x.slot; });
    const totals = new Map<string, number>();
    names.forEach((n) => totals.set(n, (totals.get(n) ?? 0) + 1));
    const seen = new Map<string, number>();
    const rows: BuildRow[] = [];
    const nm = (id: string | null) => ({ id, name: id ? ctx.players.get(id)?.name ?? id : "Nobody", ppg: r1(id ? ctx.projections.get(id)?.base ?? 0 : 0) });
    // Within each slot type, line up by strength so RB1 compares with RB1.
    const bySlot = (l: typeof b) => {
      const m = new Map<string, (string | null)[]>();
      for (const x of l) (m.get(x.slot) ?? m.set(x.slot, []).get(x.slot)!).push(x.playerId);
      for (const v of m.values()) v.sort((p, q) => (ctx.projections.get(q ?? "")?.base ?? 0) - (ctx.projections.get(p ?? "")?.base ?? 0));
      return m;
    };
    const sb = bySlot(b), sa = bySlot(a);
    for (const slot of [...new Set(names)]) {
      const xb = sb.get(slot) ?? [], xa = sa.get(slot) ?? [];
      for (let i = 0; i < Math.max(xb.length, xa.length); i++) {
        const k = (seen.get(slot) ?? 0) + 1; seen.set(slot, k);
        const same = (xb[i] ?? null) === (xa[i] ?? null);
        if (same && !all) continue;
        const before = nm(xb[i] ?? null), after = nm(xa[i] ?? null);
        const label = slot.replace("SUPER_FLEX", "SFLEX").replace("REC_FLEX", "W/T FLEX").replace("WRRB_FLEX", "W/R FLEX");
        rows.push({ slot: (totals.get(slot) ?? 1) > 1 ? `${label}${k}` : label, before, after, delta: r1(after.ppg - before.ppg) });
      }
    }
    return all ? rows : rows.sort((x, y) => x.delta - y.delta);
  };
  const build = { a: buildRows(aBefore, aAfter), b: buildRows(bBefore, bAfter) };
  const lineups = { a: buildRows(aBefore, aAfter, true), b: buildRows(bBefore, bAfter, true) };

  // Verdict
  const scaleA = Math.max(5, Math.abs(sum(req.teamA, (a) => a.toA)) + Math.abs(sum(req.teamB, (a) => a.toA)));
  const scaleB = Math.max(5, Math.abs(sum(req.teamA, (a) => a.toB)) + Math.abs(sum(req.teamB, (a) => a.toB)));
  let aRel = aNet / scaleA;
  let bRel = bNet / scaleB;
  if (!ctx.seasonOver) {
    // Team build: what each side can actually start afterwards. Losing a good RB2 and having to start
    // a weak backup costs real points even if the values look even. Redraft leans on it most.
    const rosScale = Math.max(2, Math.abs(lineup.aRosDelta) + Math.abs(lineup.bRosDelta));
    const w = dynasty ? 0.25 : 0.65;
    aRel = (1 - w) * aRel + w * (lineup.aRosDelta / rosScale);
    bRel = (1 - w) * bRel + w * (lineup.bRosDelta / rosScale);
  }
  const accept = acceptChance(assets.filter((a) => a.from === req.teamB).map((a) => a.market), assets.filter((a) => a.from === req.teamA).map((a) => a.market));
  let verdict: string, verdictTone: TradeResult["verdictTone"];
  if (assets.length === 0) { verdict = "Add assets to both sides"; verdictTone = "even"; }
  else if (aRel >= -0.05 && bRel >= -0.05 && accept >= 0.4) { verdict = "Fits both teams"; verdictTone = "good"; }
  else if (aRel > 0.15 && bRel < -0.15) { verdict = "Strongly favours you"; verdictTone = "good"; }
  else if (aRel > 0.05) { verdict = "Favours you"; verdictTone = "good"; }
  else if (aRel < -0.15) { verdict = "Favours them"; verdictTone = "bad"; }
  else if (aRel < -0.05) { verdict = "Slightly favours them"; verdictTone = "bad"; }
  else { verdict = "Roughly even"; verdictTone = "even"; }

  const explanation: string[] = [];
  // Text uses the 0–999 display scale.
  const k9 = (x: number) => Math.round(x * 9.99).toLocaleString();
  explanation.push(`Package value: you send ${k9(aSendsMkt)}, you receive ${k9(bSendsMkt)} (${netForA >= 0 ? "+" : "−"}${k9(Math.abs(netForA))}).`);
  if (Math.abs(aSendsRaw - aSendsMkt) > 2 || Math.abs(bSendsRaw - bSendsMkt) > 2)
    explanation.push(`Straight sums would be ${k9(aSendsRaw)} vs ${k9(bSendsRaw)}. Packages are discounted because several smaller pieces can't fill one star's lineup spot.`);
  if (rosterSpots.a.extra > 0) explanation.push(`You take back ${rosterSpots.a.extra} more player${rosterSpots.a.extra > 1 ? "s" : ""} than you send, so you'd cut ${rosterSpots.a.drops.join(", ")} (−${k9(rosterSpots.a.cost)}).`);
  if (rosterSpots.a.extra < 0) explanation.push(`You free ${-rosterSpots.a.extra} roster spot${rosterSpots.a.extra < -1 ? "s" : ""} for waiver pickups (+${k9(-rosterSpots.a.cost)}).`);
  if (classA && classB)
    explanation.push(`As a ${classA}, the trade is worth ${aNet >= 0 ? "+" : "−"}${k9(Math.abs(aNet))} to you strategically. As a ${classB}, it's worth ${bNet >= 0 ? "+" : "−"}${k9(Math.abs(bNet))} to ${teamB.name}.`);
  const dA = r1(lineup.aWeekAfter - lineup.aWeekBefore);
  if (!ctx.seasonOver) explanation.push(`Your best lineup this week: ${dA >= 0 ? "+" : ""}${dA} pts. Rest of season: ${lineup.aRosBefore} → ${lineup.aRosAfter} pts/g (${lineup.aRosDelta >= 0 ? "+" : ""}${lineup.aRosDelta}), counting byes, matchups and who steps in from your bench.`);
  explanation.push(`Chance ${teamB.name} says yes: about ${Math.round(accept * 100)}%. Managers judge by market value, want to come out a little ahead, and want a clear premium to give up the best player in the deal.`);
  const worstA = build.a[0];
  if (worstA && worstA.delta <= -2) explanation.push(`Team build: your ${worstA.slot} would be ${worstA.after.name} (${worstA.after.ppg} pts/g) instead of ${worstA.before.name} (${worstA.before.ppg}).`);
  const worstB = build.b[0];
  if (worstB && worstB.delta <= -2) explanation.push(`${teamB.name}'s ${worstB.slot} would drop to ${worstB.after.name} (${worstB.after.ppg} pts/g).`);
  if (odds) explanation.push(`Simulated title odds: ${odds.aTitleBefore}% → ${odds.aTitleAfter}%.`);
  if (mode === "redraft" && assets.some((a) => a.kind === "pick")) explanation.push("Draft picks carry no value in Redraft mode.");

  const lowConf = assets.filter((a) => a.kind === "player" && ctx.projections.get(a.id.slice(2))?.confidence === "Low").length;
  const unknownPicks = assets.filter((a) => a.kind === "pick" && a.detail.includes("unknown")).length;
  const confidence = Math.max(40, Math.min(85, 78 - lowConf * 8 - unknownPicks * 4 - (Math.abs(aRel) < 0.05 ? 6 : 0)));

  // Power rankings before / after for every team
  const allA = [...teamA.players.filter((p) => !aOut.has(p)), ...bOut];
  const allB = [...teamB.players.filter((p) => !bOut.has(p)), ...aOut];
  const pBefore = powerRankings(ctx);
  const pAfter = powerRankings(ctx, new Map([[req.teamA, allA], [req.teamB, allB]]));
  const power: PowerShift[] = pBefore.map((b) => {
    const a = pAfter.find((x) => x.rosterId === b.rosterId)!;
    return { rosterId: b.rosterId, name: ctx.teams.find((t) => t.rosterId === b.rosterId)!.name, before: { score: b.score, rank: b.rank }, after: { score: a.score, rank: a.rank } };
  });
  const posShift = (rid: number): PositionShift[] => {
    const b = pBefore.find((x) => x.rosterId === rid)!;
    const a = pAfter.find((x) => x.rosterId === rid)!;
    return POS_ORDER.filter((p) => b.positions[p] || a.positions[p]).map((p) => ({
      pos: p, before: b.positions[p] ?? { pts: 0, rank: 0 }, after: a.positions[p] ?? { pts: 0, rank: 0 },
    })).concat([{ pos: "Depth", before: { pts: b.depth, rank: b.depthRank }, after: { pts: a.depth, rank: a.depthRank } }]);
  };

  // Suggestions to make it fair (market value, in the selected mode)
  const gap = r1(bSendsMkt - aSendsMkt); // > 0: you receive more
  const suggestions: BalanceSuggestion[] = [];
  const fairBand = Math.max(3, 0.08 * Math.max(aSendsMkt, bSendsMkt));
  if (assets.length && Math.abs(gap) > fairBand) {
    const winner = gap > 0 ? teamA : teamB; // side receiving more value
    const loserSendsIds = gap > 0 ? req.bSends : req.aSends;
    const inTrade = new Set([...req.aSends, ...req.bSends]);
    const g = Math.abs(gap);
    const starters = new Set(ctx.lineups.get(winner.rosterId)?.optimal.map((s) => s.playerId) ?? []);
    const pool = [
      ...winner.players.filter((pid) => ctx.players.has(pid)).map((pid) => `p:${pid}`),
      ...(mode === "dynasty" ? ctx.picks.filter((k) => k.ownerRosterId === winner.rosterId).map((k) => `k:${k.key}`) : []),
    ].filter((id) => !inTrade.has(id));
    const vals = (from: number) => assets.filter((a) => a.from === from).map((a) => a.market);
    const gapWith = (side: "a" | "b", add: number | null, removeId: string | null) => {
      const av = assets.filter((a) => a.from === req.teamA && a.id !== removeId).map((a) => a.market);
      const bv = assets.filter((a) => a.from === req.teamB && a.id !== removeId).map((a) => a.market);
      if (add !== null) (side === "a" ? av : bv).push(add);
      return r1(packageValue(bv) - packageValue(av));
    };
    void vals;
    const adds = pool
      .map((id) => line(id, winner.rosterId))
      .filter((x): x is AssetLine => !!x && x.market >= 0.5 * g && x.market <= 2 * g)
      .map((x) => ({ x, cost: Math.abs(gapWith(gap > 0 ? "a" : "b", x.market, null)) + (x.kind === "player" && starters.has(x.id.slice(2)) ? 0.25 * g : 0) }))
      .sort((p, q) => p.cost - q.cost)
      .slice(0, 3);
    for (const { x } of adds)
      suggestions.push({ action: "add", side: gap > 0 ? "a" : "b", assetId: x.id, name: x.name, detail: x.detail, value: x.market, gapAfter: gapWith(gap > 0 ? "a" : "b", x.market, null) });
    const removes = assets
      .filter((x) => loserSendsIds.length > 1 && loserSendsIds.includes(x.id) && x.market <= 1.4 * g && x.market >= 0.4 * g)
      .sort((p, q) => Math.abs(p.market - g) - Math.abs(q.market - g))
      .slice(0, 2);
    for (const x of removes)
      suggestions.push({ action: "remove", side: gap > 0 ? "b" : "a", assetId: x.id, name: x.name, detail: x.detail, value: x.market, gapAfter: gapWith(gap > 0 ? "b" : "a", null, x.id) });
  }
  const balance = Math.max(-100, Math.min(100, Math.round(75 * (aRel - bRel))));

  return {
    mode, classA, classB, assets, balance, power, positionsA: posShift(req.teamA), positionsB: posShift(req.teamB), suggestions,
    market: { aSends: r1(aSendsMkt), bSends: r1(bSendsMkt), aSendsRaw: r1(aSendsRaw), bSendsRaw: r1(bSendsRaw), netForA, pctForA },
    rosterSpots,
    strategic: { aNet, bNet }, lineup, accept, odds, verdict, verdictTone, explanation, confidence, build, lineups,
    limitations: [
      "Values come from SHS Fantasy HQ's own model, not a market consensus.",
      "Projections are internal estimates built from this season's production and usage.",
      "Your trade partner's actual preferences are unknown.",
    ],
  };
}

export function remainingSchedule(ctx: LeagueContext) {
  return Object.entries(ctx.remainingSchedule).map(([w, games]) => ({ week: Number(w), games }));
}

const r1 = (x: number) => Math.round(x * 10) / 10;
