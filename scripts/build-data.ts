/**
 * Data job: downloads NFLverse CSVs and Sleeper's player list, trims them, and writes compact JSON
 * to public/data so the web app can load them (browsers can't read GitHub release files directly).
 *
 *   npx tsx scripts/build-data.ts                 # live sources
 *   npx tsx scripts/build-data.ts --fixtures DIR  # offline, from test fixtures
 *
 * Runs in GitHub Actions on a schedule (see .github/workflows/deploy.yml).
 */
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { parseNgs, parsePfrAdv, parseXfp } from "../src/lib/nflverse/signals";
import { kalshiProb, normName, parseKalshiLabel, parsePolyQuestion, statFromText, type MarketLine, type MarketPlayer } from "../src/lib/markets";
import { parseCombine, parseCsv, parseContracts, parseInjuries, parsePlayers, parseSchedule, parseSnaps, parseWeekly } from "../src/lib/nflverse/parse";

const OUT = path.join(process.cwd(), "public", "data");
const fxIdx = process.argv.indexOf("--fixtures");
const FX = fxIdx > 0 ? process.argv[fxIdx + 1] : null;
const REL = "https://github.com/nflverse/nflverse-data/releases/download";

async function text(url: string, fixture: string): Promise<string> {
  if (FX) return fs.readFileSync(path.join(FX, fixture), "utf8");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}
async function gz(url: string, fixture: string): Promise<string> {
  const buf = FX ? fs.readFileSync(path.join(FX, fixture)) : Buffer.from(await (await fetch(url, { redirect: "follow" })).arrayBuffer());
  return gunzipSync(buf).toString("utf8");
}

/** Rows → { cols, rows } with zero/null trimmed numbers kept short. */
function columns<T extends object>(items: T[]) {
  const cols = items.length ? Object.keys(items[0]) : [];
  const rows = items.map((it) => cols.map((c) => {
    const v = (it as Record<string, unknown>)[c];
    return typeof v === "number" ? Math.round(v * 1000) / 1000 : v ?? null;
  }));
  return JSON.stringify({ cols, rows });
}

function write(file: string, body: string) {
  fs.writeFileSync(path.join(OUT, file), body);
  console.log(`${file.padEnd(24)} ${(body.length / 1024).toFixed(0)} KB`);
}

async function season(): Promise<number> {
  if (FX) return 2026;
  try {
    const st = await (await fetch("https://api.sleeper.app/v1/state/nfl")).json();
    return Number(st.season);
  } catch {
    const d = new Date();
    return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear();
  }
}

// Fields the app reads from Sleeper's player list.
const KEEP = ["player_id", "first_name", "last_name", "full_name", "position", "fantasy_positions", "team", "age", "birth_date", "years_exp",
  "number", "status", "injury_status", "injury_body_part", "injury_notes", "gsis_id", "height", "weight", "college", "depth_chart_order", "search_rank", "rookie_year"];
