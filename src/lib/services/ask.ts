/**
 * Ask SHS: plain-language questions answered from your league's own data (no AI service, nothing leaves the device).
 *
 * It doesn't depend on sentence structure. Every question is broken into pieces —
 *   players named · positions · time frame (this week, week N, rest of season, playoffs, dynasty) · topic words
 * — and each topic (compare, trade, pickups, drops, lineup, odds, news, rankings, one player…) is scored by its
 * keywords. The best-scoring topic runs the matching tool for that time frame. Follow-ups reuse the conversation:
 * "what about rest of season?" re-asks the last comparison for the new time frame.
 */
import type { LeagueContext } from "./league";
import { startSit } from "./startSit";
import { waiverReport } from "./waivers";
import { lineupSwaps } from "./views";
import { evaluateTrade } from "../engine/trade";
import { findTrades } from "./tradeFinder";
import { rankings, type RankScope } from "./rankings";
import { shsAi } from "./shsai";
import type { NewsItem } from "../news";

export interface Answer { text: string; bullets?: string[]; players?: string[]; links?: { label: string; href: string }[]; scope?: string }
export type Frame = { kind: "week"; week: number } | { kind: "ros" } | { kind: "playoffs" } | { kind: "dynasty" };
type Topic = "compare" | "trade" | "player" | "waivers" | "drop" | "lineup" | "odds" | "playoffOpp" | "matchup" | "news" | "keepers" | "rank" | "tradeFind" | "help";
export interface Memory { players: string[]; frame: Frame | null; topic: Topic | null; pos: string | null }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const POS_WORDS: [string, string][] = [["quarterbacks", "QB"], ["quarterback", "QB"], ["qbs", "QB"], ["qb", "QB"], ["running backs", "RB"], ["running back", "RB"], ["rbs", "RB"], ["rb", "RB"], ["wide receivers", "WR"], ["wide receiver", "WR"], ["receivers", "WR"], ["receiver", "WR"], ["wrs", "WR"], ["wr", "WR"], ["tight ends", "TE"], ["tight end", "TE"], ["tes", "TE"], ["te", "TE"], ["kickers", "K"], ["kicker", "K"], ["defenses", "DEF"], ["defense", "DEF"], ["dst", "DEF"]];

/** Common nicknames → full names. */
const NICK: Record<string, string> = {
  cmc: "christian mccaffrey", jsn: "jaxon smith njigba", btj: "brian thomas", arsb: "amon ra st brown", "amon ra": "amon ra st brown", "st brown": "amon ra st brown",
  ajb: "aj brown", "a j brown": "aj brown", dk: "dk metcalf", jj: "justin jefferson", bijan: "bijan robinson", saquon: "saquon barkley",
  puka: "puka nacua", jahmyr: "jahmyr gibbs", "kyren": "kyren williams", tee: "tee higgins", lamar: "lamar jackson", mahomes: "patrick mahomes", "hollywood": "marquise brown", kmet: "cole kmet",
};
/** Words that are also first names but almost never mean a player in a question. */
const NOT_NAMES = new Set(["will", "mark", "drew", "grant", "rich", "miles", "austin", "jordan", "chase", "start", "best", "top", "trade", "odds", "news", "this", "week", "season", "rest", "what", "about", "over", "better"]);

/** Players named in the question, in the order they appear: full names, last names, nicknames, then first names. */
export function findPlayers(ctx: LeagueContext, q: string): string[] {
  let text = ` ${norm(q)} `;
  for (const [k, v] of Object.entries(NICK)) text = text.replace(` ${k} `, ` ${v} `);
  const rostered = new Set(ctx.teams.flatMap((t) => t.players));
  const mine = new Set(ctx.teams.find((t) => t.rosterId === ctx.myRosterId)?.players ?? []);
  const val = (id: string) => (ctx.values.get(id)?.redraft ?? 0) + (rostered.has(id) ? 50 : 0) + (mine.has(id) ? 100 : 0);
  const hits: { id: string; at: number; score: number; len: number }[] = [];
  const find = (needle: string) => { const i = text.indexOf(` ${needle} `); return i; };
  for (const p of ctx.players.values()) {
    if (p.pos === "DEF") continue;
    const n = norm(p.name);
    if (n.length < 4) continue;
    const words = n.split(" ").filter((w) => !["jr", "sr", "ii", "iii", "iv", "v"].includes(w));
    let at = find(n), score = 3, len = n.length;
    if (at < 0) { const last = words.slice(-1)[0] ?? ""; if (last.length >= 3) { at = find(last); score = 2; len = last.length; } }
    if (at < 0) { const first = words[0] ?? ""; if (first.length >= 4 && !NOT_NAMES.has(first)) { at = find(first); score = 1; len = first.length; } }
    if (at < 0) continue;
    hits.push({ id: p.id, at, score: score * 1000 + val(p.id), len: score === 3 ? n.length : len });
  }
  // A longer match owns its words: a full name beats a last-name or first-name hit inside it.
  const full = hits.filter((h) => h.score >= 3000).map((h) => [h.at, h.at + h.len + 1]);
  const kept = hits.filter((h) => h.score >= 3000 || !full.some(([x, y]) => h.at >= x && h.at < y));
  const byAt = new Map<number, { id: string; score: number }>();
  for (const h of kept) { const cur = byAt.get(h.at); if (!cur || h.score > cur.score) byAt.set(h.at, h); }
  return [...byAt.entries()].sort((x, y) => x[0] - y[0]).map(([, h]) => h.id).filter((id, i, arr) => arr.indexOf(id) === i);
}

