// Smoke test: visits every page for each of a Sleeper user's leagues at phone size, screenshots it, and logs
// console errors, failed requests and load time. Read-only: it only loads pages. Run by .github/workflows/smoke.yml.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:8080/fantasy-HQ";
const USER = process.env.SMOKE_USER ?? "L1am";
const UID = process.env.SMOKE_UID ?? "389682598735060992";
const SEASON = process.env.SMOKE_SEASON ?? "2026";
const OUT = process.env.SMOKE_OUT ?? "smoke-out";
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });

const leagues = await (await fetch(`https://api.sleeper.app/v1/user/${UID}/leagues/nfl/${SEASON}`)).json();
const kind = (l) => (l.settings?.type === 2 ? "dynasty" : l.settings?.type === 1 ? "keeper" : "redraft");

const jobs = [{ name: "home", url: "/" }, { name: "rookies", url: "/rookies/" }];
for (const l of leagues) {
  const id = l.league_id, k = kind(l), tag = `${k}-${id.slice(-4)}`;
  const add = (name, url, extra) => jobs.push({ name: `${tag}__${name}`, url, league: l.name, kind: k, ...extra });
  add("matchup", `/matchup/?league=${id}`);
  add("matchup-overview", `/matchup/?league=${id}&view=overview`);
  add("league", `/league/?league=${id}`);
  add("rankings-week", `/rankings/?league=${id}`);
  add("rankings-ros", `/rankings/?league=${id}&scope=ros`);
  if (k !== "redraft") add("rankings-dynasty", `/rankings/?league=${id}&scope=dynasty`);
  add("waivers", `/waivers/?league=${id}`);
  add("trade", `/trade/?league=${id}`);
  add("trade-finder", `/trade-finder/?league=${id}`);
  for (const t of ["Trades", "Drafts", "Managers", "FAAB"]) add(`history-${t.toLowerCase()}`, `/history/?league=${id}`, { click: t });
  if (k === "keeper") add("keepers", `/keepers/?league=${id}`);
  if (k !== "redraft") add("rookies", `/rookies/?league=${id}`);
  add("stats", `/stats/?league=${id}`);
  add("brief", `/brief/?league=${id}`);
  add("start-sit", `/start-sit/?league=${id}`);
}

const browser = await chromium.launch();
const results = [];
async function run(job) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([u, id]) => {
    try { if (!localStorage.getItem("fhq-settings")) localStorage.setItem("fhq-settings", JSON.stringify({ username: u, userId: id })); } catch {}
  }, [USER, UID]);
  const page = await ctx.newPage();
  const errors = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 400)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 400)}`));
  page.on("requestfailed", (r) => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 200)}`));
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 200)}`); });
  const t0 = Date.now();
  let status = "ok";
  try {
    await page.goto(BASE + job.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (job.click) {
      await page.waitForSelector('[aria-busy="true"]', { state: "detached", timeout: 120000 }).catch(() => {});
      const b = page.locator('[role="group"][aria-label="History section"] button', { hasText: job.click });
      await b.first().waitFor({ timeout: 90000 });
      if (!(await b.count())) { status = "tab-missing"; }
      else await b.first().click();
    }
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .sk'), null, { timeout: 120000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
  } catch (e) { status = `timeout/error: ${String(e.message).split("\n")[0]}`; }
  const ms = Date.now() - t0;
  const text = await page.evaluate(() => document.body.innerText).catch(() => "");
  const flags = [];
  for (const re of [/\bNaN\b/, /\bundefined\b/, /\bnull\b/, /Infinity/, /Couldn.t load/i, /Something went wrong/i, /Application error/i]) if (re.test(text)) flags.push(String(re));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
  if (overflow) flags.push("horizontal-overflow");
  await page.screenshot({ path: path.join(OUT, "shots", `${job.name}.png`), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(OUT, "shots", `${job.name}.txt`), text);
  results.push({ ...job, status, ms, errors: [...new Set(errors)], failed: [...new Set(failed)], flags });
  console.log(`${status === "ok" ? "✓" : "✗"} ${job.name} ${ms}ms ${flags.join(",")} errs=${errors.length} failed=${failed.length}`);
  await ctx.close();
}
const queue = [...jobs];
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await run(queue.shift()); }));
await browser.close();
results.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ leagues: leagues.map((l) => ({ id: l.league_id, name: l.name, kind: kind(l), scoring: l.scoring_settings, roster: l.roster_positions })), results }, null, 1));
const md = ["| page | status | ms | flags | console errors | failed requests |", "|---|---|---|---|---|---|",
  ...results.map((r) => `| ${r.name} | ${r.status} | ${r.ms} | ${r.flags.join(" ")} | ${r.errors.length} | ${r.failed.length} |`)];
fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n") + "\n");
