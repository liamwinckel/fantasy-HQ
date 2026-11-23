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
import { parseContracts, parseInjuries, parsePlayers, parseSchedule, parseSnaps, parseWeekly } from "../src/lib/nflverse/parse";

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
  for (const yr of seasons) {
    jobs.push([`stats ${yr}`, async () => {
      const rows = parseWeekly(await text(`${REL}/stats_player/stats_player_week_${yr}.csv`, `stats_${yr}.csv`));
      rows.forEach((r) => recent.add(r.gsis));
      write(`stats-${yr}.json`, columns(rows));
    }]);
    jobs.push([`injuries ${yr}`, async () => write(`injuries-${yr}.json`, columns(parseInjuries(await text(`${REL}/injuries/injuries_${yr}.csv`, `injuries_${yr}.csv`))))]);
  }
  jobs.push([`snaps`, async () => write(`snaps-${s}.json`, columns(parseSnaps(await text(`${REL}/snap_counts/snap_counts_${s}.csv`, `snaps_${s}.csv`))))]);
  jobs.push(["schedule", async () => {
    const body = await text("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv", "games.csv");
    write(`schedule-${s}.json`, JSON.stringify(parseSchedule(body, String(s))));
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

  const failed: string[] = [];
  for (const [name, job] of jobs) {
    try { await job(); } catch (e) { failed.push(name); console.error(`✗ ${name}: ${(e as Error).message}`); }
  }
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ builtAt: new Date().toISOString(), season: s, failed }));
  // Keep going if a non-essential file failed; the app degrades gracefully. Fail the build only if nothing worked.
  if (failed.length === jobs.length) process.exit(1);
}

main();