/** Time frame from keywords anywhere in the question. */
export function frameOf(ctx: LeagueContext, question: string): Frame | null {
  const q = ` ${norm(question)} `;
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const wk = q.match(/ (?:week|wk) ?(\d{1,2}) /);
  if (wk) return { kind: "week", week: Math.max(1, Math.min(ctx.lastWeek, Number(wk[1]))) };
  if (/ (dynasty|long term|longterm|future|next year|next season|years|rebuild)/.test(q)) return { kind: "dynasty" };
  if (/ (playoff|playoffs|championship|title run|semis|finals)/.test(q)) return { kind: "playoffs" };
  if (/ (rest of|ros |remainder|second half|down the stretch|from here|going forward|moving forward|long run|season long|for the season|the season|this season)/.test(q)) return { kind: "ros" };
  if (/ next week /.test(q)) return { kind: "week", week: Math.min(ctx.lastWeek, w0 + 1) };
  if (/ (this week|today|tonight|sunday|monday|thursday|this weekend|right now|now )/.test(q)) return { kind: "week", week: w0 };
  return null;
}

const TOPICS: Record<Topic, [string, number][]> = {
  compare: [["or", 2], ["vs", 3], ["versus", 3], ["better", 2], ["start", 2], ["sit", 2], ["who", 1], ["which", 1], ["compare", 3], ["rather", 2], ["over", 1], ["flex", 2], ["choose", 2]],
  trade: [["trade", 4], ["deal", 3], ["offer", 3], ["swap", 3], ["give up", 2], ["package", 2], ["accept", 2], ["fair", 3], ["worth it", 2], ["overpay", 3], ["win the trade", 4]],
  player: [["tell me about", 3], ["outlook", 3], ["how is", 2], ["hows", 2], ["value", 1], ["thoughts", 2], ["think of", 2], ["tell me", 2], ["info", 2], ["doing", 1], ["buy", 2], ["sell", 2], ["hold", 2]],
  waivers: [["waiver", 4], ["pick up", 3], ["pickups", 4], ["pickup", 3], ["add", 2], ["free agent", 4], ["stream", 3], ["available", 2], ["grab", 2], ["claim", 3]],
  drop: [["drop", 4], ["cut", 3], ["release", 3], ["get rid", 3]],
  lineup: [["lineup", 4], ["line up", 4], ["starters", 2], ["set my", 3], ["bench", 2], ["optimal", 2]],
  odds: [["odds", 3], ["chance", 2], ["make the playoffs", 4], ["win the league", 4], ["title", 2], ["projected wins", 3], ["seed", 2], ["standings", 2]],
  playoffOpp: [["opponent", 2], ["face", 2], ["who do i play", 3], ["who will i play", 4], ["bracket", 3]],
  matchup: [["matchup", 3], ["win this week", 4], ["beat", 2], ["my opponent", 3], ["going to win", 3], ["win chance", 3]],
  news: [["news", 4], ["injur", 3], ["update", 2], ["status", 2], ["hurt", 3], ["healthy", 2], ["happening", 2], ["questionable", 3]],
  keepers: [["keeper", 4], ["keep", 3]],
  rank: [["top", 2], ["best", 2], ["rank", 3], ["rankings", 3], ["list", 1], ["highest", 2]],
  tradeFind: [["trade for", 3], ["who should i trade", 4], ["trade target", 4], ["buy low", 3], ["sell high", 3], ["find a trade", 4], ["trade ideas", 4]],
  help: [["help", 3], ["what can you", 4]],
};