const FANTASY = new Set(["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB", "DE", "DT", "CB", "S", "OLB", "ILB", "MLB", "NT", "FS", "SS", "SAF"]);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const s = await season();
  const seasons = [String(s), String(s - 1)];
  const jobs: [string, () => Promise<void>][] = [];
  const recent = new Set<string>();
  let sleeperAll: Record<string, Record<string, unknown>> = {};
  const opt = async (url: string, fixture: string) => (FX && !fs.existsSync(path.join(FX, fixture)) ? "" : text(url, fixture));
  const optGz = async (url: string, fixture: string) => (FX && !fs.existsSync(path.join(FX, fixture)) ? "" : gz(url, fixture));
  for (const yr of seasons) {
    jobs.push([`stats ${yr}`, async () => {
      const rows = parseWeekly(await text(`${REL}/stats_player/stats_player_week_${yr}.csv`, `stats_${yr}.csv`));
      rows.forEach((r) => recent.add(r.gsis));
      write(`stats-${yr}.json`, columns(rows));
    }]);
    jobs.push([`injuries ${yr}`, async () => write(`injuries-${yr}.json`, columns(parseInjuries(await text(`${REL}/injuries/injuries_${yr}.csv`, `injuries_${yr}.csv`))))]);
  }
  jobs.push([`snaps`, async () => write(`snaps-${s}.json`, columns(parseSnaps(await text(`${REL}/snap_counts/snap_counts_${s}.csv`, `snaps_${s}.csv`))))]);
  let scheduleNow: ReturnType<typeof parseSchedule> = [];
  jobs.push(["schedule", async () => {
    const body = await text("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv", "games.csv");
    scheduleNow = parseSchedule(body, String(s));
    write(`schedule-${s}.json`, JSON.stringify(parseSchedule(body, String(s))));
    write(`schedule-${s - 1}.json`, JSON.stringify(parseSchedule(body, String(s - 1))));
  }]);
  jobs.push(["combine", async () => {
    const players = parsePlayers(await text(`${REL}/players/players.csv`, "players.csv"));
    const pfrToGsis = new Map(players.filter((p) => p.pfr).map((p) => [p.pfr!, p.gsis]));
    const body = FX && !fs.existsSync(path.join(FX, "combine.csv")) ? "pfr_id\n" : await text(`${REL}/combine/combine.csv`, "combine.csv");
    write("combine.json", columns(parseCombine(body, pfrToGsis).filter((c) => (c.draftYear ?? 0) >= s - 15)));
  }]);
  jobs.push(["players", async () => write("players.json", columns(parsePlayers(await text(`${REL}/players/players.csv`, "players.csv")).filter((p) => recent.has(p.gsis) || (p.rookieSeason ?? 0) >= s - 1)))]);
  jobs.push(["contracts", async () => {
    const all = parseContracts(await gz(`${REL}/contracts/historical_contracts.csv.gz`, "contracts.csv.gz"));
    write("contracts.json", columns(all));
  }]);
  jobs.push(["sleeper players", async () => {
    const raw = FX
      ? fs.readFileSync(path.join(FX, "..", "sleeper", "players__nfl.json"), "utf8")
      : await (await fetch("https://api.sleeper.app/v1/players/nfl")).text();
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    sleeperAll = all;
    // Sleeper often has no NFL (GSIS) id for rookies, which hides their stats, draft slot and snaps.
    // Fill it from DynastyProcess' id map, then by name + position (+ team when names collide) from nflverse.
    try {
      const missing = Object.values(all).filter((p) => FANTASY.has(String(p.position ?? "")) && !p.gsis_id);
      if (missing.length) {
        const ids = parseCsv(FX ? (fs.existsSync(path.join(FX, "db_playerids.csv")) ? fs.readFileSync(path.join(FX, "db_playerids.csv"), "utf8") : "sleeper_id,gsis_id\n") : await text("https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv", "db_playerids.csv"));
        const bySleeper = new Map(ids.filter((r) => r.sleeper_id && r.gsis_id && r.gsis_id !== "NA").map((r) => [r.sleeper_id, r.gsis_id]));
        const nfl = parseCsv(await text(`${REL}/players/players.csv`, "players.csv"));
        const byName = new Map<string, { gsis: string; team: string }[]>();
        for (const r of nfl) if (r.gsis_id && r.position) { const k = `${normName(r.display_name || `${r.first_name} ${r.last_name}`)}|${r.position}`; (byName.get(k) ?? byName.set(k, []).get(k)!).push({ gsis: r.gsis_id, team: r.latest_team }); }
        const team = (t: string) => (t === "LA" ? "LAR" : t);
        let filled = 0;
        for (const [id, p] of Object.entries(all)) {
          if (!FANTASY.has(String(p.position ?? "")) || p.gsis_id) continue;
          let g = bySleeper.get(id);
          if (!g) {
            const c = byName.get(`${normName(String(p.full_name ?? `${p.first_name} ${p.last_name}`))}|${p.position}`) ?? [];
            g = c.length === 1 ? c[0].gsis : c.find((x) => p.team && team(x.team) === p.team)?.gsis;
          }
          if (g) { p.gsis_id = g; filled++; }
        }
        console.log(`sleeper players: filled ${filled} of ${missing.length} missing NFL ids`);
      }
    } catch (e) { console.warn("gsis fill failed", (e as Error).message); }
    const out: Record<string, Record<string, unknown>> = {};
    for (const [id, p] of Object.entries(all)) {
      const pos = String(p.position ?? "");
      if (!FANTASY.has(pos)) continue;
      // Drop long-retired / never-active players without a team or recent experience.
      if (!p.team && (p.status !== "Active") && Number(p.years_exp ?? 0) > 1) continue;
      const slim: Record<string, unknown> = {};
      for (const k of KEEP) if (p[k] !== undefined && p[k] !== null) slim[k] = p[k];
      out[id] = slim;
    }
    write("sleeper-players.json", JSON.stringify(out));
  }]);

  // FantasyPros expert consensus rankings + dynasty market values, published openly by DynastyProcess
  // (the same files nflverse's load_ff_rankings() uses). Mapped to Sleeper IDs with their ID crosswalk.
  jobs.push(["consensus", async () => {
    const DP = process.env.DP_DIR;
    const get = async (f: string) => DP ? fs.readFileSync(path.join(DP, f), "utf8") : text(`https://github.com/dynastyprocess/data/raw/master/files/${f}`, f);
    const [ecr, weekly, values, ids] = await Promise.all([get("db_fpecr_latest.csv"), get("fp_latest_weekly.csv"), get("values-players.csv"), get("db_playerids.csv")]);
    const toSleeper = new Map<string, string>();
    for (const r of parseCsv(ids)) if (r.fantasypros_id && r.fantasypros_id !== "NA" && r.sleeper_id && r.sleeper_id !== "NA") toSleeper.set(r.fantasypros_id, r.sleeper_id);
    const teamFix = (t: string) => (t === "JAC" ? "JAX" : t === "LA" ? "LAR" : t);
    const sid = (fpId: string, pos: string, team: string) => (pos === "DST" ? teamFix(team) : toSleeper.get(fpId));
    const out: Record<string, Record<string, number>> = {};
    const put = (id: string | undefined, k: string, v: string) => {
      const n = Number(v);
      if (!id || !Number.isFinite(n) || v === "" || v === "NA") return;
      (out[id] ??= {})[k] = n;
    };
    let ecrDate = "";
    // Dynasty rookie rankings (next rookie class, before and after the NFL draft): for rookie mock drafts.
    const rookies: { n: string; p: string; t: string; e: number; s: string | null }[] = [];
    for (const r of parseCsv(ecr)) {
      ecrDate = r.scrape_date || ecrDate;
      if (r.page_type === "dynasty-rk" && ["QB", "RB", "WR", "TE"].includes(r.pos) && Number(r.ecr)) rookies.push({ n: r.player, p: r.pos, t: r.team || r.tm || "", e: Number(r.ecr), s: toSleeper.get(r.id) ?? null });
      const id = sid(r.id, r.pos, r.team || r.tm);
      const pt = r.page_type;
      if (pt === "redraft-overall") put(id, "ro", r.ecr);
      else if (pt === "dynasty-overall") put(id, "do", r.ecr);
      else if (pt === "dynasty-op") put(id, "dsf", r.ecr);
      else if (pt.startsWith("redraft-") && pt !== "redraft-idp") put(id, "rp", r.ecr);
      else if (pt.startsWith("dynasty-") && !["dynasty-idp", "dynasty-rk"].includes(pt)) put(id, "dp", r.ecr);
      else if (pt === "weekly-op") put(id, "wsf", r.ecr);
    }
    let weeklyDate = "";
    for (const r of parseCsv(weekly)) {
      weeklyDate = r.scrape_date || weeklyDate;
      put(sid(r.fantasypros_id, r.pos, r.team), "w", r.ecr);
      if (r.player_opponent) (out[sid(r.fantasypros_id, r.pos, r.team) ?? "_"] ??= {});
    }
    delete out._;
    for (const r of parseCsv(values)) { const id = toSleeper.get(r.fp_id); put(id, "v1", r.value_1qb); put(id, "v2", r.value_2qb); }
    write("consensus.json", JSON.stringify({ ecrDate, weeklyDate, source: "FantasyPros ECR via DynastyProcess", players: out, rookies: rookies.sort((a, b) => a.e - b.e) }));
  }]);

  // Weekly expert rankings as they stood before each week's Sunday games, rebuilt from the public git history of
  // DynastyProcess's fp_latest_weekly.csv. This is what lets SHS AI be graded against past weeks (backtest).
  jobs.push(["ecr history", async () => {
    if (FX) { write(`ecr-weekly-${s}.json`, JSON.stringify({ weeks: {} })); return; }
    const CACHE = path.join(process.cwd(), ".cache", "ecr");
    fs.mkdirSync(CACHE, { recursive: true });
    const gh = { accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
    const commits: { sha: string; at: number }[] = [];
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(`https://api.github.com/repos/dynastyprocess/data/commits?path=files/fp_latest_weekly.csv&since=${s}-08-15T00:00:00Z&per_page=100&page=${page}`, { headers: gh });
      if (!r.ok) throw new Error(`GitHub commits ${r.status}`);
      const list = (await r.json()) as { sha: string; commit: { committer: { date: string } } }[];
      for (const c of list) commits.push({ sha: c.sha, at: Date.parse(c.commit.committer.date) });
      if (list.length < 100) break;
    }
    commits.sort((a, b) => a.at - b.at);
    const ids = parseCsv(await text("https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv", "db_playerids.csv"));
    const toSleeper = new Map<string, string>();
    for (const r of ids) if (r.fantasypros_id && r.fantasypros_id !== "NA" && r.sleeper_id && r.sleeper_id !== "NA") toSleeper.set(r.fantasypros_id, r.sleeper_id);
    const teamFix = (t: string) => (t === "JAC" ? "JAX" : t === "LA" ? "LAR" : t);
    // Eastern kickoff "YYYY-MM-DD HH:MM" → epoch (DST approximated by month).
    const et = (k: string) => { const m = Number(k.slice(5, 7)); return Date.parse(`${k.replace(" ", "T").slice(0, 16)}:00${m >= 4 && m <= 10 ? "-04:00" : "-05:00"}`); };
    const weeks: Record<number, { at: string; sha: string; rows: [string, number, number | null][] }> = {};
    const maxWeek = Math.max(0, ...scheduleNow.map((g) => g.week));
    for (let w = 1; w <= maxWeek; w++) {
      const games = scheduleNow.filter((g) => g.week === w && g.kickoff);
      if (!games.length) continue;
      // Cut-off: the first Sunday kickoff of the week (or the first game if none on Sunday).
      const times = games.map((g) => et(g.kickoff!)).filter(Number.isFinite).sort((a, b) => a - b);
      const sunday = games.filter((g) => new Date(et(g.kickoff!)).getUTCDay() === 0).map((g) => et(g.kickoff!)).sort((a, b) => a - b)[0];
      const cut = sunday ?? times[0];
      if (!cut || cut > Date.now()) continue;
      const pick = [...commits].reverse().find((c) => c.at < cut && c.at > cut - 7 * 86_400_000);
      if (!pick) continue;
      const file = path.join(CACHE, `${pick.sha}.csv`);
      let body = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (!body) {
        const r = await fetch(`https://raw.githubusercontent.com/dynastyprocess/data/${pick.sha}/files/fp_latest_weekly.csv`);
        if (!r.ok) continue;
        body = await r.text();
        fs.writeFileSync(file, body);
      }
      const rows: [string, number, number | null][] = [];
      for (const r of parseCsv(body)) {
        if (!["QB", "RB", "WR", "TE", "K", "DST"].includes(r.page_pos)) continue;
        const id = r.page_pos === "DST" ? teamFix(r.team) : toSleeper.get(r.fantasypros_id);
        const ecr = Number(r.ecr);
        if (!id || !Number.isFinite(ecr)) continue;
        const proj = Number(r.r2p_pts);
        rows.push([id, ecr, Number.isFinite(proj) && r.r2p_pts !== "NA" ? proj : null]);
      }
      if (rows.length) weeks[w] = { at: new Date(pick.at).toISOString(), sha: pick.sha.slice(0, 10), rows };
    }
    console.log(`ecr history: weeks ${Object.keys(weeks).join(",")}`);
    write(`ecr-weekly-${s}.json`, JSON.stringify({ season: s, source: "FantasyPros weekly ECR (PPR position pages) via DynastyProcess git history", weeks }));
  }]);

  // ---- SHS AI signals ----
  jobs.push(["xfp", async () => {
    const body = await opt(`https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_${s}.csv`, `ep_weekly_${s}.csv`);
    write(`xfp-${s}.json`, columns(body ? parseXfp(body, s) : []));
  }]);
  jobs.push(["next gen stats", async () => {
    const [rec, rush, pass] = await Promise.all(["receiving", "rushing", "passing"].map((t) => optGz(`${REL}/nextgen_stats/ngs_${t}.csv.gz`, `ngs_${t}.csv.gz`)));
    write(`ngs-${s}.json`, columns(parseNgs(rec, rush, pass, s)));
  }]);
  jobs.push(["pfr advanced", async () => {
    const players = parsePlayers(await text(`${REL}/players/players.csv`, "players.csv"));
    const pfrToGsis = new Map(players.filter((p) => p.pfr).map((p) => [p.pfr!, p.gsis]));
    const [rec, rush, pass] = await Promise.all(["rec", "rush", "pass"].map((t) => opt(`${REL}/pfr_advstats/advstats_week_${t}_${s}.csv`, `advstats_week_${t}_${s}.csv`)));
    write(`pfr-${s}.json`, columns(parsePfrAdv(rec, rush, pass, pfrToGsis, s)));
  }]);
  // News feed: what changed for fantasy-relevant players since the last refresh (injury designations, IR, team
  // changes, signings/releases, depth-chart starters), plus who's being added most on Sleeper. Built from the
  // Sleeper player database we already download; previous state is kept on the history branch.
  jobs.push(["news", async () => {
    const OFF = new Set(["QB", "RB", "WR", "TE", "K"]);
    const dir = path.join(process.cwd(), "history", "news");
    fs.mkdirSync(dir, { recursive: true });
    const stateF = path.join(dir, "state.json"), feedF = path.join(dir, "feed.json");
    const prev: Record<string, [string | null, string | null, string | null, number | null]> = fs.existsSync(stateF) ? JSON.parse(fs.readFileSync(stateF, "utf8")) : {};
    let feed: { at: string; id: string; kind: string; text: string; pos: string; team: string | null }[] = fs.existsSync(feedF) ? JSON.parse(fs.readFileSync(feedF, "utf8")) : [];
    const now = new Date().toISOString();
    const state: typeof prev = {};
    const first = !Object.keys(prev).length;
    for (const [id, p] of Object.entries(sleeperAll)) {
      const pos = String(p.position ?? "");
      if (!OFF.has(pos)) continue;
      const rank = Number(p.search_rank ?? 9999);
      const team = (p.team as string) || null, inj = (p.injury_status as string) || null, st = (p.status as string) || null, dc = (p.depth_chart_order as number) ?? null;
      if (!team && !prev[id]) continue;
      state[id] = [team, inj, st, dc];
      const o = prev[id];
      if (first || !o || rank > 400) continue;
      const name = String(p.full_name ?? `${p.first_name} ${p.last_name}`);
      const part = p.injury_body_part ? ` (${p.injury_body_part})` : "";
      const add = (kind: string, text: string) => feed.push({ at: now, id, kind, text, pos, team });
      if (o[0] !== team) add("team", !team ? `${name} released by ${o[0]}` : !o[0] ? `${name} signs with ${team}` : `${name} moves from ${o[0]} to ${team}`);
      if (st !== o[2] && st === "Injured Reserve") add("ir", `${name} placed on injured reserve${part}`);
      else if (o[2] === "Injured Reserve" && st === "Active") add("return", `${name} activated from injured reserve`);
      if (inj !== o[1] && st !== "Injured Reserve") {
        if (inj && !o[1]) add("injury", `${name} listed ${inj}${part}`);
        else if (inj && o[1]) add("injury", `${name} now ${inj} (was ${o[1]})${part}`);
        else if (!inj && o[1]) add("healthy", `${name} no longer on the injury report`);
      }
      if (team && o[0] === team && dc !== o[3] && (dc === 1 || o[3] === 1) && pos !== "K") add("depth", dc === 1 ? `${name} moves to the top of the ${team} depth chart` : `${name} no longer listed as the ${team} starter`);
    }
    // Sleeper trending adds (last 24h)
    try {
      const tr = await (await fetch("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=15")).json() as { player_id: string; count: number }[];
      feed = feed.filter((x) => x.kind !== "trending");
      for (const t of tr) { const p = sleeperAll[t.player_id]; if (p && OFF.has(String(p.position))) feed.push({ at: now, id: t.player_id, kind: "trending", text: `${p.full_name} added in ${t.count.toLocaleString()} Sleeper leagues in the last day`, pos: String(p.position), team: (p.team as string) || null }); }
    } catch { /* optional */ }
    const cut = Date.now() - 10 * 864e5;
    feed = feed.filter((x) => Date.parse(x.at) >= cut).slice(-800);
    fs.writeFileSync(stateF, JSON.stringify(state));
    fs.writeFileSync(feedF, JSON.stringify(feed));
    write("news.json", JSON.stringify({ builtAt: now, items: [...feed].reverse() }));
    console.log(`news: ${feed.length} items`);
  }]);
  // Prediction-market player lines (public, no key): Kalshi and Polymarket. Open markets only = this week's games.
  jobs.push(["markets", async () => {
    const OFF = new Set(["QB", "RB", "WR", "TE"]);
    const byName = new Map<string, { id: string; team: string | null }[]>();
    for (const [id, p] of Object.entries(sleeperAll)) {
      if (!OFF.has(String(p.position)) || !p.team) continue;
      const k = normName(String(p.full_name ?? `${p.first_name} ${p.last_name}`));
      (byName.get(k) ?? byName.set(k, []).get(k)!).push({ id, team: String(p.team) });
    }
    const resolve = (name: string, hint: string) => {
      const c = byName.get(normName(name)) ?? [];
      if (c.length <= 1) return c[0];
      return c.find((x) => x.team && hint.toUpperCase().includes(x.team)) ?? null;
    };
    const players: Record<string, MarketPlayer> = {};
    const counts: Record<string, number> = { kalshi: 0, polymarket: 0, unmatched: 0 };
    const put = (src: string, name: string, hint: string, l: MarketLine) => {
      if (!(l.p >= 0 && l.p <= 1) || !Number.isFinite(l.line)) return;
      const hit = resolve(name, hint);
      if (!hit) { counts.unmatched++; return; }
      const pl = (players[hit.id] ??= { name, team: hit.team, lines: [], src: [] });
      // Same stat & line from two venues: average them.
      const same = pl.lines.find((x) => x.stat === l.stat && x.line === l.line);
      if (same) same.p = Math.round(((same.p + l.p) / 2) * 1000) / 1000; else pl.lines.push({ ...l, p: Math.round(l.p * 1000) / 1000 });
      if (!pl.src.includes(src)) pl.src.push(src);
      counts[src]++;
    };
    const getJson = async (url: string) => { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
    if (!FX) {
      // Kalshi: discover NFL per-game player-prop series, then read their open markets.
      const K = "https://api.elections.kalshi.com/trade-api/v2";
      try {
        const known = ["KXNFLRECYDS", "KXNFLRSHYDS", "KXNFLRUSHYDS", "KXNFLPASSYDS", "KXNFLANYTD", "KXNFLREC", "KXNFLRRYDS", "KXNFLPASSTDS", "KXNFLRECS"];
        const series = new Map<string, string>();
        try {
          const ss = await getJson(`${K}/series?category=Sports`);
          for (const x of ss.series ?? []) if (String(x.ticker).startsWith("KXNFL") && statFromText(String(x.title ?? ""))) series.set(x.ticker, x.title);
        } catch (e) { console.warn(`kalshi series list: ${(e as Error).message}`); }
        for (const t of known) if (!series.has(t)) series.set(t, "");
        for (const [ticker, title] of series) {
          let cursor = "";
          for (let page = 0; page < 10; page++) {
            let res;
            try { res = await getJson(`${K}/markets?series_ticker=${ticker}&status=open&limit=1000${cursor ? `&cursor=${cursor}` : ""}`); } catch { break; }
            for (const m of res.markets ?? []) {
              const label = String(m.yes_sub_title || m.subtitle || m.title || "");
              const stat = statFromText(title) ?? statFromText(String(m.title ?? "")) ?? statFromText(String(m.rules_primary ?? ""));
              const pl = parseKalshiLabel(label) ?? parseKalshiLabel(String(m.title ?? ""));
              const p = kalshiProb(m);
              if (stat && pl && p !== null) put("kalshi", pl.name, String(m.event_ticker ?? ""), { stat, line: pl.line, p });
            }
            cursor = res.cursor || "";
            if (!cursor) break;
          }
        }
      } catch (e) { console.warn(`kalshi: ${(e as Error).message}`); }
      // Polymarket: NFL events with player-prop markets.
      try {
        for (let off = 0; off < 2000; off += 500) {
          const evs = await getJson(`https://gamma-api.polymarket.com/events?tag_slug=nfl&closed=false&active=true&limit=500&offset=${off}`);
          if (!Array.isArray(evs) || !evs.length) break;
          for (const ev of evs) for (const m of ev.markets ?? []) {
            if (m.closed) continue;
            const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as unknown[];
            try {
              const outs = parse(m.outcomes).map(String), prices = parse(m.outcomePrices).map(Number);
              const r = parsePolyQuestion(String(m.question ?? ""), outs, prices);
              if (r) put("polymarket", r.name, `${ev.title ?? ""} ${ev.slug ?? ""}`, { stat: r.stat, line: r.line, p: r.p });
            } catch { /* malformed market */ }
          }
          if (evs.length < 500) break;
        }
      } catch (e) { console.warn(`polymarket: ${(e as Error).message}`); }
    }
    console.log(`markets: ${Object.keys(players).length} players · kalshi ${counts.kalshi} · polymarket ${counts.polymarket} · unmatched ${counts.unmatched}`);
    write("markets.json", JSON.stringify({ builtAt: new Date().toISOString(), counts, players }));

    // Archive: keep each player's last lines before his game kicks off, one file per week (history branch),
    // so betting lines can be graded against what happened.
    const HIST = path.join(process.cwd(), "history", "markets");
    fs.mkdirSync(HIST, { recursive: true });
    const et = (k: string) => { const m = Number(k.slice(5, 7)); return Date.parse(`${k.replace(" ", "T").slice(0, 16)}:00${m >= 4 && m <= 10 ? "-04:00" : "-05:00"}`); };
    const now = Date.now();
    const weekOf = [...new Set(scheduleNow.map((g) => g.week))].sort((a, b) => a - b)
      .find((w) => scheduleNow.filter((g) => g.week === w && g.kickoff).some((g) => et(g.kickoff!) + 4 * 3600e3 > now));
    if (weekOf && !FX) {
      const kick = new Map<string, number>();
      for (const g of scheduleNow) if (g.week === weekOf && g.kickoff) { kick.set(g.home, et(g.kickoff)); kick.set(g.away, et(g.kickoff)); }
      const file = path.join(HIST, `${s}-w${String(weekOf).padStart(2, "0")}.json`);
      const prev = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as { players: Record<string, MarketPlayer & { at: string }> }) : { players: {} };
      let updated = 0;
      for (const [id, pl] of Object.entries(players)) {
        const k = pl.team ? kick.get(pl.team) : undefined;
        if (k === undefined || k <= now) continue; // game started (or no game): keep the pre-kickoff snapshot
        prev.players[id] = { ...pl, at: new Date(now).toISOString() };
        updated++;
      }
      fs.writeFileSync(file, JSON.stringify({ season: s, week: weekOf, players: prev.players }));
      console.log(`market history: week ${weekOf}, ${updated} players updated, ${Object.keys(prev.players).length} saved`);
    }
    // Everything saved this season, for grading in the app.
    const weeks: Record<string, unknown> = {};
    if (fs.existsSync(HIST)) for (const f of fs.readdirSync(HIST)) {
      const m = f.match(/^(\d{4})-w(\d{2})\.json$/);
      if (m && Number(m[1]) === s) weeks[String(Number(m[2]))] = JSON.parse(fs.readFileSync(path.join(HIST, f), "utf8")).players;
    }
    write(`markets-history-${s}.json`, JSON.stringify({ season: s, weeks }));
  }]);

  const failed: string[] = [];
  for (const [name, job] of jobs) {
    try { await job(); } catch (e) { failed.push(name); console.error(`✗ ${name}: ${(e as Error).message}`); }
  }
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ builtAt: new Date().toISOString(), season: s, failed }));
  // Keep going if a non-essential file failed; the app degrades gracefully. Fail the build only if nothing worked.
  if (failed.length === jobs.length) process.exit(1);
}

main();
