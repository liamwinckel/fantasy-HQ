/** Live diagnostic (GitHub Action): SHS AI QB ranks in L1am's leagues. */
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { setTransport } from "@/lib/net";
import { resetSettingsForTests } from "@/lib/settings";

const DATA = path.join(__dirname, "..", "..", "public", "data");
it("shs qb diag", async () => {
  resetSettingsForTests({ username: "L1am", userId: "389682598735060992" });
  setTransport(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes("/data/")) return fs.readFileSync(path.join(DATA, u.pathname.split("/data/")[1]), "utf8");
    const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text();
  });
  const out: string[] = [];
  const leagues = await (await fetch("https://api.sleeper.app/v1/user/389682598735060992/leagues/nfl/2026")).json() as { league_id: string; name: string }[];
  const { getLeagueContext } = await import("@/lib/services/league");
  const { rankings } = await import("@/lib/services/rankings");
  const { shsAi } = await import("@/lib/services/shsai");
  for (const lg of leagues.slice(0, 2)) {
    const ctx = await getLeagueContext(lg.league_id, { userId: "389682598735060992" });
    for (const scope of ["week", "ros"] as const) {
      const rows = rankings(ctx, scope);
      const ai = shsAi(ctx, rows, scope, null);
      out.push(`== ${lg.name} ${scope} week ${ctx.currentWeek}`);
      for (const r of rows.filter((x) => x.pos === "QB").sort((a, b) => (a.ecrPos ?? 99) - (b.ecrPos ?? 99)).slice(0, 26)) {
        const a = ai.get(r.id)!;
        out.push(`${r.name} ecr${r.ecrPos} shs${a.rank} pts${r.pts.toFixed(1)} rating${a.rating.toFixed(1)} pct${a.pct} mkt${a.market ? a.market.pts + "/" + a.market.covered.join("+") : "-"} parts ${a.parts.map((p) => `${p.key}:${p.effect.toFixed(3)}`).join(",")}`);
      }
    }
  }
  fs.writeFileSync("diag-out.txt", out.join("\n"));
}, 600000);
