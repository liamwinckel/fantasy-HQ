/**
 * Ask SHS: plain-language questions answered from your league's own data (no AI service, no key, nothing leaves
 * the device). It recognises the question type and the players named, then runs the same tools the app uses:
 * start/sit, trade analyzer, waiver assistant, rankings, playoff simulations, news, keepers.
 */
import type { LeagueContext } from "./league";
import { startSit } from "./startSit";
import { waiverReport } from "./waivers";
import { lineupSwaps } from "./views";
import { evaluateTrade } from "../engine/trade";
import { rankings } from "./rankings";
import { shsAi } from "./shsai";
import type { NewsItem } from "../news";

export interface Answer { text: string; bullets?: string[]; players?: string[]; links?: { label: string; href: string }[] }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const POS_WORDS: Record<string, string> = { qb: "QB", qbs: "QB", quarterback: "QB", rb: "RB", rbs: "RB", "running back": "RB", wr: "WR", wrs: "WR", receiver: "WR", "wide receiver": "WR", te: "TE", "tight end": "TE", kicker: "K", k: "K", defense: "DEF", def: "DEF", dst: "DEF" };

/** Players named in the question, in the order they appear. Prefers rostered and more valuable players on ties. */
export function findPlayers(ctx: LeagueContext, q: string): string[] {
  const text = ` ${norm(q)} `;
  const rostered = new Set(ctx.teams.flatMap((t) => t.players));
  const val = (id: string) => (ctx.values.get(id)?.redraft ?? 0) + (rostered.has(id) ? 50 : 0);
  const hits: { id: string; at: number; score: number; len: number }[] = [];
  for (const p of ctx.players.values()) {
    if (p.pos === "DEF") continue;
    const n = norm(p.name);
    if (n.length < 4) continue;
    let at = text.indexOf(` ${n} `);
    let score = 3;
    if (at < 0) {
      const last = n.split(" ").slice(-1)[0];
      if (last.length < 4) continue;
      at = text.indexOf(` ${last} `);
      score = 1;
      if (at < 0) continue;
    }
    hits.push({ id: p.id, at, score: score * 1000 + val(p.id), len: score === 3 ? n.length : 0 });
  }
  // A full-name match owns its words: drop last-name matches inside it (e.g. "Garrett" in "Garrett Wilson").
  const spans = hits.filter((h) => h.len).map((h) => [h.at, h.at + h.len + 1]);
  const kept = hits.filter((h) => h.len || !spans.some(([a, b]) => h.at >= a && h.at < b));
  // One player per position in the text: the best-scoring match there.
  const byAt = new Map<number, { id: string; score: number }>();
  for (const h of kept) { const cur = byAt.get(h.at); if (!cur || h.score > cur.score) byAt.set(h.at, h); }
  return [...byAt.entries()].sort((a, b) => a[0] - b[0]).map(([, h]) => h.id).filter((id, i, a) => a.indexOf(id) === i);
}

export const EXAMPLES = [
  "Should I start Puka Nacua or Garrett Wilson?",
  "Who should I pick up at RB?",
  "Is my lineup set?",
  "Trade Bijan Robinson for Ja'Marr Chase?",
  "What are my playoff odds?",
  "Who will I play in the playoffs?",
  "Tell me about Jayden Daniels",
  "Any news on my players?",
  "Who should I drop?",
];

