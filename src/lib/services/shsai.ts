/**
 * SHS AI: how much higher (+) or lower (−) a player is worth than his expert rank.
 *
 * Default ("SHS formula", see shsModel.ts): the expert-rank value × (1 + learned effects), where the effects — the
 * pull toward Sleeper's projection and each SHS factor — were fitted on replayed seasons separately for week,
 * rest of season and dynasty, and for each position, and kept only where they beat the experts out of sample.
 * This week, players with betting lines also get a share of the points the lines imply.
 * "Custom" (Settings): your own mix of experts / Sleeper / factors / lines.
 *
 * Each factor scores the player from −1 (points to him doing worse than his expert rank) to +1 (better).
 *   All:     points per game · snap share · advanced metrics · expected points · player tracking · film charting
 *   Weekly:  weather · injuries & practice · defensive matchup · Vegas team total · game script
 *   Rest of season: schedule ahead · injury outlook
 *   Dynasty: age cliff · team situation · coaching · usage · snap share · durability · draft & combine · college
 */
import type { LeagueContext } from "./league";
import type { RankRow, RankScope } from "./rankings";
import type { GameWeather } from "../weather";
import { defenseTable } from "./stats";
import { DEFAULT_SHS, getSettings } from "../settings";
import { getTuning } from "./accuracy";
import { marketPoints } from "../markets";
import { DOMINATOR_AVG, type CollegeProfile } from "../cfbd";
import RESEARCH_JSON from "./shsResearch.json";
import { shsFormula } from "./shsModel";

/** Weekly research summary (scripts/research). */
export const RESEARCH = RESEARCH_JSON as unknown as { summary: Record<string, number>; generatedAt: string; weeks: number; rows: number; seasons: number[]; projSource: string };

export interface Factor { key: string; label: string; value: number; detail: string; weight: number }
export interface ShsAi {
  pct: number | null; rating: number; rank: number; factors: Factor[];
  /** Weekly: points the prediction markets imply in this league's scoring, and which stats they covered. */
  market?: { pts: number; value: number; covered: string[] } | null;
  /** The mix used: shares of expert consensus / second opinion (Sleeper or dynasty model) / betting lines / SHS factors (sums to 1). */
  blend: { expert: number; sleeper: number; market: number; factors: number };
  /** "shs" = research formula; "custom" = your mix. */
  mode: "shs" | "custom";
  /** SHS formula: each part's effect on his value (+0.05 = +5% vs his expert rank). */
  parts: { key: string; effect: number }[];
}
export interface ShsOptions {
  college?: Map<string, CollegeProfile> | null;
  /** Ignore your Settings weights and auto-tuning (backtest records raw factor values and base weights). */
  neutral?: boolean;
}

/** Plain-language list of what SHS AI looks at, by scope (no data sources). */
export const SHS_METRICS: Record<RankScope | "all", string[]> = {
  all: ["Points per game", "Snap share", "Opportunity share (targets, carries, dropbacks)", "Efficiency per opportunity", "Usage trend", "Expected fantasy points from his opportunities, and over/under-performance", "Player-tracking: separation, yards after catch over expected, rush yards over expected, completion % over expected", "Charting: yards after contact, broken tackles, drops, rating when targeted, bad throws, pressure", "Projected points vs a typical player at his rank"],
  week: ["Prediction-market player lines (yards, receptions, touchdowns) turned into fantasy points in your scoring", "Weather at kickoff (wind, rain, snow)", "Injury status and this week's practice participation", "Injuries to his QB or teammates ahead of him", "Defensive matchup", "Team implied points", "Game script (point spread)"],
  ros: ["Strength of schedule ahead and in the fantasy playoffs", "Injury outlook"],
  dynasty: ["Age vs his position's age cliff", "Team offense quality and trend", "Head-coach continuity", "Long-term usage", "Season snap share", "Durability (games played)", "Draft capital and athletic testing (speed score)", "College production share (optional)"],
};

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pctile = (arr: number[], v: number) => (arr.length ? arr.filter((x) => x < v).length / arr.length : 0.5);
const CLIFF: Record<string, number> = { RB: 27, WR: 30, TE: 30, QB: 34 };
const OUT = ["Out", "IR", "PUP", "NFI", "Sus", "Doubtful"];