function scoreTopics(q: string, players: number, pos: string | null, bumps = true): [Topic, number][] {
  const t = ` ${q} `;
  const out = (Object.keys(TOPICS) as Topic[]).map((k) => [k, TOPICS[k].reduce((a, [w, s]) => a + (t.includes(` ${w}`) ? s : 0), 0)] as [Topic, number]);
  const bump = (k: Topic, v: number) => { if (!bumps) return; const e = out.find((x) => x[0] === k)!; e[1] += v; };
  if (players >= 2) { bump("compare", 3); bump("trade", 1); bump("player", -2); if (/ for /.test(t) && !/ for (the )?(rest|this|next|week|playoff|season|dynasty)/.test(t)) bump("trade", 3); }
  if (players === 1) { bump("player", 3); bump("compare", -3); }
  if (players === 0) { bump("compare", -10); bump("player", -10); bump("trade", -3); }
  if (pos && players === 0) { bump("rank", 1); }
  return out.sort((a, b) => b[1] - a[1]);
}

export const EXAMPLES = [
  "Daniels or Mendoza rest of season?",
  "Who should I start this week?",
  "Best RB pickups",
  "Bijan for Chase, fair?",
  "My playoff odds",
  "Who will I play in the playoffs?",
  "Top 10 WRs rest of season",
  "News on my players",
  "Who should I drop?",
];

export const frameLabel = (f: Frame, ctx: LeagueContext) => f.kind === "week" ? (f.week === Math.min(ctx.currentWeek, ctx.lastWeek) ? `this week (week ${f.week})` : `week ${f.week}`) : f.kind === "ros" ? "rest of season" : f.kind === "playoffs" ? `the fantasy playoffs (weeks ${ctx.playoffStart}–${ctx.lastWeek})` : "dynasty";

const STANDALONE: Topic[] = ["waivers", "drop", "lineup", "odds", "playoffOpp", "matchup", "keepers", "rank", "help"];
const FOLLOW = /^(and|what about|how about|same|but|ok|okay|now|instead|what if|then|also) |\b(he|him|his|them|they|those|these|either|both|that trade|that deal|the trade|that one)\b/;

export function ask(ctx: LeagueContext, question: string, news: NewsItem[] = [], mem: Memory | null = null): { answer: Answer; memory: Memory } {
  const q = norm(question);
  let ids = findPlayers(ctx, question);
  const posAsked = POS_WORDS.find(([w]) => ` ${q} `.includes(` ${w} `))?.[1] ?? null;
  let frame = frameOf(ctx, question);
  let ranked = scoreTopics(q, ids.length, posAsked);
  let topic: Topic = ranked[0][1] > 0 ? ranked[0][0] : ids.length >= 2 ? "compare" : ids.length === 1 ? "player" : "help";
  // A follow-up reuses the last players: only when this message names nobody, isn't a question in its own right
  // (pickups, drops, odds, rankings…), and either refers back ("him", "what about…") or only changes the time frame.
  const ownTopic = ranked[0][1] >= 3 && STANDALONE.includes(ranked[0][0]);
  const refersBack = FOLLOW.test(q) || (!!frame && ranked[0][1] < 3);
  const followUp = !ids.length && !!mem?.players.length && !ownTopic && refersBack;
  if (followUp && mem) {
    ids = mem.players;
    // The words of this message decide the topic if they say something (news, trade…); otherwise keep the last one.
    const raw = scoreTopics(q, ids.length, posAsked, false);
    topic = raw[0][1] >= 2 && !STANDALONE.includes(raw[0][0]) && raw[0][0] !== "compare" && !(raw[0][0] === "player" && ids.length > 1) ? raw[0][0] : mem.topic ?? (ids.length >= 2 ? "compare" : "player");
  }
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  if (!frame) frame = followUp && mem?.frame ? mem.frame : ctx.valuationMode === "dynasty" && (topic === "player" || topic === "rank") ? { kind: "dynasty" } : topic === "rank" || topic === "player" || topic === "trade" ? { kind: "ros" } : { kind: "week", week: w0 };
  const pos = posAsked ?? (followUp ? mem?.pos ?? null : null);
  return { answer: { ...run(ctx, topic, ids, frame, pos, q, news), scope: frameLabel(frame, ctx) }, memory: { players: ids, frame, topic, pos } };
}

