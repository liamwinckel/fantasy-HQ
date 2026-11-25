import type { WeekStat } from "../nflverse";

/**
 * Converts an NFLverse stat line into points using a league's Sleeper scoring settings.
 * Used only for weeks where Sleeper has no league-scored points for the player (e.g. unrostered players).
 * Covers the common offensive, kicking and individual-defense keys; rare bonuses are ignored, so treat as approximate.
 */
export function scoreStatLine(s: WeekStat, sc: Record<string, number>, position: string): number {
  const v = (k: string) => sc[k] ?? 0;
  let pts = 0;
  // passing
  pts += s.passYd * v("pass_yd") + s.passTd * v("pass_td") + s.int * v("pass_int") + s.pass2pt * v("pass_2pt");
  pts += s.cmp * v("pass_cmp") + s.att * v("pass_att") + (s.att - s.cmp) * v("pass_inc") + s.sacks * v("pass_sack");
  if (s.passYd >= 300) pts += v("bonus_pass_yd_300");
  if (s.passYd >= 400) pts += v("bonus_pass_yd_400");
  // rushing
  pts += s.rushYd * v("rush_yd") + s.rushTd * v("rush_td") + s.rush2pt * v("rush_2pt") + s.car * v("rush_att") + s.rushFd * v("rush_fd");
  if (s.rushYd >= 100) pts += v("bonus_rush_yd_100");
  if (s.rushYd >= 200) pts += v("bonus_rush_yd_200");
  // receiving
  pts += s.rec * v("rec") + s.recYd * v("rec_yd") + s.recTd * v("rec_td") + s.rec2pt * v("rec_2pt") + s.recFd * v("rec_fd") + s.tgt * v("rec_tgt");
  if (position === "TE") pts += s.rec * v("bonus_rec_te");
  if (position === "RB") pts += s.rec * v("bonus_rec_rb");
  if (position === "WR") pts += s.rec * v("bonus_rec_wr");
  if (s.recYd >= 100) pts += v("bonus_rec_yd_100");
  if (s.recYd >= 200) pts += v("bonus_rec_yd_200");
  pts += s.fumLost * v("fum_lost");
  // kicking
  pts += s.fgm0_19 * v("fgm_0_19") + s.fgm20_29 * v("fgm_20_29") + s.fgm30_39 * v("fgm_30_39") + s.fgm40_49 * v("fgm_40_49");
  pts += s.fgm50p * (v("fgm_50p") || v("fgm_50_59")) + s.fgMiss * v("fgmiss") + s.xpm * v("xpm") + s.xpMiss * v("xpmiss");
  // individual defense
  pts += s.tklSolo * v("idp_tkl_solo") + s.tklAst * v("idp_tkl_ast") + s.tfl * v("idp_tkl_loss") + s.sack * v("idp_sack");
  pts += s.qbHit * v("idp_qb_hit") + s.defInt * v("idp_int") + s.pd * v("idp_pass_def") + s.ff * v("idp_ff");
  pts += s.fr * v("idp_fum_rec") + s.defTd * v("idp_def_td") + s.safety * v("idp_safe");
  return Math.round(pts * 100) / 100;
}

/** Plain-English scoring label, e.g. "Half PPR · TE +0.5". */
export function scoringLabel(sc: Record<string, number>): string {
  const rec = sc.rec ?? 0;
  const base = rec >= 1 ? "PPR" : rec >= 0.5 ? "Half PPR" : rec > 0 ? `${rec} PPR` : "Standard";
  const parts = [base];
  if (sc.bonus_rec_te) parts.push(`TE +${sc.bonus_rec_te}`);
  if ((sc.pass_td ?? 4) >= 6) parts.push("6pt pass TD");
  if (sc.rush_fd || sc.rec_fd) parts.push("First downs");
  return parts.join(" · ");
}

/**
 * Scores a Sleeper stat line (projections use the same keys as league scoring settings).
 * Position bonuses (e.g. TE premium) are applied on receptions.
 */
export function scoreSleeperStats(st: Record<string, number>, sc: Record<string, number>, position: string): number {
  let pts = 0;
  for (const [k, v] of Object.entries(st)) {
    const w = sc[k];
    if (w) pts += v * w;
  }
  pts += expectedBonuses(st, sc);
  const rec = st.rec ?? 0;
  if (position === "TE") pts += rec * (sc.bonus_rec_te ?? 0);
  if (position === "RB") pts += rec * (sc.bonus_rec_rb ?? 0);
  if (position === "WR") pts += rec * (sc.bonus_rec_wr ?? 0);
  return Math.round(pts * 100) / 100;
}