export function shsAi(ctx: LeagueContext, rows: RankRow[], scope: RankScope, weather: Map<string, GameWeather> | null, opts: ShsOptions = {}): Map<string, ShsAi> {
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const cfg = opts.neutral ? DEFAULT_SHS : { ...DEFAULT_SHS, ...(getSettings().shs ?? {}) };
  const tune = cfg.autoTune && !opts.neutral ? getTuning(ctx.league.league_id) : {};
  const sig = ctx.signals;
  // ---- season inputs ----
  const byGsis = new Map<string, typeof ctx.stats>();
  for (const s of ctx.stats) if (s.week < ctx.currentWeek) (byGsis.get(s.gsis) ?? byGsis.set(s.gsis, []).get(s.gsis)!).push(s);
  const rbTouches = new Map<string, number>();
  for (const s of ctx.stats) if (s.position === "RB") rbTouches.set(`${s.team}:${s.week}`, (rbTouches.get(`${s.team}:${s.week}`) ?? 0) + s.car + s.tgt);
  const feat = new Map<string, { ppg: number; snap: number | null; share: number | null; ppo: number | null; games: number }>();
  for (const r of rows) {
    const p = ctx.players.get(r.id);
    if (!p) continue;
    const log = ctx.logs.get(r.id) ?? [];
    const snaps = log.slice(-3).map((g) => g.snapPct).filter((x): x is number => x !== null);
    const st = p.gsis ? (byGsis.get(p.gsis) ?? []).sort((a, b) => a.week - b.week).slice(-4) : [];
    let share: number | null = null;
    if (st.length) {
      if (p.pos === "WR" || p.pos === "TE") share = mean(st.map((s) => s.tgtShare));
      else if (p.pos === "RB") share = mean(st.map((s) => (s.car + s.tgt) / Math.max(1, rbTouches.get(`${s.team}:${s.week}`) ?? 1)));
      else if (p.pos === "QB") share = mean(st.map((s) => s.att + s.car)) / 45;
    }
    const opp = log.map((g) => g.opportunity ?? 0).reduce((a, b) => a + b, 0);
    feat.set(r.id, {
      ppg: log.length ? mean(log.map((g) => g.pts)) : 0, snap: snaps.length ? mean(snaps) : null, share,
      ppo: opp > 0 ? log.reduce((a, g) => a + g.pts, 0) / opp : null, games: log.length,
    });
  }
  const byPos = new Map<string, RankRow[]>();
  for (const r of rows) (byPos.get(r.pos) ?? byPos.set(r.pos, []).get(r.pos)!).push(r);
  const posVals = (pos: string, f: (x: NonNullable<ReturnType<typeof feat.get>>) => number | null) =>
    (byPos.get(pos) ?? []).map((r) => feat.get(r.id)).filter((x) => x && x.games >= 3).map((x) => f(x!)).filter((x): x is number => x !== null);
  const peers = (r: RankRow) => (byPos.get(r.pos) ?? []).filter((x) => x.id !== r.id && x.ecrPos !== null && Math.abs(x.ecrPos - (r.ecrPos ?? 999)) <= 3);
  const curve = new Map<string, number[]>();
  for (const [pos, arr] of byPos) curve.set(pos, [...arr].map((r) => r.pts).sort((a, b) => b - a));
  const atRank = (pos: string, k: number) => curve.get(pos)?.[Math.min(k, curve.get(pos)!.length) - 1] ?? 0;

  // ---- weekly inputs ----
  const def = scope === "week" ? new Map(defenseTable(ctx).map((d) => [d.team, d])) : null;
  const wkGames = ctx.games.filter((g) => g.week === w0);
  const implied = new Map<string, number>();
  for (const g of wkGames) if (g.total && g.spread !== null && g.spread !== undefined) {
    implied.set(g.home, (g.total + g.spread) / 2);
    implied.set(g.away, (g.total - g.spread) / 2);
  }
  const avgImplied = implied.size ? mean([...implied.values()]) : 22;
  const teamPlayers = new Map<string, string[]>();
  for (const p of ctx.players.values()) if (p.team) (teamPlayers.get(p.team) ?? teamPlayers.set(p.team, []).get(p.team)!).push(p.id);
  const base = (id: string) => ctx.projections.get(id)?.base ?? 0;
  const startingQbOut = (team: string) => {
    const qbs = (teamPlayers.get(team) ?? []).map((id) => ctx.players.get(id)!).filter((p) => p.pos === "QB").sort((a, b) => base(b.id) - base(a.id));
    return qbs[0] && OUT.includes(qbs[0].injury ?? "") ? qbs[0] : null;
  };

  // Team pass rate (scheme proxy) and speed scores (combine)
  const speed = (gsis: string | null) => {
    const c = gsis ? ctx.combine.get(gsis) : undefined;
    return c?.forty && c.wt ? (c.wt * 200) / c.forty ** 4 : null;
  };
  const speedByPos = new Map<string, number[]>();
  for (const r of rows) { const p = ctx.players.get(r.id); const sp = speed(p?.gsis ?? null); if (p && sp) (speedByPos.get(p.pos) ?? speedByPos.set(p.pos, []).get(p.pos)!).push(sp); }

  // ---- advanced signal distributions (by position, among ranked players) ----
  const sigDist = new Map<string, number[]>();
  const pushD = (k: string, v: number | null | undefined) => { if (v !== null && v !== undefined && Number.isFinite(v)) (sigDist.get(k) ?? sigDist.set(k, []).get(k)!).push(v); };
  for (const r of rows) {
    const g = ctx.players.get(r.id)?.gsis; if (!g) continue;
    const n = sig.ngs.get(g), pf = sig.pfr.get(g);
    if (n && n.tgt >= 15) { pushD(`${r.pos}:sep`, n.sep); pushD(`${r.pos}:yacoe`, n.yacoe); }
    if (n && n.att >= 30 && r.pos === "RB") pushD("RB:ryoe", n.ryoe);
    if (n && n.att >= 60 && r.pos === "QB") pushD("QB:cpoe", n.cpoe);
    if (pf && pf.games >= 3) {
      if (r.pos === "RB") { pushD("RB:yaco", pf.yacoAtt); pushD("RB:bt", pf.btPerG); }
      if (r.pos === "WR" || r.pos === "TE") { pushD(`${r.pos}:rat`, pf.tgtRating); pushD(`${r.pos}:drop`, pf.dropPct); }
      if (r.pos === "QB") { pushD("QB:bad", pf.badPct); pushD("QB:press", pf.pressPct); }
    }
  }
  const sigP = (k: string, v: number | null | undefined, invert = false) => {
    const arr = sigDist.get(k); if (v === null || v === undefined || !arr || arr.length < 8) return null;
    const q = pctile(arr, v); return { v: (invert ? 1 - q : q) * 2 - 1, pct: Math.round((invert ? 1 - q : q) * 100) };
  };
  const scoring = ctx.league.scoring_settings as Record<string, number>;

  const log0 = (id: string) => ctx.logs.get(id) ?? [];
  const out = new Map<string, ShsAi>();
  for (const r of rows) {
    const p = ctx.players.get(r.id);
    const f = feat.get(r.id);
    const factors: Factor[] = [];
    const add = (key: string, label: string, value: number, detail: string, weight = 1) => factors.push({ key, label, value: Math.round(clamp(value) * 100) / 100, detail, weight });
    if (p && f && r.ecrPos !== null && ["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.pos)) {
      const pe = peers(r).map((x) => feat.get(x.id)).filter((x): x is NonNullable<typeof x> => !!x && x.games >= 2);
      // --- all league types ---
      if (f.games >= 2 && pe.length) {
        const ref = median(pe.map((x) => x.ppg));
        if (ref > 0) add("ppg", "Points per game", (f.ppg / ref - 1) / 0.35, `${f.ppg.toFixed(1)} pts/g vs ${ref.toFixed(1)} for players ranked near him`);
      }
      const peSnap = pe.map((x) => x.snap).filter((x): x is number => x !== null);
      if (f.snap !== null && peSnap.length && ["RB", "WR", "TE"].includes(p.pos) && scope !== "dynasty") {
        const ref = median(peSnap);
        add("snap", "Snap share", (f.snap - ref) / 0.2, `${Math.round(f.snap * 100)}% of snaps (last 3) vs ${Math.round(ref * 100)}% typical at his rank`);
      }
      if (["QB", "RB", "WR", "TE"].includes(p.pos) && f.games >= 3) {
        const parts: number[] = [];
        const bits: string[] = [];
        if (f.share !== null) { const q = pctile(posVals(p.pos, (x) => x.share), f.share); parts.push(q * 2 - 1); bits.push(`${p.pos === "QB" ? "volume" : p.pos === "RB" ? "backfield share" : "target share"} ${Math.round(q * 100)}th pct`); }
        if (f.ppo !== null) { const q = pctile(posVals(p.pos, (x) => x.ppo), f.ppo); parts.push(q * 2 - 1); bits.push(`efficiency ${Math.round(q * 100)}th pct`); }
        const uf = ctx.projections.get(r.id)?.usageFactor ?? 1;
        parts.push((uf - 1) / 0.12); bits.push(uf === 1 ? "usage steady" : `usage ${uf > 1 ? "up" : "down"} ${Math.round(Math.abs(uf - 1) / 0.4 * 100)}%`);
        add("adv", "Advanced metrics", mean(parts), bits.join(" · "));
      }
      // Expected fantasy points: how much opportunity he's getting, and whether he's been lucky or unlucky with it.
      const xf = p.gsis ? sig.xfp.get(p.gsis) : undefined;
      if (xf && xf.games >= 2 && ["QB", "RB", "WR", "TE"].includes(p.pos)) {
        const pxs = peers(r).map((x) => ctx.players.get(x.id)?.gsis).map((g) => (g ? sig.xfp.get(g) : undefined)).filter((x): x is NonNullable<typeof x> => !!x && x.games >= 2).map((x) => x.recentXfp);
        if (pxs.length) {
          const ref = median(pxs);
          const vol = ref > 0 ? (xf.recentXfp / ref - 1) / 0.3 : 0;
          const luck = xf.xfp > 0 ? (xf.fp - xf.xfp) / xf.xfp : 0;
          // Over-performing his opportunity tends to fade; under-performing tends to bounce back (less so in dynasty).
          const reg = scope === "dynasty" ? 0 : -clamp(luck / 0.35) * 0.35;
          add("xfp", "Expected points", clamp(vol) * 0.75 + reg,
            `${xf.recentXfp.toFixed(1)} expected pts/g from his opportunities (last 4) vs ${ref.toFixed(1)} near his rank; scoring ${luck >= 0 ? "+" : ""}${Math.round(luck * 100)}% vs expected${Math.abs(luck) > 0.15 && scope !== "dynasty" ? (luck > 0 ? " (likely to cool)" : " (due to bounce back)") : ""}`);
        }
      }
      // Player tracking (separation, YAC over expected, rush yards over expected, completion % over expected).
      if (p.gsis && ["QB", "RB", "WR", "TE"].includes(p.pos)) {
        const n = sig.ngs.get(p.gsis);
        const parts: { v: number; pct: number; l: string }[] = [];
        const push = (x: { v: number; pct: number } | null, l: string) => { if (x) parts.push({ ...x, l }); };
        if (n && (p.pos === "WR" || p.pos === "TE") && n.tgt >= 15) { push(sigP(`${p.pos}:sep`, n.sep), "separation"); push(sigP(`${p.pos}:yacoe`, n.yacoe), "YAC over expected"); }
        if (n && p.pos === "RB" && n.att >= 30) push(sigP("RB:ryoe", n.ryoe), "rush yds over expected");
        if (n && p.pos === "QB" && n.att >= 60) push(sigP("QB:cpoe", n.cpoe), "completion % over expected");
        if (parts.length) add("track", "Player tracking", mean(parts.map((x) => x.v)) * 0.8, parts.map((x) => `${x.l} ${x.pct}th pct`).join(" · "));
        const pf = sig.pfr.get(p.gsis);
        const cp: { v: number; pct: number; l: string }[] = [];
        const pushC = (x: { v: number; pct: number } | null, l: string) => { if (x) cp.push({ ...x, l }); };
        if (pf && pf.games >= 3) {
          if (p.pos === "RB") { pushC(sigP("RB:yaco", pf.yacoAtt), "yards after contact"); pushC(sigP("RB:bt", pf.btPerG), "broken tackles"); }
          if (p.pos === "WR" || p.pos === "TE") { pushC(sigP(`${p.pos}:rat`, pf.tgtRating), "rating when targeted"); pushC(sigP(`${p.pos}:drop`, pf.dropPct, true), "hands (drops)"); }
          if (p.pos === "QB") { pushC(sigP("QB:bad", pf.badPct, true), "accuracy (bad throws)"); pushC(sigP("QB:press", pf.pressPct, true), "protection (pressure)"); }
        }
        if (cp.length) add("chart", "Film charting", mean(cp.map((x) => x.v)) * 0.7, cp.map((x) => `${x.l} ${x.pct}th pct`).join(" · "));
      }
      // --- weekly ---
      if (scope === "week" && p.team) {
        const wx = weather?.get(p.team);
        if (wx && (wx.indoor || wx.windMph !== null)) {
          let v = 0;
          if (!wx.indoor && wx.windMph !== null) {
            const passGame = ["QB", "WR", "TE", "K"].includes(p.pos);
            if (wx.windMph >= 20) v += passGame ? -0.8 : 0.15; else if (wx.windMph >= 15) v += passGame ? -0.4 : 0.1;
            if (wx.snow || (wx.precipMm ?? 0) >= 3) v += passGame ? -0.3 : 0.1;
          }
          add("weather", "Weather", v, wx.indoor ? "Indoors" : wx.summary);
        }
        let inj = 0;
        const notes: string[] = [];
        const pr = p.gsis ? sig.practice.get(p.gsis) : undefined;
        const lastDay = pr?.days[pr.days.length - 1];
        if (p.injury === "Questionable") {
          // Practice tells you how real a Questionable tag is.
          const q = lastDay === "DNP" ? -0.65 : lastDay === "LP" ? -0.3 : lastDay === "FP" ? -0.08 : -0.3;
          inj += q; notes.push(`he's Questionable${lastDay ? ` (${pr!.days.join("/")} at practice)` : ""}`);
        } else if (pr?.days.length && !["Doubtful", "Out", "IR", "PUP", "NFI", "Sus"].includes(p.injury ?? "")) {
          if (lastDay === "DNP") { inj -= 0.25; notes.push(`missed practice (${pr.days.join("/")})`); }
          else if (lastDay === "LP") { inj -= 0.1; notes.push(`limited at practice (${pr.days.join("/")})`); }
          else if (pr.days.includes("DNP") || pr.days.includes("LP")) { inj += 0.05; notes.push(`practiced fully by week's end (${pr.days.join("/")})`); }
        }
        if (p.injury === "Doubtful") { inj -= 0.8; notes.push("he's Doubtful"); }
        if (["Out", "IR", "PUP", "NFI", "Sus"].includes(p.injury ?? "")) { inj -= 1; notes.push(`he's ${p.injury}`); }
        const qbOut = p.pos !== "QB" ? startingQbOut(p.team) : null;
        if (qbOut) { inj -= p.pos === "RB" ? 0.2 : 0.5; notes.push(`QB ${qbOut.name} is ${qbOut.injury}`); }
        const ahead = (teamPlayers.get(p.team) ?? []).map((id) => ctx.players.get(id)!).find((q) => q.id !== p.id && q.pos === p.pos && base(q.id) > base(p.id) && OUT.includes(q.injury ?? ""));
        if (ahead) { inj += 0.5; notes.push(`${ahead.name} (${ahead.injury}) frees up work`); }
        add("inj", "Injuries", inj, notes.length ? notes.join("; ") : "No injury concerns for him or his QB");
        const opp = r.opp;
        const df = opp ? def?.get(opp)?.factor[p.pos as "QB"] : undefined;
        if (opp && df) add("matchup", "Defensive matchup", (df - 1) / 0.2, `${opp} allows ${Math.round((df - 1) * 100)}% ${df >= 1 ? "more" : "fewer"} points to ${p.pos}s than average`);
        const imp = implied.get(p.team);
        if (imp) add("vegas", "Vegas team total", (imp - avgImplied) / 6, `${p.team} implied ${imp.toFixed(1)} pts vs ${avgImplied.toFixed(1)} average`);
        const gm = wkGames.find((g) => g.home === p.team || g.away === p.team);
        if (gm && gm.spread !== null && gm.spread !== undefined && ["QB", "RB", "WR", "TE"].includes(p.pos)) {
          const margin = gm.home === p.team ? gm.spread : -gm.spread; // + = favoured
          // Favourites run more late (helps RBs); underdogs throw more (helps pass catchers, QB volume).
          const v = p.pos === "RB" ? margin / 10 : p.pos === "QB" ? -margin / 20 : -margin / 14;
          add("script", "Game script", v, margin === 0 ? "Pick'em game" : `${p.team} ${margin > 0 ? "favoured" : "underdog"} by ${Math.abs(margin)}: ${p.pos === "RB" ? (margin > 0 ? "more late carries likely" : "may abandon the run if behind") : margin > 0 ? "fewer late passes likely" : "more passing likely if trailing"}`, 0.6);
        }
      }
      // --- rest of season ---
      if (scope === "ros") {
        const ex = ctx.extras.get(r.id);
        if (ex) add("sched", "Schedule ahead", (ex.outlookRos - 1) / 0.08, `${ex.outlookRos >= 1 ? "Easier" : "Harder"} than average (${Math.round((ex.outlookRos - 1) * 100)}%), playoffs ${Math.round((ex.outlookPlayoffs - 1) * 100)}%`);
        const inj = p.injury;
        add("inj", "Injury outlook", inj === "IR" || inj === "PUP" ? -0.7 : inj === "Out" ? -0.35 : inj === "Doubtful" ? -0.2 : inj === "Questionable" ? -0.05 : 0.05, inj ? `Currently ${inj}` : "Healthy");
      }
      // --- dynasty ---
      if (scope === "dynasty") {
        const cliff = CLIFF[p.pos];
        if (cliff && p.age) {
          const left = cliff - p.age;
          add("age", "Age cliff", (left - 2) / 4, `Age ${Math.floor(p.age)}; ${p.pos}s typically fall off around ${cliff} (${left > 0 ? `${left.toFixed(1)} yrs left` : "past it"})`);
        }
        const ex = ctx.extras.get(r.id);
        if (ex?.offense) add("team", "Team situation & outlook", ((16.5 - ex.offense.rank) / 16) * 0.7 + clamp(ex.offense.trend / 25) * 0.3, `${p.team} offense #${ex.offense.rank} in fantasy points, ${ex.offense.trend >= 0 ? "+" : ""}${ex.offense.trend}% last 4 games`);
        if (p.team) {
          const g = ctx.games.find((x) => x.home === p.team || x.away === p.team);
          const coach = g ? (g.home === p.team ? g.homeCoach : g.awayCoach) : null;
          const prev = ctx.prevCoach.get(p.team);
          if (coach) add("coach", "Coaching", (prev === coach ? 0.25 : -0.25) + (ex?.offense ? clamp(ex.offense.trend / 30) * 0.5 : 0), prev === coach ? `${coach}, same head coach as last season` : `${coach}, new head coach this season${prev ? ` (was ${prev})` : ""}`);
        }
        if (f.snap !== null || f.share !== null) {
          const share = f.share !== null ? pctile(posVals(p.pos, (x) => x.share), f.share) * 2 - 1 : 0;
          const snap = f.snap !== null && p.pos !== "QB" ? (f.snap - 0.6) / 0.3 : 0;
          add("usage", "Usage", (share + snap) / 2, `${f.snap !== null ? `${Math.round(f.snap * 100)}% snaps` : ""}${f.share !== null ? `${f.snap !== null ? ", " : ""}${p.pos === "QB" ? "volume" : "share of team looks"} ${Math.round(pctile(posVals(p.pos, (x) => x.share), f.share) * 100)}th pct` : ""}`);
        }
        // Season snap share and durability: the two usage signals that held up in the dynasty research (WR/TE).
        if (["RB", "WR", "TE"].includes(p.pos) && log0(r.id).length) {
          const sn = log0(r.id).map((g) => g.snapPct).filter((x): x is number => x !== null);
          if (sn.length) { const v = mean(sn); add("snap", "Snap share", (v - 0.6) / 0.3, `${Math.round(v * 100)}% of snaps this season`); }
        }
        if (w0 > 3) {
          const played = log0(r.id).length, teamGames = Math.max(1, ctx.games.filter((g) => g.week < w0 && (g.home === p.team || g.away === p.team)).length);
          const g17 = (played / teamGames) * 17;
          add("games", "Durability", (g17 - 12) / 5, `Played ${played} of ${teamGames} games this season`);
        }
        const dr = p.draftRound;
        const dc = dr === 1 ? 1 : dr === 2 ? 0.6 : dr === 3 ? 0.2 : dr && dr <= 5 ? -0.2 : -0.5;
        const sp = speed(p.gsis);
        const spPct = sp ? pctile(speedByPos.get(p.pos) ?? [], sp) * 2 - 1 : null;
        const vetDiscount = (p.yearsExp ?? 0) >= 4 ? 0.4 : 1; // a long track record outweighs the draft profile
        add("draft", "Combine & draft profile", (spPct !== null ? 0.6 * dc + 0.4 * spPct : dc) * vetDiscount,
          `${dr ? `Round ${dr} pick` : "Undrafted"}${sp ? `, speed score ${Math.round(sp)} (${Math.round(((spPct ?? 0) + 1) * 50)}th pct)` : ", no combine data"}${vetDiscount < 1 ? "; counts less for a veteran" : ""}`);
        const col = opts.college?.get(r.id);
        if (col && (p.yearsExp ?? 9) <= 3) {
          const avgD = DOMINATOR_AVG[p.pos] ?? 0.2;
          add("college", "College production", ((col.dominator - avgD) / (avgD * 0.6)) * ((p.yearsExp ?? 0) >= 2 ? 0.5 : 1),
            `${Math.round(col.dominator * 100)}% of ${col.team}'s ${p.pos === "RB" ? "yards & TDs" : "receiving yards & TDs"} in ${col.season} (typical ${Math.round(avgD * 100)}%)`);
        }
      }
    }
    // Your weights (Settings) × auto-tuned multipliers from graded weeks.
    const mult = (k: string) => (cfg.factor[k] ?? 1) * (tune[k] ?? 1);
    const ecrRating = r.ecrPos !== null ? atRank(r.pos, r.ecrPos) : r.pts;

    // Prediction markets (weekly): implied fantasy points vs a typical player at his expert rank.
    let market: ShsAi["market"] = null;
    if (scope === "week" && p && r.ecrPos !== null && sig.markets) {
      const mp = sig.markets.players[r.id];
      const mk = mp ? marketPoints(mp.lines, ctx.projStats.get(w0)?.get(r.id), scoring, p.pos) : null;
      if (mk && ecrRating > 0.5) market = { pts: Math.round(mk.pts * 10) / 10, value: Math.round(clamp((mk.pts / ecrRating - 1) / 0.3) * 100) / 100, covered: mk.covered };
    }
    // Second opinion: Sleeper's projection (week / rest of season), the SHS dynasty model (dynasty).
    const second = r.pts > 0.3 ? r.pts : null;
    let rating: number, blend: ShsAi["blend"], parts: ShsAi["parts"] = [];
    if (r.ecrPos === null) {
      rating = r.pts * 0.9; blend = { expert: 0, sleeper: 1, market: 0, factors: 0 };
    } else if (cfg.mode !== "custom") {
      const calc = shsFormula(scope, r.pos, ecrRating, scope === "dynasty" ? null : second, factors, market?.pts ?? null, cfg, mult);
      const fx = new Map(calc.parts.map((x) => [x.key, x.effect]));
      for (const f of factors) f.weight = Math.round(Math.abs(fx.get(f.key) ?? 0) * 1000) / 1000;
      rating = calc.rating; parts = calc.parts;
      blend = { expert: 1 - calc.lineShare, sleeper: 0, market: calc.lineShare, factors: 0 };
    } else {
      const rm: Record<string, number> = {};
      for (const f of factors) f.weight = Math.round(f.weight * (rm[f.key] ?? 1) * mult(f.key) * 100) / 100;
      const wsum = factors.reduce((a, x) => a + x.weight, 0);
      const F = wsum ? factors.reduce((a, x) => a + x.value * x.weight, 0) / wsum : 0;
      const w = market && scope === "week" ? cfg.mixLines : { ...cfg.mix, markets: 0 };
      const pw = { ecr: w.ecr, sleeper: second !== null ? w.sleeper : 0, markets: market ? w.markets : 0, factors: factors.length ? w.factors : 0 };
      const tot = pw.ecr + pw.sleeper + pw.markets + pw.factors || 1;
      blend = { expert: pw.ecr / tot, sleeper: pw.sleeper / tot, market: pw.markets / tot, factors: pw.factors / tot };
      rating = blend.expert * ecrRating + blend.sleeper * (second ?? ecrRating) + blend.market * (market?.pts ?? ecrRating) + blend.factors * ecrRating * (1 + F);
    }
    out.set(r.id, {
      pct: r.ecrPos !== null && ecrRating > 0.5 && (factors.length || market || second !== null) ? Math.round(100 * (rating / ecrRating - 1)) : null,
      rating, rank: 0, factors, market, blend, mode: cfg.mode === "custom" ? "custom" : "shs", parts,
    });
  }
  // SHS AI rank at each position (players with an expert rank first)
  for (const arr of byPos.values()) [...arr].sort((a, b) => (a.ecrPos === null ? 1 : 0) - (b.ecrPos === null ? 1 : 0) || out.get(b.id)!.rating - out.get(a.id)!.rating).forEach((r, i) => (out.get(r.id)!.rank = i + 1));
  return out;
}
