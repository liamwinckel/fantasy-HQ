/**
 * Builds Sleeper-shaped fixture JSON for offline tests, using real NFLverse 2026 stats.
 * Leagues, managers and rosters are synthetic. Run: npx tsx tests/fixtures/build.ts
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { scoreStatLine } from "../../src/lib/engine/scoring";
import { optimizeLineup } from "../../src/lib/engine/lineup";
import { primaryPosition } from "../../src/lib/engine/positions";
import type { WeekStat } from "../../src/lib/nflverse";

const OUT = path.join(__dirname, "generated", "sleeper");
const NV = path.join(__dirname, "generated", "nflverse");
fs.mkdirSync(OUT, { recursive: true });
const write = (p: string, data: unknown) => fs.writeFileSync(path.join(OUT, p.replace(/^\//, "").replace(/\//g, "__") + ".json"), JSON.stringify(data));
const csv = (f: string) => Papa.parse<Record<string, string>>(fs.readFileSync(path.join(NV, f), "utf8"), { header: true, skipEmptyLines: true }).data;
const n = (v?: string) => (v ? Number(v) || 0 : 0);
const team = (t: string) => (t === "LA" ? "LAR" : t);

const CURRENT_WEEK = 12;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---- players ----
const statsRows = csv("stats_2026.csv").filter((r) => r.season_type === "REG");
const info = new Map(csv("players.csv").map((r) => [r.gsis_id, r]));
const posMap: Record<string, string> = { DE: "DL", DT: "DL", NT: "DL", DL: "DL", ILB: "LB", OLB: "LB", MLB: "LB", LB: "LB", CB: "DB", S: "DB", SAF: "DB", FS: "DB", SS: "DB", DB: "DB" };
const players: Record<string, Record<string, unknown>> = {};
const byGsis = new Map<string, string>();
const seasonPpr = new Map<string, number>();
const gp = new Map<string, number>();
let idx = 1000;
for (const r of statsRows) {
  const pos = ["QB", "RB", "WR", "TE", "K"].includes(r.position) ? r.position : posMap[r.position];
  if (!pos) continue;
  if (!byGsis.has(r.player_id)) {
    const id = String(idx++);
    byGsis.set(r.player_id, id);
    const ni = info.get(r.player_id);
    const roll = rand();
    players[id] = {
      player_id: id, first_name: r.player_display_name.split(" ")[0], last_name: r.player_display_name.split(" ").slice(1).join(" "),
      full_name: r.player_display_name, position: pos, fantasy_positions: [pos], team: team(r.team), birth_date: ni?.birth_date || null,
      years_exp: ni?.years_of_experience ? Number(ni.years_of_experience) : null, gsis_id: r.player_id, status: "Active",
      injury_status: roll < 0.04 ? "Questionable" : roll < 0.055 ? "Out" : roll < 0.065 ? "IR" : null,
    };
  }
  const id = byGsis.get(r.player_id)!;
  players[id].team = team(r.team);
  gp.set(id, (gp.get(id) ?? 0) + 1);
  seasonPpr.set(id, (seasonPpr.get(id) ?? 0) + n(r.fantasy_points_ppr) + (pos === "K" ? n(r.fg_made) * 3 + n(r.pat_made) : 0) + (["DL", "LB", "DB"].includes(pos) ? n(r.def_tackles_solo) + n(r.def_sacks) * 4 : 0));
}
const teams = [...new Set(statsRows.map((r) => team(r.team)))];
for (const t of teams) {
  players[t] = { player_id: t, first_name: t, last_name: "Defense", position: "DEF", fantasy_positions: ["DEF"], team: t, status: "Active" };
  seasonPpr.set(t, 60 + rand() * 60);
}
write("/players/nfl", players);
write("/state/nfl", { week: CURRENT_WEEK, display_week: CURRENT_WEEK, season: "2026", season_type: "regular", leg: CURRENT_WEEK });

const userIds = ["389682598735060992", ...Array.from({ length: 11 }, (_, i) => `u${i + 2}`)];
const names = ["Gridlock FC", "Lambeau Leapers", "Big Play Bobby", "Sarah's Squad", "Waiver Wolves", "Dakota's Dynasty", "Fourth & Long", "Hank's Tanks", "Red Zone Rejects", "Taxi Squad", "Bench Mob", "Punt Gods"];
write(`/user/L1am`, { user_id: userIds[0], username: "l1am", display_name: "L1am", avatar: null });

// ---- weekly stats lookup ----
const weekStats = new Map<string, WeekStat>();
for (const r of statsRows) {
  const id = byGsis.get(r.player_id);
  if (!id) continue;
  weekStats.set(`${id}:${r.week}`, {
    gsis: r.player_id, week: n(r.week), position: r.position, team: team(r.team), opp: team(r.opponent_team),
    att: n(r.attempts), cmp: n(r.completions), passYd: n(r.passing_yards), passTd: n(r.passing_tds), int: n(r.passing_interceptions), pass2pt: 0, sacks: n(r.sacks_suffered),
    car: n(r.carries), rushYd: n(r.rushing_yards), rushTd: n(r.rushing_tds), rush2pt: 0, rushFd: n(r.rushing_first_downs),
    tgt: n(r.targets), rec: n(r.receptions), recYd: n(r.receiving_yards), recTd: n(r.receiving_tds), rec2pt: 0, recFd: n(r.receiving_first_downs),
    tgtShare: n(r.target_share), airShare: 0, fumLost: n(r.rushing_fumbles_lost) + n(r.receiving_fumbles_lost),
    fgm0_19: n(r.fg_made_0_19), fgm20_29: n(r.fg_made_20_29), fgm30_39: n(r.fg_made_30_39), fgm40_49: n(r.fg_made_40_49), fgm50p: n(r.fg_made_50_59) + n(r.fg_made_60_),
    fgMiss: n(r.fg_missed), xpm: n(r.pat_made), xpMiss: n(r.pat_missed),
    tklSolo: n(r.def_tackles_solo), tklAst: n(r.def_tackle_assists), tfl: n(r.def_tackles_for_loss), sack: n(r.def_sacks), qbHit: n(r.def_qb_hits),
    defInt: n(r.def_interceptions), pd: n(r.def_pass_defended), ff: n(r.def_fumbles_forced), fr: n(r.fumble_recovery_opp), defTd: n(r.def_tds), safety: n(r.def_safeties),
    pprPoints: n(r.fantasy_points_ppr),
  });
}

const SCORING_PPR = { pass_yd: 0.04, pass_td: 4, pass_int: -1, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6, fum_lost: -2, fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, fgmiss: -1, xpm: 1, xpmiss: -1, idp_tkl_solo: 1, idp_tkl_ast: 0.5, idp_sack: 4, idp_int: 3, idp_ff: 3, idp_pass_def: 1 };

// ---- league history helpers (FAAB claims with competing bids, trades, past seasons) ----
type Tx = Record<string, unknown>;
let txSeq = 1;
function claims(rosterIds: number[], fas: string[], week: number, budget: number | null): Tx[] {
  const out: Tx[] = [];
  const k = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < k && fas.length; i++) {
    const pid = fas.splice(Math.floor(rand() * Math.min(6, fas.length)), 1)[0];
    const bidders = [...rosterIds].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 3));
    if (budget) {
      const hot = rand();
      const top = Math.max(1, Math.round(budget * (hot < 0.15 ? 0.18 + rand() * 0.25 : hot < 0.5 ? 0.05 + rand() * 0.1 : rand() * 0.05)));
      bidders.forEach((rid, j) => out.push({
        transaction_id: `t${txSeq++}`, type: "waiver", status: j === 0 ? "complete" : "failed", leg: week, created: 1_700_000_000_000 + week * 6e8 + j,
        roster_ids: [rid], adds: { [pid]: rid }, drops: null, draft_picks: [], settings: { waiver_bid: j === 0 ? top : Math.max(0, Math.round(top * (0.4 + rand() * 0.55))) },
      }));
    } else out.push({ transaction_id: `t${txSeq++}`, type: "waiver", status: "complete", leg: week, created: 1_700_000_000_000 + week * 6e8, roster_ids: [bidders[0]], adds: { [pid]: bidders[0] }, drops: null, draft_picks: [], settings: { seq: 0 } });
  }
  if (rand() < 0.6 && fas.length) { const rid = rosterIds[Math.floor(rand() * rosterIds.length)]; const pid = fas.pop()!; out.push({ transaction_id: `t${txSeq++}`, type: "free_agent", status: "complete", leg: week, created: 1_700_000_000_000 + week * 6e8 + 9, roster_ids: [rid], adds: { [pid]: rid }, drops: null, draft_picks: [], settings: null }); }
  return out;
}
const trade = (week: number, a: number, b: number, aGets: string[], bGets: string[], picks: Tx[] = [], season = 2026): Tx => ({
  transaction_id: `t${txSeq++}`, type: "trade", status: "complete", leg: week, created: Date.UTC(season, 8, 1) + week * 7 * 86_400_000, roster_ids: [a, b],
  adds: Object.fromEntries([...aGets.map((p) => [p, a]), ...bGets.map((p) => [p, b])]), drops: Object.fromEntries([...aGets.map((p) => [p, b]), ...bGets.map((p) => [p, a])]), draft_picks: picks, settings: null,
});

function makeLeague(opts: { id: string; name: string; type: number; teams: number; positions: string[]; scoring: Record<string, number>; playoffStart: number; playoffTeams: number; faab?: number; history?: boolean }) {
  const { id, teams: T } = opts;
  const elig = new Set(opts.positions.flatMap((s) => ({ QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"], FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"], IDP_FLEX: ["DL", "LB", "DB"] } as Record<string, string[]>)[s] ?? []));
  const pool = Object.values(players).filter((p) => elig.has(p.position as string)).sort((a, b) => (seasonPpr.get(b.player_id as string) ?? 0) - (seasonPpr.get(a.player_id as string) ?? 0));
  const rosterSize = opts.positions.length;
  const rosters: { roster_id: number; owner_id: string; players: string[] }[] = Array.from({ length: T }, (_, i) => ({ roster_id: i + 1, owner_id: userIds[i], players: [] }));
  // snake draft with positional caps
  const caps = (pos: string) => (pos === "K" || pos === "DEF" ? 2 : pos === "QB" ? 4 : 8);
  let pi = 0;
  const draftPicks: { player_id: string; round: number; pick_no: number; roster_id: number; picked_by: string; is_keeper: boolean }[] = [];
  for (let round = 0; round < rosterSize; round++) {
    const order = round % 2 ? [...rosters].reverse() : rosters;
    for (const r of order) {
      while (pi < pool.length) {
        const p = pool[pi++];
        const pos = p.position as string;
        if (r.players.filter((x) => players[x].position === pos).length >= caps(pos)) { pool.push(p); continue; }
        r.players.push(p.player_id as string);
        draftPicks.push({ player_id: p.player_id as string, round: round + 1, pick_no: draftPicks.length + 1, roster_id: r.roster_id, picked_by: r.owner_id, is_keeper: round < 2 && rand() < 0.3 });
        break;
      }
    }
  }
  // Mid-season waiver pickups: a couple of undrafted players per roster
  if (opts.type === 1) {
    const used = new Set(rosters.flatMap((r) => r.players));
    const fas = pool.filter((p) => !used.has(p.player_id as string) && !["DEF", "K"].includes(p.position as string)).slice(0, rosters.length * 2);
    rosters.forEach((r, i) => {
      const benchIdx = r.players.map((pid, j) => [pid, j] as const).filter(([pid]) => !["DEF", "K"].includes(players[pid].position as string)).slice(-2).map(([, j]) => j);
      benchIdx.forEach((j, k) => (r.players[j] = fas[2 * i + k].player_id as string));
    });
  }
  write(`/draft/${id}-d/picks`, draftPicks.map((d) => ({ ...d, draft_slot: ((d.round % 2 ? d.pick_no - 1 : T * d.round - d.pick_no) % T) + 1 })));
  const order = Object.fromEntries(rosters.map((r) => [r.owner_id, r.roster_id]));
  write(`/league/${id}/drafts`, [{ draft_id: `${id}-d`, season: "2026", status: "complete", type: "snake", draft_order: order, slot_to_roster_id: Object.fromEntries(rosters.map((r) => [String(r.roster_id), r.roster_id])), settings: { rounds: rosterSize, teams: T } }]);
  const prevId = opts.history ? `${id}-2025` : null;
  const league = {
    league_id: id, name: opts.name, season: "2026", status: "in_season", total_rosters: T, roster_positions: opts.positions,
    scoring_settings: opts.scoring, previous_league_id: prevId, draft_id: `${id}-d`,
    settings: { type: opts.type, playoff_week_start: opts.playoffStart, playoff_teams: opts.playoffTeams, draft_rounds: opts.type === 2 ? 4 : rosterSize, num_teams: T, max_keepers: opts.type === 1 ? 3 : 0, ...(opts.faab ? { waiver_type: 2, waiver_budget: opts.faab, waiver_bid_min: 0 } : {}) },
  };
  write(`/league/${id}`, league);
  write(`/league/${id}/users`, rosters.map((r, i) => ({ user_id: r.owner_id, display_name: i === 0 ? "L1am" : `manager${i + 1}`, metadata: { team_name: names[i] } })));
  const starterSlots = opts.positions.filter((s) => s !== "BN");
  const pos = (pid: string) => [primaryPosition(players[pid] as { position: string })];
  const rec: Record<number, { w: number; l: number; pf: number; pa: number }> = {};
  rosters.forEach((r) => (rec[r.roster_id] = { w: 0, l: 0, pf: 0, pa: 0 }));
  for (let week = 1; week <= opts.playoffStart - 1; week++) {
    // round robin pairing
    const ids = rosters.map((r) => r.roster_id);
    const rot = [ids[0], ...ids.slice(1).slice(-(week - 1) % (T - 1)), ...ids.slice(1).slice(0, (T - 1) - ((week - 1) % (T - 1)))].slice(0, T);
    const pairs: [number, number][] = [];
    for (let i = 0; i < T / 2; i++) pairs.push([rot[i], rot[T - 1 - i]]);
    const ms = rosters.map((r) => {
      const matchup_id = pairs.findIndex((p) => p.includes(r.roster_id)) + 1;
      const played = week < CURRENT_WEEK;
      const pp: Record<string, number> = {};
      if (played) for (const pid of r.players) {
        const p = players[pid];
        if (p.position === "DEF") { pp[pid] = Math.round((4 + rand() * 12) * 10) / 10; continue; }
        const s = weekStats.get(`${pid}:${week}`);
        pp[pid] = s ? scoreStatLine(s, opts.scoring, p.position as string) : 0;
      }
      const avg = (pid: string) => (seasonPpr.get(pid) ?? 0) / Math.max(3, gp.get(pid) ?? 10);
      // Punt Gods (last team) starts a weak lineup in recent weeks
      const tank = r.roster_id === T && week >= CURRENT_WEEK - 4;
      const avail = played ? r.players.filter((pid) => players[pid].position === "DEF" || (pp[pid] ?? 0) !== 0) : r.players;
      const lu = optimizeLineup(opts.positions, avail.map((pid) => ({ id: pid, positions: pos(pid), points: tank ? -avg(pid) : avg(pid) })));
      const starters = lu.map((s) => s.playerId ?? "0");
      const points = played ? Math.round(starters.reduce((a, pid) => a + (pp[pid] ?? 0), 0) * 100) / 100 : 0;
      return { roster_id: r.roster_id, matchup_id, starters, players: r.players, points, players_points: played ? pp : {}, starters_points: [] };
    });
    if (week < CURRENT_WEEK) for (const [a, b] of pairs) {
      const ma = ms.find((m) => m.roster_id === a)!, mb = ms.find((m) => m.roster_id === b)!;
      rec[a].pf += ma.points; rec[b].pf += mb.points; rec[a].pa += mb.points; rec[b].pa += ma.points;
      if (ma.points >= mb.points) { rec[a].w++; rec[b].l++; } else { rec[b].w++; rec[a].l++; }
    }
    write(`/league/${id}/matchups/${week}`, ms);
  }
  const spent: Record<number, number> = {};
  write(`/league/${id}/rosters`, rosters.map((r) => ({
    roster_id: r.roster_id, owner_id: r.owner_id, players: r.players, starters: [], reserve: [], taxi: [],
    settings: { waiver_budget_used: opts.faab ? (spent[r.roster_id] = Math.round(opts.faab * (0.15 + rand() * 0.6))) : 0, wins: rec[r.roster_id].w, losses: rec[r.roster_id].l, ties: 0, fpts: Math.floor(rec[r.roster_id].pf), fpts_decimal: Math.round((rec[r.roster_id].pf % 1) * 100), fpts_against: Math.floor(rec[r.roster_id].pa), fpts_against_decimal: Math.round((rec[r.roster_id].pa % 1) * 100) },
  })));
  write(`/league/${id}/traded_picks`, opts.type === 2 ? [{ season: "2027", round: 1, roster_id: T, owner_id: T - 3, previous_owner_id: T }, { season: "2027", round: 2, roster_id: 1, owner_id: 4, previous_owner_id: 1 }] : []);
  const rids = rosters.map((r) => r.roster_id);
  const rostered = new Set(rosters.flatMap((r) => r.players));
  const fas = pool.filter((p) => !rostered.has(p.player_id as string) && !["K", "DEF"].includes(p.position as string)).slice(0, 80).map((p) => p.player_id as string);
  const hotFas = [...fas]; // trending = the best free agents (the claims below don't change the static rosters)
  for (let w = 1; w <= CURRENT_WEEK; w++) {
    const tx = opts.history ? claims(rids, fas, w, opts.faab ?? null) : [];
    if (opts.history && w === 6) {
      const mine = rosters[0].players.filter((p) => !["K", "DEF"].includes(players[p].position as string));
      const partner = opts.type === 2 ? 4 : 3;
      const theirs = rosters[partner - 1].players.filter((p) => !["K", "DEF"].includes(players[p].position as string));
      tx.push(trade(w, 1, partner, [mine[3]], [theirs[2], theirs[8]], opts.type === 2 ? [{ season: "2027", round: 2, roster_id: 1, previous_owner_id: 1, owner_id: partner }] : []));
    }
    if (opts.history && w === 9) tx.push(trade(w, 2, 5, [rosters[1].players[4]], [rosters[4].players[5]]));
    write(`/league/${id}/transactions/${w}`, tx);
  }
  if (opts.history) {
    write(`/players/nfl/trending/add`, hotFas.slice(0, 25).map((pid, i) => ({ player_id: pid, count: Math.round(40000 / (i + 1)) })));
    // ---- last season: same managers, a draft with misses, FAAB claims and a couple of trades ----
    const pT = 17;
    const prevRosters = rosters.map((r) => ({ ...r, players: [] as string[] }));
    const prevPool = [...pool].filter((p) => !["K", "DEF"].includes(p.position as string) || opts.positions.includes(p.position as string));
    const prevPicks: Record<string, unknown>[] = [];
    let ppi = 0;
    for (let round = 0; round < Math.min(rosterSize, 14); round++) {
      const ord = round % 2 ? [...prevRosters].reverse() : prevRosters;
      for (const r of ord) {
        const j = Math.min(prevPool.length - 1, ppi + Math.floor(rand() * 6));
        const p = prevPool.splice(j, 1)[0];
        r.players.push(p.player_id as string);
        prevPicks.push({ player_id: p.player_id, round: round + 1, pick_no: prevPicks.length + 1, roster_id: r.roster_id, picked_by: r.owner_id, is_keeper: false, draft_slot: ((round % 2 ? T - 1 - ord.indexOf(r) : ord.indexOf(r)) % T) + 1 });
        ppi = Math.max(0, ppi);
      }
    }
    write(`/league/${prevId}`, { ...league, league_id: prevId, season: "2025", status: "complete", previous_league_id: null, draft_id: `${prevId}-d` });
    write(`/league/${prevId}/users`, rosters.map((r, i) => ({ user_id: r.owner_id, display_name: i === 0 ? "L1am" : `manager${i + 1}`, metadata: { team_name: names[i] } })));
    write(`/league/${prevId}/rosters`, prevRosters.map((r) => ({ roster_id: r.roster_id, owner_id: r.owner_id, players: r.players, starters: [], reserve: [], taxi: [], settings: { wins: 7, losses: 7, ties: 0, fpts: 1500, fpts_against: 1500, waiver_budget_used: opts.faab ? Math.round(opts.faab * (0.5 + rand() * 0.5)) : 0 } })));
    write(`/league/${prevId}/drafts`, [{ draft_id: `${prevId}-d`, season: "2025", status: "complete", type: "snake", draft_order: order, slot_to_roster_id: Object.fromEntries(rosters.map((r) => [String(r.roster_id), r.roster_id])), settings: { rounds: Math.min(rosterSize, 14), teams: T } }]);
    write(`/draft/${prevId}-d/picks`, prevPicks);
    write(`/league/${prevId}/winners_bracket`, [{ r: 1, m: 1, t1: 3, t2: 6, w: 6, l: 3 }, { r: 3, m: 7, t1: 1, t2: 6, w: 1, l: 6, p: 1 }, { r: 3, m: 8, t1: 3, t2: 5, w: 3, l: 5, p: 3 }]);
    const prevRostered = new Set(prevRosters.flatMap((r) => r.players));
    const prevFas = prevPool.filter((p) => !prevRostered.has(p.player_id as string) && !["K", "DEF"].includes(p.position as string)).slice(0, 120).map((p) => p.player_id as string);
    for (let w = 1; w <= pT + 1; w++) {
      const tx = w <= pT ? claims(rids, prevFas, w, opts.faab ?? null) : [];
      // Trades move players for the rest of the season, so hindsight grades see who started where.
      const swap = (a: number, b: number, aGets: string[], bGets: string[]) => {
        const ra = prevRosters[a - 1], rb = prevRosters[b - 1];
        ra.players = [...ra.players.filter((p) => !bGets.includes(p)), ...aGets];
        rb.players = [...rb.players.filter((p) => !aGets.includes(p)), ...bGets];
        tx.push(trade(w, a, b, aGets, bGets, [], 2025));
      };
      if (w === 5) swap(1, 6, [prevRosters[5].players[1]], [prevRosters[0].players[2]]);
      if (w === 8) swap(3, 7, [prevRosters[6].players[3], prevRosters[6].players[9]], [prevRosters[2].players[1]]);
      write(`/league/${prevId}/transactions/${w}`, tx);
      // weekly scores: each rostered player scores around his per-game rate
      if (w <= pT) write(`/league/${prevId}/matchups/${w}`, prevRosters.map((r, i) => {
        const pp: Record<string, number> = {};
        for (const pid of r.players) pp[pid] = Math.round(((seasonPpr.get(pid) ?? 0) / Math.max(3, gp.get(pid) ?? 10)) * (0.3 + rand() * 1.4) * 10) / 10;
        const starters = [...r.players].sort((a, b) => pp[b] - pp[a]).slice(0, starterSlots.length);
        return { roster_id: r.roster_id, matchup_id: Math.floor(i / 2) + 1, starters, players: r.players, points: starters.reduce((a, p) => a + pp[p], 0), players_points: pp };
      }));
    }
  }
  return { id };
}

// Dynasty market values for the "values history" data job (sleeper_id, 1QB, superflex), by last season's points.
{
  const ranked = Object.values(players).filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position as string)).sort((a, b) => (seasonPpr.get(b.player_id as string) ?? 0) - (seasonPpr.get(a.player_id as string) ?? 0)).slice(0, 300);
  const rows = ranked.map((p, i) => { const v = Math.round(10000 * Math.exp(-i / 60)); return `${p.player_id},${v},${Math.round(p.position === "QB" ? v * 1.3 : v * 0.9)}`; });
  fs.writeFileSync(path.join(NV, "values-history-fixture.csv"), ["sleeper_id,value_1qb,value_2qb", ...rows].join("\n"));
}

const leagues = [
  makeLeague({ id: "fx1", name: "Fixture Superflex Dynasty", type: 2, teams: 10, positions: ["QB", "RB", "RB", "WR", "WR", "FLEX", "FLEX", "FLEX", "FLEX", "SUPER_FLEX", ...Array(13).fill("BN")], scoring: { ...SCORING_PPR, rec: 0.5 }, playoffStart: 15, playoffTeams: 6, history: true }),
  makeLeague({ id: "fx2", name: "Fixture IDP 6-team", type: 2, teams: 6, positions: ["QB", "QB", "RB", "RB", "WR", "WR", "TE", "TE", "FLEX", "FLEX", "SUPER_FLEX", "SUPER_FLEX", "K", "K", "IDP_FLEX", "IDP_FLEX", ...Array(14).fill("BN")], scoring: SCORING_PPR, playoffStart: 16, playoffTeams: 4 }),
  makeLeague({ id: "fx4", name: "Fixture Keeper", type: 1, teams: 10, positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "DEF", ...Array(7).fill("BN")], scoring: { ...SCORING_PPR, rec: 0 }, playoffStart: 15, playoffTeams: 6 }),
  makeLeague({ id: "fx3", name: "Fixture Redraft", type: 0, teams: 12, positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", ...Array(5).fill("BN")], scoring: { ...SCORING_PPR, rec: 0.5 }, playoffStart: 15, playoffTeams: 6, faab: 100, history: true }),
];
const leagueObjs = leagues.map((l) => JSON.parse(fs.readFileSync(path.join(OUT, `league__${l.id}.json`), "utf8")));
write(`/user/${userIds[0]}/leagues/nfl/2026`, leagueObjs);
// Last season's stat totals (Sleeper /stats endpoint shape): this season's real lines with noise, for draft grades.
const totals: Record<string, Record<string, number>> = {};
for (const [k, s] of weekStats) {
  const pid = k.split(":")[0];
  const t = (totals[pid] ??= { gp: 0 });
  t.gp++; t.pass_yd = (t.pass_yd ?? 0) + s.passYd; t.pass_td = (t.pass_td ?? 0) + s.passTd; t.pass_int = (t.pass_int ?? 0) + s.int;
  t.rush_yd = (t.rush_yd ?? 0) + s.rushYd; t.rush_td = (t.rush_td ?? 0) + s.rushTd; t.rec = (t.rec ?? 0) + s.rec; t.rec_yd = (t.rec_yd ?? 0) + s.recYd; t.rec_td = (t.rec_td ?? 0) + s.recTd; t.fum_lost = (t.fum_lost ?? 0) + s.fumLost;
}
for (const t of Object.values(totals)) { const f = 0.5 + rand(); for (const k of Object.keys(t)) if (k !== "gp") t[k] = Math.round(t[k] * f * 1.4); t.gp = Math.min(17, Math.round(t.gp * 1.4)); }
write(`/stats/nfl/regular/2025`, totals);
console.log("fixtures:", fs.readdirSync(OUT).length, "files;", Object.keys(players).length, "players");