export function ask(ctx: LeagueContext, question: string, news: NewsItem[] = []): Answer {
  const q = norm(question);
  const ids = findPlayers(ctx, question);
  const me = ctx.myRosterId !== null ? ctx.teams.find((t) => t.rosterId === ctx.myRosterId) ?? null : null;
  const nm = (id: string) => ctx.players.get(id)?.name ?? id;
  const ownerOf = (id: string) => ctx.teams.find((t) => t.players.includes(id)) ?? null;
  const week = Math.min(ctx.currentWeek, ctx.lastWeek);
  const posAsked = Object.entries(POS_WORDS).find(([w]) => ` ${q} `.includes(` ${w} `))?.[1] ?? null;
  const has = (...w: string[]) => w.some((x) => ` ${q} `.includes(` ${x}`));

  // ---- trade ----
  if (has("trade", "deal", "for ") && ids.length >= 2 && me && (has("trade", "deal") || ids.length === 2)) {
    const mine = ids.filter((id) => me.players.includes(id));
    const theirs = ids.filter((id) => !me.players.includes(id));
    const partner = theirs.length ? ownerOf(theirs[0]) : null;
    if (mine.length && partner) {
      const r = evaluateTrade(ctx, { teamA: me.rosterId, teamB: partner.rosterId, aSends: mine.map((x) => `p:${x}`), bSends: theirs.filter((x) => partner.players.includes(x)).map((x) => `p:${x}`), mode: ctx.valuationMode });
      return {
        text: `${r.verdict}. Sending ${mine.map(nm).join(" + ")} to ${partner.name} for ${theirs.map(nm).join(" + ")}.`,
        bullets: [
          `Package value: you send ${r.market.aSends}, you get ${r.market.bSends} (${r.market.netForA >= 0 ? "+" : ""}${r.market.netForA}).`,
          ...(r.lineup.weeks ? [`Your lineup rest of season: ${r.lineup.aRosBefore} → ${r.lineup.aRosAfter} pts/g.`] : []),
          `Chance ${partner.name} accepts: about ${Math.round(r.accept * 100)}%.`,
          ...(r.odds ? [`Title odds: ${r.odds.aTitleBefore.toFixed(0)}% → ${r.odds.aTitleAfter.toFixed(0)}%.`] : []),
        ],
        players: [...mine, ...theirs],
        links: [{ label: "Open in Trade Analyzer", href: `/trade/?partner=${partner.rosterId}&a=${mine.map((x) => `p:${x}`).join(",")}&b=${theirs.map((x) => `p:${x}`).join(",")}` }],
      };
    }
    if (!partner && theirs.length) return { text: `${theirs.map(nm).join(", ")} ${theirs.length > 1 ? "aren't" : "isn't"} on a team in this league, so there's no one to trade with. Try the Waiver Assistant.`, players: theirs, links: [{ label: "Waiver Assistant", href: "/waivers/" }] };
  }

  // ---- start / sit ----
  if (ids.length >= 2 && (has("start", "sit", " or ", "who should", "flex", "better") || ids.length <= 4)) {
    const list = ids.slice(0, 4);
    const rows = startSit(ctx, list, week);
    const best = [...rows].sort((a, b) => b.best - a.best)[0];
    return {
      text: `Start ${best.name}. He scores the most in ${best.best.toFixed(0)}% of 20,000 simulated week-${week} games.`,
      bullets: rows.map((r) => `${r.name}: ${r.bye ? "BYE" : `${r.dist.mean.toFixed(1)} proj (floor ${r.dist.floor.toFixed(1)}, ceiling ${r.dist.ceiling.toFixed(1)})`}${r.reasons.length ? ` · ${r.reasons.slice(0, 2).join(" · ")}` : ""}`),
      players: list,
      links: [{ label: "Compare visually", href: `/start-sit/?ids=${list.join(",")}` }],
    };
  }

  // ---- lineup ----
  if (me && has("lineup", "line up", "set", "start this week", "who should i start")) {
    const sw = lineupSwaps(ctx, me.rosterId);
    if (!sw.length) return { text: "Your lineup already matches the best projected lineup this week.", links: [{ label: "Open matchup", href: "/matchup/" }] };
    return { text: `${sw.length} change${sw.length > 1 ? "s" : ""} would help this week:`, bullets: sw.map((s) => `Start ${s.inName}${s.slot ? ` at ${s.slot}` : ""}${s.outId ? `, bench ${s.outName}` : ""} (+${s.gain} pts). ${s.reason}`), players: sw.map((s) => s.inId), links: [{ label: "Open matchup", href: "/matchup/" }] };
  }

  // ---- waivers / drops ----
  if (me && has("drop", "cut", "release")) {
    const r = waiverReport(ctx, me.rosterId);
    if (!r.drops.length) return { text: "Nobody on your bench is clearly worse than what's on waivers right now." };
    return { text: `Drop candidates on your bench:`, bullets: r.drops.slice(0, 4).map((d) => `${d.player.name} (${d.player.pos}): ${d.reason}`), players: r.drops.slice(0, 4).map((d) => d.player.id), links: [{ label: "Waiver Assistant", href: "/waivers/" }] };
  }
  if (me && has("waiver", "pick up", "pickup", "add", "free agent", "stream")) {
    const r = waiverReport(ctx, me.rosterId);
    const list = r.topAdds.filter((w) => !posAsked || w.player.pos === posAsked).slice(0, 5);
    if (!list.length) return { text: `No free agent${posAsked ? ` at ${posAsked}` : ""} improves your lineup right now.`, links: [{ label: "Waiver Assistant", href: "/waivers/" }] };
    return { text: `Best pickups${posAsked ? ` at ${posAsked}` : ""} for your team:`, bullets: list.map((w) => `${w.player.name} (${w.player.pos}, ${w.player.team}): +${w.weekGain} pts this week, +${w.rosGain} rest of season${w.drop ? `; drop ${w.drop.name}` : ""}`), players: list.map((w) => w.player.id), links: [{ label: "Waiver planner (next 4 weeks)", href: "/waivers/" }] };
  }

  // ---- playoffs ----
  if (me && has("playoff", "odds", "title", "championship", "make it")) {
    if (has("who", "opponent", "play in", "face")) {
      const w = ctx.playoffStart;
      const m = ctx.sim.playoffOpp?.[w]?.[me.rosterId] ?? {};
      const opps = Object.entries(m).filter(([k]) => k !== "out" && k !== "bye").sort((a, b) => b[1] - a[1]).slice(0, 3);
      return { text: `Estimate for playoff round 1 (week ${w}): ${(m.bye ?? 0).toFixed(0)}% bye, ${(m.out ?? 0).toFixed(0)}% miss the playoffs.`, bullets: opps.map(([k, v]) => `${ctx.teams.find((t) => t.rosterId === Number(k))?.name}: ${v.toFixed(0)}% of simulations`), links: [{ label: "Playoff weeks", href: `/matchup/?week=${w}` }] };
    }
    return { text: `You make the playoffs in ${(ctx.sim.playoffOdds[me.rosterId] ?? 0).toFixed(0)}% of simulated seasons and win the title in ${(ctx.sim.titleOdds[me.rosterId] ?? 0).toFixed(0)}%.`, bullets: [`Projected wins: ${ctx.sim.projectedWins[me.rosterId] ?? "—"}`, `Average finish: seed ${ctx.sim.avgSeed[me.rosterId] ?? "—"}`], links: [{ label: "League view", href: "/league/" }] };
  }

  // ---- news ----
  if (has("news", "injur", "update", "happening")) {
    const mine = new Set(me?.players ?? []);
    const list = news.filter((n) => (ids.length ? ids.includes(n.id) : mine.has(n.id))).slice(0, 6);
    if (!list.length) return { text: ids.length ? `No news on ${ids.map(nm).join(", ")} in the last 10 days.` : "Nothing new on your players in the last 10 days." };
    return { text: "Latest:", bullets: list.map((n) => n.text), players: [...new Set(list.map((n) => n.id))] };
  }

  // ---- keepers ----
  if (has("keep", "keeper")) return { text: ctx.format === "keeper" ? "Your keeper plan, every team's likely keepers and the best-value keepers in the league are in the Keeper Planner." : "This league isn't a keeper league.", links: ctx.format === "keeper" ? [{ label: "Keeper Planner", href: "/keepers/" }] : [] };

  // ---- one player ----
  if (ids.length === 1) {
    const id = ids[0];
    const p = ctx.players.get(id)!;
    const pr = ctx.projections.get(id);
    const scope = ctx.valuationMode === "dynasty" ? "dynasty" : "ros";
    const rows = rankings(ctx, scope);
    const row = rows.find((r) => r.id === id);
    const ai = row ? shsAi(ctx, rows, scope, null).get(id) : undefined;
    const own = ownerOf(id);
    const item = news.find((n) => n.id === id);
    return {
      text: `${p.name}, ${p.pos} · ${p.team ?? "free agent"}${p.age ? ` · age ${Math.floor(p.age)}` : ""}. ${own ? (own.rosterId === ctx.myRosterId ? "On your team." : `On ${own.name}.`) : "Available on waivers."}`,
      bullets: [
        ...(pr ? [`${pr.seasonAvg} pts/g this season (last 4: ${pr.last4Avg}); projects ${pr.median} this week.`] : []),
        ...(row?.ecrPos ? [`Experts rank him ${p.pos}${row.ecrPos} ${scope === "dynasty" ? "in dynasty" : "rest of season"}${ai ? `; SHS AI ${p.pos}${ai.rank}` : ""}.`] : []),
        ...(p.injury ? [`Injury: ${p.injury}${p.injuryPart ? ` (${p.injuryPart})` : ""}.`] : []),
        ...(item ? [`Latest: ${item.text}.`] : []),
      ],
      players: [id],
      links: [...(own && own.rosterId !== ctx.myRosterId ? [{ label: `Trade for him`, href: `/trade/?partner=${own.rosterId}&b=p:${id}` }] : [])],
    };
  }

  return { text: "I can answer questions about your league from its data. Try one of these:", bullets: EXAMPLES };
}