/** Suggested questions built from your own roster and league, so they always make sense here. */
export function suggestionsFor(ctx: LeagueContext): string[] {
  const me = ctx.teams.find((t) => t.rosterId === ctx.myRosterId);
  if (!me) return EXAMPLES;
  const last = (id: string) => ctx.players.get(id)?.name.split(" ").slice(-1)[0] ?? "";
  const proj = (id: string) => ctx.projections.get(id)?.median ?? 0;
  const out: string[] = [];
  const st = me.starters.filter((id) => ["RB", "WR", "TE"].includes(ctx.players.get(id)?.pos ?? "")).sort((a, b) => proj(a) - proj(b));
  const bn = me.players.filter((id) => !me.starters.includes(id) && ["RB", "WR", "TE"].includes(ctx.players.get(id)?.pos ?? "")).sort((a, b) => proj(b) - proj(a));
  if (st[0] && bn[0]) out.push(`${ctx.players.get(st[0])!.name} or ${ctx.players.get(bn[0])!.name} this week?`, `${last(st[0])} or ${last(bn[0])} rest of season?`);
  out.push("Is my lineup set?");
  const weakest = waiverReport(ctx, me.rosterId).needs[0]?.pos ?? "RB";
  out.push(`Best ${weakest} pickups`);
  // A realistic trade idea: your best bench player for a similar-value starter elsewhere.
  const key = ctx.valuationMode === "dynasty" ? "dynasty" : "redraft";
  const mine = [...me.players].filter((id) => ctx.players.has(id)).sort((a, b) => (ctx.values.get(b)?.[key] ?? 0) - (ctx.values.get(a)?.[key] ?? 0));
  const give = mine[2] ?? mine[0];
  if (give) {
    const v = ctx.values.get(give)?.[key] ?? 0;
    const target = ctx.teams.filter((t) => t.rosterId !== me.rosterId).flatMap((t) => t.players).filter((id) => ctx.players.get(id)?.pos !== ctx.players.get(give)?.pos && Math.abs((ctx.values.get(id)?.[key] ?? 0) - v) < 6).sort((a, b) => (ctx.values.get(b)?.[key] ?? 0) - (ctx.values.get(a)?.[key] ?? 0))[0];
    if (target) out.push(`Trade ${ctx.players.get(give)!.name} for ${ctx.players.get(target)!.name}, fair?`);
  }
  out.push("My playoff odds", "Who will I play in the playoffs?", "Top 10 WRs rest of season", "News on my players", "Who should I drop?");
  return out;
}

