/**
 * Trade Finder (SHS model).
 *
 * 1. Profile every team: position ranks (from power rankings), which positions are NEEDS (bottom half of the league)
 *    and which are SURPLUS (top third, or a bench player who'd start for most teams).
 * 2. Pair your surplus with each partner's needs and vice versa. Candidate deals: 1-for-1, 2-for-1 (you consolidate),
 *    1-for-2 (you spread a star across two holes). In dynasty leagues a pick can be added to even the value out.
 * 3. Keep only deals that make sense for BOTH builds:
 *      Redraft: your best lineups improve over the rest of the season, theirs don't get worse by more than a little,
 *               and package values stay within a fair band.
 *      Dynasty: both sides gain value for their strategy (contender/rebuilder weights) and the value gap stays fair.
 * 4. Rank by your gain, their gain and fairness.
 */
import type { LeagueContext } from "./league";
import { optimizeLineup, lineupTotal } from "../engine/lineup";
import { powerRankings, type TeamPower } from "../engine/power";
import { packageValue } from "../engine/trade";
import { strategicPickValue, strategicPlayerValue, type TeamClass } from "../engine/classify";

export interface TeamProfile {
  rosterId: number;
  name: string;
  needs: string[];
  surplus: string[];
  power: TeamPower;
  cls: TeamClass | null;
}

export interface FoundTrade {
  partner: number;
  partnerName: string;
  give: { id: string; name: string; pos: string; value: number }[];
  get: { id: string; name: string; pos: string; value: number }[];
  myRos: number; // rest-of-season lineup change, points
  theirRos: number;
  myValue: number; // package value change (dynasty: strategic)
  theirValue: number;
  fairness: number; // 0 = perfectly even, 1 = very lopsided
  score: number;
  why: string[];
  link: string;
}

const SKILL = ["QB", "RB", "WR", "TE"];
const groupOf = (pos: string) => (["DL", "LB", "DB"].includes(pos) ? "IDP" : pos);

export function teamProfiles(ctx: LeagueContext): TeamProfile[] {
  const power = powerRankings(ctx);
  const n = ctx.teamsCount;
  return power.map((p) => {
    const t = ctx.teams.find((x) => x.rosterId === p.rosterId)!;
    const needs = Object.entries(p.positions).filter(([pos, r]) => SKILL.includes(pos) && r.rank > n / 2).sort((a, b) => b[1].rank - a[1].rank).map(([pos]) => pos);
    const surplus = Object.entries(p.positions).filter(([pos, r]) => SKILL.includes(pos) && r.rank <= Math.ceil(n / 3)).map(([pos]) => pos);
    // A bench player good enough to start for most teams also counts as surplus at his position.
    const starters = new Set(ctx.lineups.get(t.rosterId)?.optimal.map((s) => s.playerId));
    for (const pid of t.players) {
      const pl = ctx.players.get(pid);
      if (!pl || starters.has(pid) || !SKILL.includes(pl.pos)) continue;
      if ((ctx.projections.get(pid)?.base ?? 0) >= (ctx.replacement[pl.pos] ?? 99) && !surplus.includes(pl.pos)) surplus.push(pl.pos);
    }
    const c = ctx.showClasses ? ctx.classifications.get(t.rosterId) : undefined;
    return { rosterId: t.rosterId, name: t.name, needs, surplus: surplus.filter((s) => !needs.includes(s)), power: p, cls: c ? ((c.override ?? c.primary) as TeamClass) : null };
  });
}

