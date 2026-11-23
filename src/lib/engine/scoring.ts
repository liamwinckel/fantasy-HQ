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
  const rec = st.rec ?? 0;
  if (position === "TE") pts += rec * (sc.bonus_rec_te ?? 0);
  if (position === "RB") pts += rec * (sc.bonus_rec_rb ?? 0);
  if (position === "WR") pts += rec * (sc.bonus_rec_wr ?? 0);
  return Math.round(pts * 100) / 100;
}
