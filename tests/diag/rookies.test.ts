/** Live diagnostic (GitHub Action): real Sleeper + freshly built site data → rookie QBs in each of L1am's leagues. */
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { setTransport } from "@/lib/net";
import { resetSettingsForTests } from "@/lib/settings";

const DATA = path.join(__dirname, "..", "..", "public", "data");
it("rookie QBs live", async () => {
  resetSettingsForTests({ username: "L1am", userId: "389682598735060992" });
  setTransport(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes("/data/")) return fs.readFileSync(path.join(DATA, u.pathname.split("/data/")[1]), "utf8");
    const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text();
  });
  const out: string[] = [];
  const sp = JSON.parse(fs.readFileSync(path.join(DATA, "sleeper-players.json"), "utf8")) as Record<string, Record<string, unknown>>;
  const rq = Object.values(sp).filter((p) => p.position === "QB" && (p.years_exp === 0));
  out.push(`sleeper-players rookie QBs: ${rq.length} ${rq.slice(0, 12).map((p) => `${p.full_name}/${p.team}/${p.status}/${p.gsis_id}`).join("; ")}`);
  const leagues = await (await fetch("https://api.sleeper.app/v1/user/389682598735060992/leagues/nfl/2026")).json() as { league_id: string; name: string }[];
  const { getLeagueContext } = await import("@/lib/services/league");
  const { rookieReport } = await import("@/lib/services/rookies");
  for (const lg of leagues) {
    try {
      const ctx = await getLeagueContext(lg.league_id, { userId: "389682598735060992" });
      const qbs = [...ctx.players.values()].filter((p) => p.pos === "QB" && (p.yearsExp === 0 || p.rookieSeason === 2026));
      const rep = rookieReport(ctx);
      out.push(`${lg.name}: season ${ctx.league.season} players ${ctx.players.size} rookieQBs-in-ctx ${qbs.length} [${qbs.slice(0, 8).map((p) => `${p.name} ye${p.yearsExp} rs${p.rookieSeason} r${p.draftRound} team${p.team} gsis${p.gsis} logs${ctx.logs.get(p.id)?.length ?? 0}`).join("; ")}] report ${rep.length} QBs-in-report ${rep.filter((r) => r.pos === "QB").length} positions ${[...new Set(rep.map((r) => r.pos))].join(",")}`);
    } catch (e) { out.push(`${lg.name}: ERROR ${(e as Error).message}`); }
  }
  fs.writeFileSync("diag-out.txt", out.join("\n"));
  console.log(out.join("\n"));
}, 600000);