export function findTrades(ctx: LeagueContext, me: number, limit = 12, onlyPartner: number | null = null): { profiles: TeamProfile[]; trades: FoundTrade[] } {
  const profiles = teamProfiles(ctx);
  const mine = profiles.find((p) => p.rosterId === me)!;
  const dynasty = ctx.valuationMode === "dynasty";
  const key = dynasty ? "dynasty" : "redraft";
  const rp = ctx.league.roster_positions;
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const weeks = ctx.seasonOver ? [] : Array.from({ length: ctx.lastWeek - w0 + 1 }, (_, i) => w0 + i);
  const val = (id: string) => ctx.values.get(id)?.[key] ?? 0;
  const usable = (rid: number) => {
    const t = ctx.teams.find((x) => x.rosterId === rid)!;
    return t.players.filter((p) => !t.taxi.includes(p) && !t.reserve.includes(p) && ctx.players.has(p));
  };
  const rosCache = new Map<string, number>();
  const ros = (ids: string[]) => {
    const k = [...ids].sort().join(",");
    if (rosCache.has(k)) return rosCache.get(k)!;
    let t = 0;
    for (const w of weeks) t += lineupTotal(optimizeLineup(rp, ids.map((id) => ({ id, positions: ctx.players.get(id)!.positions, points: ctx.projections.get(id)?.byWeek[w] ?? 0 }))));
    rosCache.set(k, t);
    return t;
  };
  const strat = (cls: TeamClass | null, id: string) => {
    const v = ctx.values.get(id);
    const p = ctx.players.get(id);
    if (!v || !p) return 0;
    return cls ? strategicPlayerValue(cls, ctx.valuationMode, v, p.age) : v[key];
  };
  const myIds = usable(me);
  const myBase = ros(myIds);
  // My tradeable assets: players at surplus positions (or anyone with value) — never my single best starter at a need.
  const myAssets = myIds
    .filter((id) => SKILL.includes(ctx.players.get(id)!.pos) && val(id) >= 3)
    .sort((a, b) => val(b) - val(a))
    .slice(0, 12);

  const out: FoundTrade[] = [];
  for (const partner of profiles) {
    if (partner.rosterId === me || (onlyPartner !== null && partner.rosterId !== onlyPartner)) continue;
    const theirIds = usable(partner.rosterId);
    const theirBase = ros(theirIds);
    // What I'd target from them: players at MY need positions that are THEIR surplus (or any position I need)
    const targets = theirIds
      .filter((id) => {
        const pos = ctx.players.get(id)!.pos;
        return mine.needs.includes(pos) && val(id) >= 3 && (partner.surplus.includes(pos) || !partner.needs.includes(pos));
      })
      .sort((a, b) => val(b) - val(a))
      .slice(0, 6);
    // Looking at one partner: widen the search to anyone useful on their roster.
    if (onlyPartner !== null && targets.length < 4) {
      for (const id of theirIds.filter((x) => SKILL.includes(ctx.players.get(x)!.pos) && val(x) >= 3 && !targets.includes(x)).sort((a, b) => val(b) - val(a)).slice(0, 6 - targets.length)) targets.push(id);
    }
    // What I'd offer: players at positions THEY need, preferring my surplus positions
    const offers = myAssets.filter((id) => {
      const pos = ctx.players.get(id)!.pos;
      return partner.needs.includes(pos) || (mine.surplus.includes(pos) && !partner.surplus.includes(pos));
    }).slice(0, 8);
    if (onlyPartner !== null && offers.length < 5) for (const id of myAssets.filter((x) => !offers.includes(x)).slice(0, 8 - offers.length)) offers.push(id);
    if (!targets.length || !offers.length) continue;

    const combos: [string[], string[]][] = [];
    for (const g of targets) for (const o of offers) combos.push([[o], [g]]);
    for (const g of targets.slice(0, 3)) for (let i = 0; i < offers.length; i++) for (let j = i + 1; j < offers.length; j++) combos.push([[offers[i], offers[j]], [g]]);
    for (const o of offers.slice(0, 3)) for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) combos.push([[o], [targets[i], targets[j]]]);

    for (const [give, get] of combos) {
      const myAfter = [...myIds.filter((x) => !give.includes(x)), ...get];
      const theirAfter = [...theirIds.filter((x) => !get.includes(x)), ...give];
      const myRos = weeks.length ? ros(myAfter) - myBase : 0;
      const theirRos = weeks.length ? ros(theirAfter) - theirBase : 0;
      const pkgGive = packageValue(give.map(val));
      const pkgGet = packageValue(get.map(val));
      let myValue = dynasty ? packageValue(get.map((x) => strat(mine.cls, x))) - packageValue(give.map((x) => strat(mine.cls, x))) : pkgGet - pkgGive;
      let theirValue = dynasty ? packageValue(give.map((x) => strat(partner.cls, x))) - packageValue(get.map((x) => strat(partner.cls, x))) : pkgGive - pkgGet;
      const extraPick: { id: string; name: string; pos: string; value: number }[] = [];
      // Dynasty: even out a modest gap with a pick from the side getting the better deal.
      if (dynasty && Math.abs(pkgGet - pkgGive) > 4) {
        const iWin = pkgGet > pkgGive;
        const owner = iWin ? me : partner.rosterId;
        const gap = Math.abs(pkgGet - pkgGive);
        const pick = ctx.picks.filter((k) => k.ownerRosterId === owner && k.value > 0).sort((a, b) => Math.abs(a.value - gap) - Math.abs(b.value - gap))[0];
        if (pick && pick.value <= gap * 1.6) {
          extraPick.push({ id: `k:${pick.key}`, name: `${pick.season} R${pick.round} (${pick.tier})`, pos: "PICK", value: pick.value });
          const recv = iWin ? partner.cls : mine.cls;
          if (iWin) { myValue -= stratOrRaw(mine.cls, pick.value); theirValue += stratOrRaw(recv, pick.value); }
          else { myValue += stratOrRaw(recv, pick.value); theirValue -= stratOrRaw(partner.cls, pick.value); }
        }
      }
      const total = Math.max(1, pkgGive + pkgGet);
      const fairness = Math.min(1, Math.abs(myValue - theirValue) / 2 / Math.max(1, pkgGive, pkgGet));
      // Must make sense for both builds
      const ok = dynasty
        ? myValue > -0.05 * total && theirValue > -0.08 * total && fairness < 0.35 &&
          (myRos > -8 || mine.cls === "Rebuilder" || mine.cls === "Tanking") &&
          // A contender won't give up this season's points; a pretender only a little.
          (partner.cls === "Contender" ? theirRos > -10 : partner.cls === "Pretender" ? theirRos > -25 : true)
        : onlyPartner !== null ? myRos > 0.5 && theirRos > -12 && fairness < 0.5 : myRos > 2 && theirRos > -6 && fairness < 0.4;
      if (!ok) continue;
      const myGainNorm = dynasty ? myValue / total + myRos / 200 : myRos / 30 + myValue / total;
      const theirGainNorm = dynasty ? theirValue / total : theirRos / 30 + theirValue / total;
      const score = myGainNorm + 0.6 * theirGainNorm - 0.8 * fairness;
      const info = (id: string) => ({ id: `p:${id}`, name: ctx.players.get(id)!.name, pos: ctx.players.get(id)!.pos, value: Math.round(val(id) * 10) / 10 });
      const giveL = give.map(info);
      const getL = get.map(info);
      const iGivePick = extraPick.length && pkgGet > pkgGive;
      const why: string[] = [];
      const posGet = [...new Set(get.map((x) => ctx.players.get(x)!.pos))];
      const posGive = [...new Set(give.map((x) => ctx.players.get(x)!.pos))];
      why.push(`You're ${rankWord(mine.power, posGet[0], ctx.teamsCount)} at ${posGet.join("/")}; ${partner.name} is ${rankWord(partner.power, posGet[0], ctx.teamsCount)} there.`);
      why.push(`${partner.name} is ${rankWord(partner.power, posGive[0], ctx.teamsCount)} at ${posGive.join("/")}, where you're ${rankWord(mine.power, posGive[0], ctx.teamsCount)}.`);
      if (give.length > get.length) why.push("You consolidate depth into one stronger starter, so your roster spots open up.");
      if (get.length > give.length) why.push("You spread one asset across two lineup holes.");
      if (dynasty && partner.cls && mine.cls) why.push(`Fits both plans: you're a ${mine.cls}, they're a ${partner.cls}.`);
      out.push({
        partner: partner.rosterId, partnerName: partner.name,
        give: iGivePick ? [...giveL, ...extraPick] : giveL, get: !iGivePick && extraPick.length ? [...getL, ...extraPick] : getL,
        myRos: r1(myRos), theirRos: r1(theirRos), myValue: r1(myValue), theirValue: r1(theirValue), fairness: Math.round(fairness * 100) / 100, score, why,
        link: `/trade/?partner=${partner.rosterId}&a=${[...give.map((x) => `p:${x}`), ...(iGivePick ? extraPick.map((x) => x.id) : [])].join(",")}&b=${[...get.map((x) => `p:${x}`), ...(!iGivePick ? extraPick.map((x) => x.id) : [])].join(",")}`,
      });
    }
  }
  // Best few per partner, then overall, avoiding the same headline player over and over.
  out.sort((a, b) => b.score - a.score);
  const picked: FoundTrade[] = [];
  const usedGet = new Map<string, number>();
  const perPartner = new Map<number, number>();
  for (const t of out) {
    const k = t.get[0].id;
    if ((usedGet.get(k) ?? 0) >= (onlyPartner !== null ? 2 : 1) || (perPartner.get(t.partner) ?? 0) >= (onlyPartner !== null ? 8 : 2)) continue;
    picked.push(t);
    usedGet.set(k, (usedGet.get(k) ?? 0) + 1);
    perPartner.set(t.partner, (perPartner.get(t.partner) ?? 0) + 1);
    if (picked.length >= limit) break;
  }
  return { profiles, trades: picked };

  function stratOrRaw(cls: TeamClass | null, v: number) {
    return cls ? strategicPickValue(cls, v) : v;
  }
}

function rankWord(p: TeamPower, pos: string, n: number) {
  const r = p.positions[groupOf(pos)]?.rank;
  if (!r) return "unranked";
  const ord = (x: number) => x + (["th", "st", "nd", "rd"][(x % 100 - 20) % 10] || ["th", "st", "nd", "rd"][x % 100] || "th");
  return `${ord(r)} of ${n}`;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
