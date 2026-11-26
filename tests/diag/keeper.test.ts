/** Live diagnostic (GitHub Action): keeper-league trade values, broken down. */
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { setTransport } from "@/lib/net";
import { resetSettingsForTests } from "@/lib/settings";

const DATA = path.join(__dirname, "..", "..", "public", "data");
it("keeper value diag", async () => {
  resetSettingsForTests({ username: "L1am", userId: "389682598735060992" });
  setTransport(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes("/data/")) return fs.readFileSync(path.join(DATA, u.pathname.split("/data/")[1]), "utf8");
    const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text();
  });
  const out: string[] = [];
  const leagues = await (await fetch("https://api.sleeper.app/v1/user/389682598735060992/leagues/nfl/2026")).json() as { league_id: string; name: string }[];
  const { getLeagueContext } = await import("@/lib/services/league");
  const { consensus: loadConsensus } = await import("@/lib/nflverse");
  const cons = (await loadConsensus()).data.players;
  for (const lg of leagues) {
    const ctx = await getLeagueContext(lg.league_id, { userId: "389682598735060992" });
    if (ctx.format !== "keeper") continue;
    out.push(`== ${lg.name} (${lg.league_id}) week ${ctx.currentWeek} scoring kr_yd=${ctx.league.scoring_settings.kr_yd} pr_yd=${ctx.league.scoring_settings.pr_yd} draft_rounds=${ctx.league.settings.draft_rounds}`);
    out.push(`repl ${JSON.stringify(ctx.replacement)}`);
    const rows = [...ctx.players.values()].filter((p) => ["WR", "RB"].includes(p.pos) && ctx.values.get(p.id)).map((p) => {
      const v = ctx.values.get(p.id)!, pr = ctx.projections.get(p.id), l = ctx.logs.get(p.id) ?? [];
      const ppg = l.length ? l.reduce((a, g) => a + g.pts, 0) / l.length : 0;
      return { p, v, pr, ppg, n: l.length };
    });
    const posRank = new Map<string, number>();
    for (const pos of ["WR", "RB"]) rows.filter((r) => r.p.pos === pos && r.n >= 4).sort((a, b) => b.ppg - a.ppg).forEach((r, i) => posRank.set(r.p.id, i + 1));
    const pick = rows.filter((r) => /Dike|Stevenson|Puka|Ja'Marr|Jaxon Smith|Nabers|Bijan|Jahmyr|Kyren|Ladd|Wan'Dale|Tetairoa/.test(r.p.name) || (posRank.get(r.p.id) ?? 99) <= 15);
    for (const r of pick.sort((a, b) => b.v.redraft - a.v.redraft)) {
      const c = cons[r.p.id] ?? {};
      out.push(`${r.p.name.padEnd(22)} ${r.p.pos} age${r.p.age?.toFixed(1)} ppg${r.ppg.toFixed(1)} (${r.p.pos}${posRank.get(r.p.id) ?? "-"}, ${r.n}g) base${r.pr?.base.toFixed(1)} ros-model${r.v.redraftModel} ecr-ro${c.ro ?? "-"} final${r.v.redraft} dyn${r.v.dynasty} keepSurplus${ctx.keeperSurplus.get(r.p.id) ?? "-"} cost${JSON.stringify(ctx.keeperCost.get(r.p.id) ?? null)} owner${ctx.teams.find((t) => t.players.includes(r.p.id))?.rosterId ?? "FA"}`);
    }
  }
  fs.writeFileSync("diag-out.txt", out.join("\n"));
}, 600000);
