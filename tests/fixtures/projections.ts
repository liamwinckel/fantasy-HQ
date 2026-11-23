/**
 * Writes Sleeper-shaped weekly projection fixtures (raw stat lines, like api.sleeper.app/projections)
 * from the last four games of real NFLverse stats. Run after build.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { parseSchedule, parseWeekly } from "../../src/lib/nflverse/parse";
import type { WeekStat } from "../../src/lib/nflverse/types";

const G = path.join(__dirname, "generated");
const players = JSON.parse(fs.readFileSync(path.join(G, "sleeper", "players__nfl.json"), "utf8")) as Record<string, { gsis_id?: string; position: string; team: string; injury_status?: string | null }>;
const stats = parseWeekly(fs.readFileSync(path.join(G, "nflverse", "stats_2026.csv"), "utf8"));
const games = parseSchedule(fs.readFileSync(path.join(G, "nflverse", "games.csv"), "utf8"), "2026");
const byGsis = new Map<string, WeekStat[]>();
for (const s of stats) (byGsis.get(s.gsis) ?? byGsis.set(s.gsis, []).get(s.gsis)!).push(s);

const KEYS: [keyof WeekStat, string][] = [
  ["passYd", "pass_yd"], ["passTd", "pass_td"], ["int", "pass_int"], ["att", "pass_att"], ["cmp", "pass_cmp"], ["pass2pt", "pass_2pt"], ["sacks", "pass_sack"],
  ["car", "rush_att"], ["rushYd", "rush_yd"], ["rushTd", "rush_td"], ["rush2pt", "rush_2pt"], ["rushFd", "rush_fd"],
  ["tgt", "rec_tgt"], ["rec", "rec"], ["recYd", "rec_yd"], ["recTd", "rec_td"], ["rec2pt", "rec_2pt"], ["recFd", "rec_fd"], ["fumLost", "fum_lost"],
  ["fgm0_19", "fgm_0_19"], ["fgm20_29", "fgm_20_29"], ["fgm30_39", "fgm_30_39"], ["fgm40_49", "fgm_40_49"], ["fgm50p", "fgm_50p"], ["fgMiss", "fgmiss"], ["xpm", "xpm"], ["xpMiss", "xpmiss"],
  ["tklSolo", "idp_tkl_solo"], ["tklAst", "idp_tkl_ast"], ["tfl", "idp_tkl_loss"], ["sack", "idp_sack"], ["qbHit", "idp_qb_hit"], ["defInt", "idp_int"], ["pd", "idp_pass_def"], ["ff", "idp_ff"], ["fr", "idp_fum_rec"],
];

for (let week = 12; week <= 18; week++) {
  const out: unknown[] = [];
  for (const [id, p] of Object.entries(players)) {
    const opp = (t: string) => games.find((g) => g.week === week && (g.home === t || g.away === t));
    const g = opp(p.team);
    const oppTeam = g ? (g.home === p.team ? g.away : g.home) : null;
    if (p.position === "DEF") {
      if (!g) continue;
      out.push({ player_id: id, team: p.team, opponent: oppTeam, player: { injury_status: null }, stats: { sack: 2.4, int: 0.8, fum_rec: 0.6, def_td: 0.12, safe: 0.03, pts_allow_14_20: 0.35, pts_allow_21_27: 0.35, pts_allow_7_13: 0.15, pts_allow_28_34: 0.15 } });
      continue;
    }
    const logs = (byGsis.get(p.gsis_id ?? "") ?? []).filter((s) => s.week < 12).sort((a, b) => b.week - a.week).slice(0, 4);
    if (!logs.length || !g || p.injury_status === "IR" || p.injury_status === "Out") continue;
    const st: Record<string, number> = {};
    for (const [k, sk] of KEYS) {
      const avg = logs.reduce((a, s) => a + (s[k] as number), 0) / logs.length;
      if (avg) st[sk] = Math.round(avg * 0.95 * 100) / 100;
    }
    const ppr = (st.pass_yd ?? 0) * 0.04 + (st.pass_td ?? 0) * 4 + (st.rush_yd ?? 0) * 0.1 + (st.rush_td ?? 0) * 6 + (st.rec ?? 0) + (st.rec_yd ?? 0) * 0.1 + (st.rec_td ?? 0) * 6;
    out.push({ player_id: id, team: p.team, opponent: oppTeam, player: { injury_status: p.injury_status ?? null }, stats: { ...st, pts_ppr: Math.round(ppr * 100) / 100, adp_dd_ppr: 999 } });
  }
  fs.writeFileSync(path.join(G, "sleeper", `projections__2026__${week}.json`), JSON.stringify(out));
}
console.log("projection fixtures written");
