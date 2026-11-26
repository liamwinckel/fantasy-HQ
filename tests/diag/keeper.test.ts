/** Live diagnostic (GitHub Action): dynasty values on real leagues — zeros and the mid-tier curve. */
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { setTransport } from "@/lib/net";
import { resetSettingsForTests } from "@/lib/settings";

const DATA = path.join(__dirname, "..", "..", "public", "data");
it("dynasty value diag", async () => {
  resetSettingsForTests({ username: "L1am", userId: "389682598735060992" });
  setTransport(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes("/data/")) return fs.readFileSync(path.join(DATA, u.pathname.split("/data/")[1]), "utf8");
    const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text();
  });
  const out: string[] = [];
  const leagues = await (await fetch("https://api.sleeper.app/v1/user/389682598735060992/leagues/nfl/2026")).json() as { league_id: string; name: string }[];
  const { getLeagueContext } = await import("@/lib/services/league");
  const { consensus } = await import("@/lib/nflverse");
  const cons = (await consensus()).data.players;
  for (const lg of leagues) {
    const ctx = await getLeagueContext(lg.league_id, { userId: "389682598735060992" });
    if (ctx.valuationMode !== "dynasty") continue;
    const rostered = ctx.teams.flatMap((t) => t.players);
    const rows = rostered.map((id) => ({ id, p: ctx.players.get(id), v: ctx.values.get(id), c: cons[id] })).filter((r) => r.p && ["QB", "RB", "WR", "TE"].includes(r.p.pos));
    rows.sort((a, b) => (b.v?.dynasty ?? 0) - (a.v?.dynasty ?? 0));
    out.push(`== ${lg.name} sf=${ctx.superflex} rostered=${rows.length}`);
    rows.forEach((r, i) => { if (i < 3 || i % 25 === 0 || (r.v?.dynasty ?? 0) < 2) out.push(`#${i + 1} ${r.p!.name.padEnd(22)} ${r.p!.pos} age${r.p!.age?.toFixed(0)} dyn${r.v?.dynasty} model${r.v?.dynastyModel} mkt${ctx.superflex ? r.c?.v2 : r.c?.v1} base${ctx.projections.get(r.id)?.base.toFixed(1)}`); });
  }
  fs.writeFileSync("diag-out.txt", out.join("\n"));
}, 600000);
