/**
 * SHS AI research: replay every regular-season week from 2021 to now, exactly as the app would have seen it
 * before kickoff, and learn which SHS factors actually predict fantasy points beyond the expert consensus.
 *
 *   npx tsx scripts/research/shs-history.ts            (GitHub Action: Sleeper projections + GitHub API)
 *   DP_GIT=/path/to/dynastyprocess-data-clone npx tsx scripts/research/shs-history.ts   (local)
 *
 * For each week:  expert ranks (FantasyPros weekly ECR, PPR, last snapshot before Sunday's first kickoff)
 *                 projection (Sleeper's weekly projection, or FantasyPros' when Sleeper isn't reachable)
 *                 every SHS factor computed only from data before that week
 *                 actual PPR points scored.
 * Then: grade experts / projection / SHS AI, and fit factor weights + expert share with leave-one-season-out
 * cross-validation (fit on the other seasons, score on the held-out one), so the reported gain is out of sample.
 * Writes src/lib/services/shsResearch.json (used as SHS AI's defaults) and docs/shs-research.md.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { parseCsv, parseInjuries, parsePlayers, parseSchedule, parseSnaps, parseWeekly } from "../../src/lib/nflverse/parse";
import { parseNgs, parsePfrAdv, parseXfp } from "../../src/lib/nflverse/signals";
import { scoreSleeperStats, scoreStatLine } from "../../src/lib/engine/scoring";
import { opportunityOf, project, priorFor, type GameLog, type PlayerLite } from "../../src/lib/engine/projections";
import { buildSignals } from "../../src/lib/services/signals";
import { rankings } from "../../src/lib/services/rankings";
import { shsAi } from "../../src/lib/services/shsai";
import type { LeagueContext } from "../../src/lib/services/league";
import type { Game, WeekStat } from "../../src/lib/nflverse/types";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache", "research");
fs.mkdirSync(CACHE, { recursive: true });
const REL = "https://github.com/nflverse/nflverse-data/releases/download";
const NOW = new Date();
const SEASONS = (process.env.SEASONS ?? "2021,2022,2023,2024,2025,2026").split(",").map(Number);
const POS = ["QB", "RB", "WR", "TE"] as const;
const CUT: Record<string, number> = { QB: 24, RB: 40, WR: 50, TE: 20 };
// Standard Sleeper PPR scoring.
const PPR: Record<string, number> = {
  pass_yd: 0.04, pass_td: 4, pass_int: -1, pass_2pt: 2, rush_yd: 0.1, rush_td: 6, rush_2pt: 2, rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2, fum_lost: -2,
};

async function fetchText(url: string, file: string, gz = false): Promise<string> {
  const f = path.join(CACHE, file);
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const body = gz ? gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8") : await r.text();
  fs.writeFileSync(f, body);
  return body;
}
const tryText = (url: string, file: string, gz = false) => fetchText(url, file, gz).catch(() => "");

// ---------- expert-rank history (DynastyProcess git history of fp_latest_weekly.csv) ----------
type Snap = { at: number; sha: string };
async function ecrCommits(): Promise<Snap[]> {
  const f = path.join(CACHE, "ecr-commits.json");
  if (process.env.DP_GIT) {
    const out = execFileSync("git", ["-C", process.env.DP_GIT, "log", "--format=%H %ct", "origin/master", "--", "files/fp_latest_weekly.csv"], { maxBuffer: 1 << 26 }).toString();
    return out.trim().split("\n").map((l) => { const [sha, t] = l.split(" "); return { sha, at: Number(t) * 1000 }; });
  }
  if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 6 * 3600e3) return JSON.parse(fs.readFileSync(f, "utf8"));
  const gh = { accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const out: Snap[] = [];
  for (let page = 1; page <= 30; page++) {
    const r = await fetch(`https://api.github.com/repos/dynastyprocess/data/commits?path=files/fp_latest_weekly.csv&since=2021-08-01T00:00:00Z&per_page=100&page=${page}`, { headers: gh });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const list = (await r.json()) as { sha: string; commit: { committer: { date: string } } }[];
    for (const c of list) out.push({ sha: c.sha, at: Date.parse(c.commit.committer.date) });
    if (list.length < 100) break;
  }
  fs.writeFileSync(f, JSON.stringify(out));
  return out;
}
async function ecrFile(sha: string): Promise<string> {
  const f = path.join(CACHE, `ecr-${sha}.csv`);
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  const body = process.env.DP_GIT
    ? execFileSync("git", ["-C", process.env.DP_GIT, "show", `${sha}:files/fp_latest_weekly.csv`], { maxBuffer: 1 << 26 }).toString()
    : await (await fetch(`https://raw.githubusercontent.com/dynastyprocess/data/${sha}/files/fp_latest_weekly.csv`)).text();
  fs.writeFileSync(f, body);
  return body;
}

// ---------- Sleeper projections (Action) ----------
let sleeperOk: boolean | null = null;
async function sleeperProj(season: number, week: number): Promise<Map<string, Record<string, number>> | null> {
  const f = path.join(CACHE, `sleeper-proj-${season}-${week}.json`);
  if (fs.existsSync(f)) return new Map(Object.entries(JSON.parse(fs.readFileSync(f, "utf8"))));
  if (sleeperOk === false) return null;
  try {
    const qs = POS.map((p) => `position[]=${p}`).join("&");
    const r = await fetch(`https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&${qs}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(String(r.status));
    const list = (await r.json()) as { player_id: string; stats: Record<string, number> }[];
    const m: Record<string, Record<string, number>> = {};
    for (const x of list) if (x.stats) m[x.player_id] = x.stats;
    fs.writeFileSync(f, JSON.stringify(m));
    sleeperOk = true;
    return new Map(Object.entries(m));
  } catch { sleeperOk = false; return null; }
}

const etMs = (k: string) => { const m = Number(k.slice(5, 7)); return Date.parse(`${k.replace(" ", "T").slice(0, 16)}:00${m >= 4 && m <= 10 ? "-04:00" : "-05:00"}`); };

export interface Row { season: number; week: number; id: string; pos: string; ecrPos: number; ecrPts: number; proj: number; fpProj: number | null; actual: number; f: Record<string, [number, number]> }

async function main() {
  const [playersCsv, idsCsv, gamesCsv] = await Promise.all([
    fetchText(`${REL}/players/players.csv`, "players.csv"),
    fetchText("https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv", "db_playerids.csv").catch(() => process.env.DP_GIT ? execFileSync("git", ["-C", process.env.DP_GIT, "show", "origin/master:files/db_playerids.csv"], { maxBuffer: 1 << 26 }).toString() : ""),
    fetchText("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv", "games.csv"),
  ]);
  const ngsFiles = await Promise.all(["receiving", "rushing", "passing"].map((t) => tryText(`${REL}/nextgen_stats/ngs_${t}.csv.gz`, `ngs_${t}.csv`, true)));
  const info = parsePlayers(playersCsv);
  const infoBy = new Map(info.map((p) => [p.gsis, p]));
  const pfrToGsis = new Map(info.filter((p) => p.pfr).map((p) => [p.pfr!, p.gsis]));
  const fpToGsis = new Map<string, string>(), sleeperToGsis = new Map<string, string>(), names = new Map<string, string>();
  for (const r of parseCsv(idsCsv)) {
    if (!r.gsis_id || r.gsis_id === "NA") continue;
    if (r.fantasypros_id && r.fantasypros_id !== "NA") fpToGsis.set(r.fantasypros_id, r.gsis_id);
    if (r.sleeper_id && r.sleeper_id !== "NA") sleeperToGsis.set(r.sleeper_id, r.gsis_id);
    names.set(r.gsis_id, r.name);
  }
  const commits = (await ecrCommits()).sort((a, b) => a.at - b.at);
  const rows: Row[] = [];
  let projSource = "sleeper";

  for (const season of SEASONS) {
    const [statsCsv, prevCsv, snapsCsv, injCsv, xfpCsv, rec, rush, pass] = await Promise.all([
      tryText(`${REL}/stats_player/stats_player_week_${season}.csv`, `stats_${season}.csv`),
      tryText(`${REL}/stats_player/stats_player_week_${season - 1}.csv`, `stats_${season - 1}.csv`),
      tryText(`${REL}/snap_counts/snap_counts_${season}.csv`, `snaps_${season}.csv`),
      tryText(`${REL}/injuries/injuries_${season}.csv`, `injuries_${season}.csv`),
      tryText(`https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_${season}.csv`, `ep_${season}.csv`),
      ...["rec", "rush", "pass"].map((t) => tryText(`${REL}/pfr_advstats/advstats_week_${t}_${season}.csv`, `pfr_${t}_${season}.csv`)),
    ]);
    if (!statsCsv) { console.log(`${season}: no stats, skipped`); continue; }
    const stats = parseWeekly(statsCsv).filter((s) => POS.includes(s.position as typeof POS[number]));
    const prev = prevCsv ? parseWeekly(prevCsv) : [];
    const snaps = parseSnaps(snapsCsv);
    const injuries = injCsv ? parseInjuries(injCsv) : [];
    const games: Game[] = parseSchedule(gamesCsv, String(season));
    const raw = { xfp: xfpCsv ? parseXfp(xfpCsv, season) : [], ngs: parseNgs(ngsFiles[0], ngsFiles[1], ngsFiles[2], season), pfr: parsePfrAdv(rec, rush, pass, pfrToGsis, season), injuries };
    const snapBy = new Map<string, Map<number, number>>();
    for (const s of snaps) { const g = pfrToGsis.get(s.pfr); if (g) (snapBy.get(g) ?? snapBy.set(g, new Map()).get(g)!).set(s.week, s.pct); }
    const posOf = new Map(stats.map((x) => [x.gsis, x.position]));
    const byPlayer = new Map<string, WeekStat[]>();
    for (const s of stats) (byPlayer.get(s.gsis) ?? byPlayer.set(s.gsis, []).get(s.gsis)!).push(s);
    const prevPpg = new Map<string, { g: number; ppg: number }>();
    for (const s of prev) { if (!POS.includes(s.position as typeof POS[number])) continue; const c = prevPpg.get(s.gsis) ?? { g: 0, ppg: 0 }; const p = scoreStatLine(s, PPR, s.position); prevPpg.set(s.gsis, { g: c.g + 1, ppg: (c.ppg * c.g + p) / (c.g + 1) }); }
    const opponents = new Map<string, Map<number, string>>();
    for (const g of games) { (opponents.get(g.home) ?? opponents.set(g.home, new Map()).get(g.home)!).set(g.week, g.away); (opponents.get(g.away) ?? opponents.set(g.away, new Map()).get(g.away)!).set(g.week, g.home); }
    const lastWeek = Math.max(...games.map((g) => g.week));

    for (let w = 2; w <= lastWeek; w++) {
      const wg = games.filter((g) => g.week === w && g.kickoff);
      if (!wg.length) continue;
      const times = wg.map((g) => etMs(g.kickoff!)).sort((a, b) => a - b);
      const sunday = wg.filter((g) => new Date(etMs(g.kickoff!) - 5 * 3600e3).getUTCDay() === 0).map((g) => etMs(g.kickoff!)).sort((a, b) => a - b)[0];
      const cut = sunday ?? times[0];
      if (cut > NOW.getTime()) break;
      const snap = [...commits].reverse().find((c) => c.at < cut && c.at > cut - 6 * 86400e3);
      if (!snap) continue;
      // Expert ranks + FantasyPros projection for this week
      const ecr = new Map<string, { ecr: number; team: string; pos: string; fp: number | null }>();
      for (const r of parseCsv(await ecrFile(snap.sha))) {
        if (!POS.includes(r.page_pos as typeof POS[number])) continue;
        const g = fpToGsis.get(r.fantasypros_id);
        const e = Number(r.ecr);
        if (!g || !Number.isFinite(e)) continue;
        const fp = Number(r.r2p_pts);
        ecr.set(g, { ecr: e, team: r.team === "JAC" ? "JAX" : r.team, pos: r.page_pos, fp: Number.isFinite(fp) && r.r2p_pts !== "NA" ? fp : null });
      }
      // Projection: Sleeper's when reachable, otherwise FantasyPros'
      const sp = await sleeperProj(season, w);
      if (!sp) projSource = "fantasypros";
      const projPts = new Map<string, number>();
      if (sp) for (const [sid, st] of sp) { const g = sleeperToGsis.get(sid); const pos = g ? ecr.get(g)?.pos ?? posOf.get(g) ?? null : null; if (g && pos) projPts.set(g, scoreSleeperStats(st, PPR, pos)); }
      else for (const [g, e] of ecr) if (e.fp !== null) projPts.set(g, e.fp);

      // Players this week: anyone ranked or with a projection; team = latest known team before this week
      const ids = new Set([...ecr.keys(), ...projPts.keys()]);
      const players = new Map<string, PlayerLite>();
      const status = new Map<string, string>();
      for (const r of injuries) if (r.week === w && r.status) status.set(r.gsis, r.status);
      for (const g of ids) {
        const hist = (byPlayer.get(g) ?? []).filter((s) => s.week < w).sort((a, b) => a.week - b.week);
        const pos = ecr.get(g)?.pos ?? hist.at(-1)?.position;
        if (!pos || !POS.includes(pos as typeof POS[number])) continue;
        const pi = infoBy.get(g);
        const age = pi?.birthDate ? (Date.UTC(season, 8, 1) - Date.parse(pi.birthDate)) / (365.25 * 86400e3) : null;
        players.set(g, {
          id: g, gsis: g, name: names.get(g) ?? g, pos, positions: [pos], team: ecr.get(g)?.team ?? hist.at(-1)?.team ?? null,
          age, yearsExp: pi?.rookieSeason ? season - pi.rookieSeason : null, injury: status.get(g) ?? null, injuryPart: null, draftRound: pi?.draftRound ?? null,
        });
      }
      const logs = new Map<string, GameLog[]>();
      for (const p of players.values()) {
        logs.set(p.id, (byPlayer.get(p.id) ?? []).filter((s) => s.week < w).sort((a, b) => a.week - b.week)
          .map((s) => ({ week: s.week, pts: scoreStatLine(s, PPR, p.pos), source: "nflverse" as const, opportunity: opportunityOf(p.pos, s), snapPct: snapBy.get(p.id)?.get(s.week) ?? null })));
      }
      const projections = new Map<string, ReturnType<typeof project>>();
      for (const p of players.values()) {
        const pv = prevPpg.get(p.id);
        const prior = pv && pv.g >= 6 ? pv.ppg : priorFor(6, p.yearsExp, p.draftRound);
        const pr = project({ player: p, log: logs.get(p.id)!, prior, currentWeek: w, lastWeek, opponents, defense: new Map() });
        const pts = projPts.get(p.id) ?? 0;
        projections.set(p.id, { ...pr, median: pts, byWeek: { [w]: pts } });
      }
      const consensus: LeagueContext["consensus"] = {};
      for (const [g, e] of ecr) if (players.has(g)) consensus[g] = { w: e.ecr };
      const ctx = {
        league: { league_id: "research", season: String(season), scoring_settings: PPR, roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"] },
        currentWeek: w, lastWeek, seasonOver: false, myRosterId: null, teams: [], teamsCount: 12,
        players, logs, projections, consensus, values: new Map(), extras: new Map(), combine: new Map(), prevCoach: new Map(),
        projStats: new Map([[w, new Map()]]), stats: stats.filter((s) => s.week < w), games, nflOpponents: opponents,
        signals: buildSignals(raw, w, null), valuationMode: "redraft",
      } as unknown as LeagueContext;
      const rk = rankings(ctx, "week");
      const ai = shsAi(ctx, rk, "week", null, { neutral: true });
      const curve = new Map<string, number[]>();
      for (const r of rk) (curve.get(r.pos) ?? curve.set(r.pos, []).get(r.pos)!).push(r.pts);
      for (const a of curve.values()) a.sort((x, y) => y - x);
      const atRank = (pos: string, k: number) => { const c = curve.get(pos) ?? []; return c[Math.min(k, c.length) - 1] ?? 0; };
      let n = 0;
      for (const r of rk) {
        if (r.ecrPos === null || !CUT[r.pos] || r.ecrPos > CUT[r.pos] * 1.5) continue;
        const st = (byPlayer.get(r.id) ?? []).find((s) => s.week === w);
        if (!st) continue;
        const a = ai.get(r.id);
        rows.push({
          season, week: w, id: r.id, pos: r.pos, ecrPos: r.ecrPos, ecrPts: Math.round(atRank(r.pos, r.ecrPos) * 10) / 10, proj: r.pts, fpProj: ecr.get(r.id)?.fp ?? null,
          actual: Math.round(scoreStatLine(st, PPR, r.pos) * 10) / 10,
          f: Object.fromEntries((a?.factors ?? []).map((x) => [x.key, [Math.round(x.value * 1000) / 1000, x.weight]])),
        });
        n++;
      }
      process.stdout.write(`${season} wk${w}: ${n} players\n`);
    }
  }
  fs.writeFileSync(path.join(CACHE, "dataset.json"), JSON.stringify({ projSource, rows }));
  const { analyse } = await import("./analyse");
  analyse(rows, projSource);
}


main().catch((e) => { console.error(e); process.exit(1); });