function run(ctx: LeagueContext, topic: Topic, ids: string[], frame: Frame, pos: string | null, q: string, news: NewsItem[]): Answer {
  const me = ctx.myRosterId !== null ? ctx.teams.find((t) => t.rosterId === ctx.myRosterId) ?? null : null;
  const nm = (id: string) => ctx.players.get(id)?.name ?? id;
  const ownerOf = (id: string) => ctx.teams.find((t) => t.players.includes(id)) ?? null;
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const fl = frameLabel(frame, ctx);

  switch (topic) {
    case "trade": {
      if (!me || !ids.length) break;
      const mine = ids.filter((id) => me.players.includes(id));
      const theirs = ids.filter((id) => !me.players.includes(id));
      const partner = theirs.length ? ownerOf(theirs[0]) : null;
      if (ids.length === 1 || !mine.length || !theirs.length) {
        // One side only: find realistic packages (Trade Finder) that include him ("X for Y": Y is the one you want).
        const id = !mine.length ? ids[ids.length - 1] : ids[0];
        const note = ids.length > 1 && !mine.length ? `${ids.map((x) => `${nm(x)} (${ownerOf(x)?.name ?? "free agent"})`).join(" and ")} — neither is on your team. ` : "";
        const own = ownerOf(id);
        if (!own) return { text: `${nm(id)} isn't on a team in this league, so you can add him off waivers instead of trading.`, players: [id], links: [{ label: "Waiver Assistant", href: "/waivers/" }] };
        const deals = findTrades(ctx, me.rosterId, 12, own.rosterId === me.rosterId ? null : own.rosterId).trades
          .filter((t) => (own.rosterId === me.rosterId ? t.give : t.get).some((x) => x.id === `p:${id}`)).slice(0, 3);
        const fmt = (t: (typeof deals)[number]) => `You give ${t.give.map((x) => x.name).join(" + ")}, get ${t.get.map((x) => x.name).join(" + ")} from ${t.partnerName} · ${Math.round(t.accept * 100)}% chance they accept`;
        if (!deals.length) return { text: note + (own.rosterId === me.rosterId ? `I couldn't find a deal for ${nm(id)} that helps you and that another team would accept. Try naming who you'd want back.` : `I couldn't find a package for ${nm(id)} that ${own.name} would likely accept and that still helps you. Try naming who you'd give.`), players: [id], links: [{ label: own.rosterId === me.rosterId ? "Trade Finder" : `Build a trade with ${own.name}`, href: own.rosterId === me.rosterId ? "/trade-finder/" : `/trade/?partner=${own.rosterId}&b=p:${id}` }] };
        return { text: note + (own.rosterId === me.rosterId ? `Deals for ${nm(id)} that help you and that the other team would plausibly take:` : `Packages for ${nm(id)} that ${own.name} would plausibly accept:`), bullets: deals.map(fmt), players: [id], links: [{ label: "Open the best one", href: deals[0].link }] };
      }
      if (!partner) return { text: `${theirs.map(nm).join(", ")} ${theirs.length > 1 ? "aren't" : "isn't"} on a team in this league, so it's a waiver add, not a trade.`, players: theirs, links: [{ label: "Waiver Assistant", href: "/waivers/" }] };
      const get = theirs.filter((x) => partner.players.includes(x));
      const r = evaluateTrade(ctx, { teamA: me.rosterId, teamB: partner.rosterId, aSends: mine.map((x) => `p:${x}`), bSends: get.map((x) => `p:${x}`), mode: ctx.valuationMode });
      return {
        text: `${r.verdict}: ${mine.map(nm).join(" + ")} to ${partner.name} for ${get.map(nm).join(" + ")}.`,
        bullets: [
          `Package value: you send ${r.market.aSends}, you get ${r.market.bSends} (${r.market.netForA >= 0 ? "+" : ""}${r.market.netForA}).`,
          ...(r.lineup.weeks ? [`Your lineup rest of season: ${r.lineup.aRosBefore} → ${r.lineup.aRosAfter} pts/g.`] : []),
          `Chance ${partner.name} accepts: about ${Math.round(r.accept * 100)}%.`,
          ...(r.odds ? [`Title odds: ${r.odds.aTitleBefore.toFixed(0)}% → ${r.odds.aTitleAfter.toFixed(0)}%.`] : []),
        ],
        players: [...mine, ...get],
        links: [{ label: "Open in Trade Analyzer", href: `/trade/?partner=${partner.rosterId}&a=${mine.map((x) => `p:${x}`).join(",")}&b=${get.map((x) => `p:${x}`).join(",")}` }],
      };
    }
    case "compare": {
      if (ids.length < 2) break;
      const list = ids.slice(0, 4);
      if (frame.kind === "week") {
        const rows = startSit(ctx, list, frame.week);
        const best = [...rows].sort((a, b) => b.best - a.best)[0];
        return {
          text: `${frame.week === w0 ? "This week" : `Week ${frame.week}`}: start ${best.name}. He scores the most in ${best.best.toFixed(0)}% of 20,000 simulated games.`,
          bullets: rows.map((r) => `${r.name}: ${r.bye ? "BYE" : `${r.dist.mean.toFixed(1)} proj (floor ${r.dist.floor.toFixed(1)}, ceiling ${r.dist.ceiling.toFixed(1)})`}${r.reasons.length ? ` · ${r.reasons.slice(0, 2).join(" · ")}` : ""}`),
          players: list, links: [{ label: "Compare visually", href: `/start-sit/?ids=${list.join(",")}` }, { label: "Rest of season", href: "#ask:what about rest of season" }],
        };
      }
      if (frame.kind === "dynasty") {
        const rows = rankings(ctx, "dynasty"), ai = shsAi(ctx, rows, "dynasty", null);
        const info = list.map((id) => ({ id, v: ctx.values.get(id)?.dynasty ?? 0, r: rows.find((x) => x.id === id), p: ctx.players.get(id)! }));
        const best = [...info].sort((a, b) => b.v - a.v)[0];
        return { text: `Dynasty: ${best.p.name} is worth more long term (value ${best.v.toFixed(0)} vs ${info.filter((x) => x !== best).map((x) => x.v.toFixed(0)).join(", ")}).`,
          bullets: info.map((x) => `${x.p.name}: age ${x.p.age ? Math.floor(x.p.age) : "?"} · dynasty value ${x.v.toFixed(0)}${x.r?.ecrPos ? ` · experts ${x.p.pos}${x.r.ecrPos}` : ""}${ai.get(x.id) ? ` · SHS AI ${x.p.pos}${ai.get(x.id)!.rank}` : ""}`),
          players: list, links: [{ label: "This week instead", href: "#ask:what about this week" }] };
      }
      // Rest of season / playoffs: projected points over the weeks that matter, schedule, ranks.
      const weeks = frame.kind === "playoffs" ? Array.from({ length: ctx.lastWeek - ctx.playoffStart + 1 }, (_, i) => ctx.playoffStart + i) : Array.from({ length: ctx.lastWeek - w0 + 1 }, (_, i) => w0 + i);
      const rows = rankings(ctx, "ros"), ai = shsAi(ctx, rows, "ros", null);
      const info = list.map((id) => {
        const pr = ctx.projections.get(id), p = ctx.players.get(id)!, ex = ctx.extras.get(id);
        const tot = weeks.reduce((a, w) => a + (pr?.byWeek[w] ?? 0), 0);
        const played = weeks.filter((w) => (pr?.byWeek[w] ?? 0) > 0).length;
        const sched = frame.kind === "playoffs" ? ex?.outlookPlayoffs : ex?.outlookRos;
        return { id, p, tot, ppg: played ? tot / played : 0, byes: weeks.length - played, sched, r: rows.find((x) => x.id === id), a: ai.get(id) };
      });
      const sorted = [...info].sort((a, b) => b.tot - a.tot);
      const [b1, b2] = sorted;
      const gap = b2 && b2.tot > 0 ? Math.round((b1.tot / b2.tot - 1) * 100) : 100;
      return {
        text: `${frame.kind === "playoffs" ? "For the playoffs" : "Rest of season"}: ${b1.p.name}${gap >= 100 ? ` (${sorted.slice(1).filter((x) => x.tot === 0).map((x) => x.p.name).join(", ")} isn't projected to play)` : gap >= 3 ? `, by about ${gap}%` : ", but it's close"}. He projects ${b1.tot.toFixed(0)} pts over the ${weeks.length} week${weeks.length === 1 ? "" : "s"} left vs ${sorted.slice(1).map((x) => `${x.tot.toFixed(0)} for ${x.p.name}`).join(", ")}.`,
        bullets: info.map((x) => `${x.p.name}: ${x.ppg.toFixed(1)} pts/g${x.byes ? ` (${x.byes} bye/out week${x.byes > 1 ? "s" : ""})` : ""}${x.sched ? ` · schedule ${x.sched >= 1.03 ? "easier" : x.sched <= 0.97 ? "harder" : "average"}` : ""}${x.r?.ecrPos ? ` · experts ${x.p.pos}${x.r.ecrPos}` : ""}${x.a?.rank ? ` · SHS AI ${x.p.pos}${x.a.rank}` : ""}${x.p.injury ? ` · ${x.p.injury}` : ""}`),
        players: list, links: [{ label: frame.kind === "playoffs" ? "Rest of season" : "Playoff weeks", href: frame.kind === "playoffs" ? "#ask:what about rest of season" : "#ask:what about the playoffs" }, { label: "This week", href: "#ask:what about this week" }],
      };
    }
    case "lineup": {
      if (!me) break;
      const sw = lineupSwaps(ctx, me.rosterId);
      if (!sw.length) return { text: "Your lineup already matches the best projected lineup this week.", links: [{ label: "Open matchup", href: "/matchup/" }] };
      return { text: `${sw.length} change${sw.length > 1 ? "s" : ""} would help this week:`, bullets: sw.map((s) => `Start ${s.inName}${s.slot ? ` at ${s.slot}` : ""}${s.outId ? `, bench ${s.outName}` : ""} (+${s.gain} pts). ${s.reason}`), players: sw.map((s) => s.inId), links: [{ label: "Open matchup", href: "/matchup/" }] };
    }
    case "drop": {
      if (!me) break;
      const r = waiverReport(ctx, me.rosterId);
      if (!r.drops.length) return { text: "Nobody on your bench is clearly worse than what's on waivers right now." };
      return { text: "Drop candidates on your bench:", bullets: r.drops.slice(0, 4).map((d) => `${d.player.name} (${d.player.pos}): ${d.reason}`), players: r.drops.slice(0, 4).map((d) => d.player.id), links: [{ label: "Waiver Assistant", href: "/waivers/" }] };
    }
    case "waivers": {
      if (!me) break;
      const r = waiverReport(ctx, me.rosterId);
      const list = r.topAdds.filter((w) => !pos || w.player.pos === pos).sort((a, b) => (frame.kind === "week" ? b.weekGain - a.weekGain : b.rosGain - a.rosGain)).slice(0, 5);
      if (!list.length) return { text: `No free agent${pos ? ` at ${pos}` : ""} improves your lineup right now.`, links: [{ label: "Waiver Assistant", href: "/waivers/" }] };
      return { text: `Best pickups${pos ? ` at ${pos}` : ""} for your team, ${frame.kind === "week" ? "best this week first" : "best rest of season first"}:`, bullets: list.map((w) => `${w.player.name} (${w.player.pos}, ${w.player.team}): +${w.weekGain} pts this week, +${w.rosGain} rest of season${w.drop ? `; drop ${w.drop.name}` : ""}`), players: list.map((w) => w.player.id), links: [{ label: "Waiver planner (next 4 weeks)", href: "/waivers/" }] };
    }
    case "playoffOpp": {
      if (!me) break;
      const w = ctx.playoffStart;
      const m = ctx.sim.playoffOpp?.[w]?.[me.rosterId] ?? {};
      const opps = Object.entries(m).filter(([k]) => k !== "out" && k !== "bye").sort((a, b) => b[1] - a[1]).slice(0, 3);
      return { text: `Estimate for playoff round 1 (week ${w}): ${(m.bye ?? 0).toFixed(0)}% bye, ${(m.out ?? 0).toFixed(0)}% miss the playoffs.`, bullets: opps.map(([k, v]) => `${ctx.teams.find((t) => t.rosterId === Number(k))?.name}: ${v.toFixed(0)}% of simulations`), links: [{ label: "Playoff weeks", href: `/matchup/?week=${w}` }] };
    }
    case "odds": {
      if (!me) break;
      return { text: `You make the playoffs in ${(ctx.sim.playoffOdds[me.rosterId] ?? 0).toFixed(0)}% of simulated seasons and win the title in ${(ctx.sim.titleOdds[me.rosterId] ?? 0).toFixed(0)}%.`, bullets: [`Projected wins: ${ctx.sim.projectedWins[me.rosterId] ?? "—"}`, `Average finish: seed ${ctx.sim.avgSeed[me.rosterId] ?? "—"}`], links: [{ label: "League view", href: "/league/" }] };
    }
    case "matchup": {
      if (!me) break;
      const m = ctx.matchupsThisWeek.find((x) => x.roster_id === me.rosterId);
      const opp = m ? ctx.matchupsThisWeek.find((x) => x.matchup_id === m.matchup_id && x.roster_id !== me.rosterId) : undefined;
      if (!opp) return { text: "No opponent this week." };
      const a = ctx.liveScore.get(me.rosterId)?.projected, b = ctx.liveScore.get(opp.roster_id)?.projected;
      const t = ctx.teams.find((x) => x.rosterId === opp.roster_id)!;
      return { text: `You play ${t.name} this week.${a && b ? ` Projected ${a.mean.toFixed(1)} to ${b.mean.toFixed(1)}.` : ""}`, links: [{ label: "Open matchup", href: "/matchup/" }] };
    }
    case "news": {
      const mine = new Set(me?.players ?? []);
      const list = news.filter((n) => (ids.length ? ids.includes(n.id) : mine.has(n.id))).slice(0, 6);
      const status = ids.filter((id) => ctx.players.get(id)?.injury).map((id) => `${nm(id)}: ${ctx.players.get(id)!.injury}`);
      if (!list.length) return { text: ids.length ? `No news on ${ids.map(nm).join(", ")} in the last 10 days.${status.length ? ` Current status: ${status.join(", ")}.` : ""}` : "Nothing new on your players in the last 10 days.", players: ids };
      return { text: "Latest:", bullets: list.map((n) => n.text), players: [...new Set(list.map((n) => n.id))] };
    }
    case "keepers":
      return { text: ctx.format === "keeper" ? "Your keeper plan, every team's likely keepers and the best-value keepers in the league are in the Keeper Planner." : "This league isn't a keeper league.", links: ctx.format === "keeper" ? [{ label: "Keeper Planner", href: "/keepers/" }] : [] };
    case "tradeFind":
      return { text: ids.length ? `Open a trade for ${ids.map(nm).join(", ")} in the Trade Analyzer, or let Trade Finder suggest deals other managers would accept.` : "Trade Finder suggests deals that help you and that the other manager would plausibly accept.", players: ids, links: [{ label: "Trade Finder", href: "/trade-finder/" }, ...(ids[0] && ownerOf(ids[0]) && ownerOf(ids[0])!.rosterId !== ctx.myRosterId ? [{ label: `Trade for ${nm(ids[0])}`, href: `/trade/?partner=${ownerOf(ids[0])!.rosterId}&b=p:${ids[0]}` }] : [])] };
    case "rank": {
      const scope: RankScope = frame.kind === "dynasty" ? "dynasty" : frame.kind === "week" ? "week" : "ros";
      if (!pos) return { text: "Which position? For example: “top 10 WRs rest of season”.", links: [{ label: "Rankings", href: `/rankings/?scope=${scope}` }] };
      const rows = rankings(ctx, scope).filter((r) => r.pos === pos && r.ecrPos !== null);
      const ai = shsAi(ctx, rows, scope, null);
      const n = Math.min(15, Number(q.match(/ (\d{1,2}) /)?.[1] ?? q.match(/^(\d{1,2}) /)?.[1]) || 10);
      const top = [...rows].sort((a, b) => (ai.get(a.id)?.rank ?? 999) - (ai.get(b.id)?.rank ?? 999)).slice(0, n);
      return { text: `Top ${n} ${pos}s, ${fl} (SHS AI order):`, bullets: top.map((r, i) => `${i + 1}. ${r.name} (${r.team ?? "FA"}) · experts ${r.pos}${r.ecrPos}${r.mine ? " · yours" : ""}`), players: top.slice(0, 5).map((r) => r.id), links: [{ label: "Full rankings", href: `/rankings/?scope=${scope}` }] };
    }
    case "player": {
      if (!ids.length) break;
      const id = ids[0];
      const p = ctx.players.get(id)!;
      const pr = ctx.projections.get(id);
      const scope: RankScope = frame.kind === "dynasty" ? "dynasty" : frame.kind === "week" ? "week" : "ros";
      const rows = rankings(ctx, scope);
      const row = rows.find((r) => r.id === id);
      const ai = row ? shsAi(ctx, rows, scope, null).get(id) : undefined;
      const own = ownerOf(id);
      const item = news.find((n) => n.id === id);
      const ex = ctx.extras.get(id);
      const wk = frame.kind === "week" ? frame.week : null;
      return {
        text: `${p.name}, ${p.pos} · ${p.team ?? "free agent"}${p.age ? ` · age ${Math.floor(p.age)}` : ""}. ${own ? (own.rosterId === ctx.myRosterId ? "On your team." : `On ${own.name}.`) : "Available on waivers."}`,
        bullets: [
          ...(pr ? [wk ? `Projects ${(pr.byWeek[wk] ?? pr.median).toFixed(1)} in week ${wk}; ${pr.seasonAvg} pts/g this season.` : `${pr.seasonAvg} pts/g this season (last 4: ${pr.last4Avg}); ${pr.base} when healthy.`] : []),
          ...(row?.ecrPos ? [`Experts rank him ${p.pos}${row.ecrPos} ${fl}${ai ? `; SHS AI ${p.pos}${ai.rank}` : ""}.`] : []),
          ...(!wk && ex ? [`Schedule ahead ${ex.outlookRos >= 1.03 ? "easier" : ex.outlookRos <= 0.97 ? "harder" : "about average"}; playoffs ${ex.outlookPlayoffs >= 1.03 ? "easier" : ex.outlookPlayoffs <= 0.97 ? "harder" : "average"}.`] : []),
          ...(frame.kind === "dynasty" ? [`Dynasty value ${(ctx.values.get(id)?.dynasty ?? 0).toFixed(0)}.`] : []),
          ...(p.injury ? [`Injury: ${p.injury}${p.injuryPart ? ` (${p.injuryPart})` : ""}.`] : []),
          ...(item ? [`Latest: ${item.text}.`] : []),
        ],
        players: [id],
        links: own && own.rosterId !== ctx.myRosterId ? [{ label: "Trade for him", href: `/trade/?partner=${own.rosterId}&b=p:${id}` }] : !own ? [{ label: "Waiver Assistant", href: "/waivers/" }] : [],
      };
    }
    default: break;
  }
  return { text: ids.length ? `I found ${ids.map(nm).join(", ")} but wasn't sure what you wanted to know. Try adding “start”, “trade”, “rest of season” or “news”.` : "I can answer questions about your league from its data. Try one of these:", bullets: ids.length ? undefined : EXAMPLES, players: ids };
}