// Standard normal CDF (Abramowitz–Stegun), for turning a projected mean into the chance of clearing a threshold.
const phi = (z: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};
const pAtLeast = (mean: number, sd: number, t: number) => (mean <= 0 ? 0 : 1 - phi((t - mean) / Math.max(1e-6, sd)));
const pBetween = (mean: number, sd: number, lo: number, hi: number) => phi((hi + 0.5 - mean) / sd) - phi((lo - 0.5 - mean) / sd);

/**
 * League rules a projection's stat line can't score directly: yardage bonuses (e.g. +3 at 100 rushing yards) and
 * team-defence points-allowed / yards-allowed tiers. Projections give averages, so each rule is worth its points
 * times the chance of hitting it. Skipped when the projection already carries the key itself.
 */
export function expectedBonuses(st: Record<string, number>, sc: Record<string, number>): number {
  let pts = 0;
  const thresholds: [string, string | string[], number, number][] = [
    ["bonus_pass_yd_300", "pass_yd", 300, 0.3], ["bonus_pass_yd_400", "pass_yd", 400, 0.3],
    ["bonus_rush_yd_100", "rush_yd", 100, 0.45], ["bonus_rush_yd_200", "rush_yd", 200, 0.45],
    ["bonus_rec_yd_100", "rec_yd", 100, 0.5], ["bonus_rec_yd_200", "rec_yd", 200, 0.5],
    ["bonus_rush_rec_yd_100", ["rush_yd", "rec_yd"], 100, 0.4], ["bonus_rush_rec_yd_200", ["rush_yd", "rec_yd"], 200, 0.4],
    ["bonus_pass_cmp_25", "pass_cmp", 25, 0.25], ["bonus_rush_att_20", "rush_att", 20, 0.3],
  ];
  for (const [key, stat, t, cv] of thresholds) {
    if (!sc[key] || st[key] !== undefined) continue;
    const mean = (Array.isArray(stat) ? stat : [stat]).reduce((a, k) => a + (st[k] ?? 0), 0);
    pts += sc[key] * pAtLeast(mean, Math.max(1, mean * cv), t);
  }
  const tiers = (prefix: string, stat: string, sd: number, bands: [string, number, number][]) => {
    if (st[stat] === undefined || bands.some(([k]) => st[`${prefix}${k}`] !== undefined)) return;
    for (const [k, lo, hi] of bands) if (sc[`${prefix}${k}`]) pts += sc[`${prefix}${k}`] * Math.max(0, pBetween(st[stat], sd, lo, hi));
  };
  tiers("pts_allow_", "pts_allow", 9, [["0", 0, 0], ["1_6", 1, 6], ["7_13", 7, 13], ["14_20", 14, 20], ["21_27", 21, 27], ["28_34", 28, 34], ["35p", 35, 99]]);
  tiers("yds_allow_", "yds_allow", 60, [["0_100", 0, 99], ["100_199", 100, 199], ["200_299", 200, 299], ["300_349", 300, 349], ["350_399", 350, 399], ["400_449", 400, 449], ["450_499", 450, 499], ["500_549", 500, 549], ["550p", 550, 999]]);
  return pts;
}

/** The league's scoring rules that move rankings, in plain words (for the "ranked in your scoring" note). */
export function scoringRules(sc: Record<string, number>): string[] {
  const out: string[] = [scoringLabel(sc).split(" · ")[0]];
  if (sc.bonus_rec_te) out.push(`TE +${sc.bonus_rec_te}/rec`);
  if (sc.bonus_rec_rb) out.push(`RB +${sc.bonus_rec_rb}/rec`);
  if (sc.bonus_rec_wr) out.push(`WR +${sc.bonus_rec_wr}/rec`);
  if ((sc.pass_td ?? 4) !== 4) out.push(`${sc.pass_td}pt pass TD`);
  if (sc.pass_yd && Math.abs(sc.pass_yd - 0.04) > 0.001) out.push(`${Math.round(1 / sc.pass_yd)} pass yds/pt`);
  if (sc.pass_int !== undefined && sc.pass_int <= -2) out.push(`INT ${sc.pass_int}`);
  if (sc.rush_fd || sc.rec_fd) out.push("First downs");
  if (sc.rush_att) out.push(`+${sc.rush_att}/carry`);
  if (sc.kr_yd || sc.pr_yd) out.push("Return yards");
  if (sc.st_td || sc.def_st_td || sc.kr_td || sc.pr_td) out.push("Return TDs");
  if (sc.rec_tgt) out.push("Targets");
  if (Object.keys(sc).some((k) => k.startsWith("bonus_") && !["bonus_rec_te", "bonus_rec_rb", "bonus_rec_wr"].includes(k) && sc[k])) out.push("Yardage bonuses");
  if (Object.keys(sc).some((k) => k.startsWith("idp_") && sc[k])) out.push("IDP");
  return out;
}
