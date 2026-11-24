"use client";

/** Shared SHS AI pieces: the plain-language explainer, the ±% chip, and optional college data. */
import { useEffect, useMemo, useState } from "react";
import { cx } from "./ui";
import { Sheet } from "./Sheet";
import type { ShsAi as ShsAiT } from "@/lib/services/shsai";
import { DEFAULT_SHS, getSettings, type ShsWeights } from "@/lib/settings";
import { SHS_METRICS, shsAi } from "@/lib/services/shsai";
import { provenKeys } from "@/lib/services/shsModel";
import { rankings } from "@/lib/services/rankings";
import { weekWeather, type GameWeather } from "@/lib/weather";
import type { RankScope } from "@/lib/services/rankings";
import type { LeagueContext } from "@/lib/services/league";
import { collegeProfiles, type CollegeProfile } from "@/lib/cfbd";

export function useShsWeights(): ShsWeights {
  const [w, setW] = useState<ShsWeights>(DEFAULT_SHS);
  useEffect(() => {
    const read = () => setW({ ...DEFAULT_SHS, ...(getSettings().shs ?? {}) });
    read();
    window.addEventListener("fhq-settings", read);
    window.addEventListener("fhq-shs", read);
    return () => { window.removeEventListener("fhq-settings", read); window.removeEventListener("fhq-shs", read); };
  }, []);
  return w;
}

/** What SHS AI is, in plain terms: how the number is built and the metrics it weighs. */
export function ShsExplainer({ scope }: { scope: RankScope }) {
  const w = useShsWeights();
  const pc = (x: number, m: Record<string, number>) => `${Math.round((x / (Object.values(m).reduce((a, b) => a + b, 0) || 1)) * 100)}%`;
  const second = scope === "dynasty" ? "SHS dynasty model" : "Sleeper projection";
  const list = [...SHS_METRICS.all, ...SHS_METRICS[scope]];
  const proven = useMemo(() => ["QB", "RB", "WR", "TE"].map((pos) => [pos, [...provenKeys(scope, pos)]] as const), [scope]);
  return (
    <div className="text-xs leading-relaxed text-muted">
      {w.mode !== "custom" ? <>
        <p className="text-fg"><b>SHS AI</b> starts from what a player at his expert rank is worth, then moves him up or down only by the things that have actually beaten the experts when we replayed past seasons, with only what was known at the time.</p>
        <p className="mt-1.5">Each ranking type has its own formula, fitted separately for QBs, RBs, WRs and TEs. Anything that didn&apos;t beat the experts out of sample still shows in the reasons, but doesn&apos;t move the number.{scope === "week" && <> For players with betting lines this week, <b className="text-fg">{w.lines}%</b> of the value comes from the points the lines imply.</>}</p>
        <p className="mt-1.5 text-fg">Moving the number {scope === "week" ? "this week" : scope === "ros" ? "for the rest of the season" : "in dynasty"}: {proven.map(([pos, ks]) => `${pos} ${ks.length ? ks.map(label).join(", ") : "experts only"}`).join(" · ")}.</p>
      </> : <>
        <p className="text-fg"><b>SHS AI</b> (custom mix) blends the expert consensus, a second opinion and its own factors into one value for each player, then compares it with his expert rank.</p>
        <p className="mt-1.5">
          The mix is <b className="text-fg">{pc(w.mix.ecr, w.mix)} experts · {pc(w.mix.sleeper, w.mix)} {second} · {pc(w.mix.factors, w.mix)} SHS factors</b>
          {scope === "week" && <>; for players with betting lines this week, <b className="text-fg">{pc(w.mixLines.ecr, w.mixLines)} experts · {pc(w.mixLines.sleeper, w.mixLines)} Sleeper · {pc(w.mixLines.markets, w.mixLines)} lines · {pc(w.mixLines.factors, w.mixLines)} factors</b></>}.
        </p>
      </>}
      <p className="mt-1.5">{scope === "dynasty" ? "Dynasty uses only long-term data (age, situation, draft profile, usage)." : "Week and rest of season use only redraft data; nothing dynasty-specific."} Each factor compares him with players ranked near him at his position, from −1 (points to worse) to +1 (better).</p>
      <p className="mt-1.5"><b className="text-fg">=</b> means it agrees with the experts. Up ticks mean SHS AI values him higher than his expert rank, down ticks lower: one tick = leans (4–7%), two = clear (8–14%), three = strong (15%+). Tap the mark for the exact number and the reasons.</p>
      <p className="mt-2 font-semibold text-fg">What it looks at{scope === "week" ? " this week" : scope === "ros" ? " for the rest of the season" : " in dynasty"}:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">{list.map((m) => <li key={m}>{m}</li>)}</ul>
      <p className="mt-2">The research and season-by-season results are in the SHS AI Lab. Settings → SHS AI switches to your own mix.</p>
    </div>
  );
}

const LABELS: Record<string, string> = {
  gap: "Sleeper projection", lines: "Betting lines", ppg: "Points per game", snap: "Snap share", adv: "Advanced metrics", xfp: "Expected points", track: "Player tracking", chart: "Film charting",
  weather: "Weather", inj: "Injuries", matchup: "Matchup", vegas: "Vegas team total", script: "Game script", sched: "Schedule", age: "Age", team: "Team situation", coach: "Coaching",
  usage: "Usage", games: "Durability", form: "Recent form", luck: "Scoring vs expected", missed: "Games missed", share: "Opportunity share", sd: "Expert disagreement", rookie: "Rookie", draft: "Draft & combine", college: "College production",
};
export const label = (k: string) => LABELS[k] ?? k;

/**
 * SHS AI's view in plain words. The % is how much higher (+) or lower (−) SHS AI values him than his expert rank:
 *   ≥ +12 Strong buy · +4…+11 Buy · −3…+3 Agree · −4…−11 Fade · ≤ −12 Strong fade
 */
export function shsVerdict(pct: number | null | undefined): { word: string; arrow: string; tone: "pos" | "neg" | "flat"; long: string } | null {
  if (pct === null || pct === undefined) return null;
  if (pct >= 12) return { word: "Strong buy", arrow: "▲▲", tone: "pos", long: `SHS AI rates him well above his expert rank (worth about ${pct}% more).` };
  if (pct >= 4) return { word: "Buy", arrow: "▲", tone: "pos", long: `SHS AI rates him a bit above his expert rank (worth about ${pct}% more).` };
  if (pct <= -12) return { word: "Strong fade", arrow: "▼▼", tone: "neg", long: `SHS AI rates him well below his expert rank (worth about ${Math.abs(pct)}% less).` };
  if (pct <= -4) return { word: "Fade", arrow: "▼", tone: "neg", long: `SHS AI rates him a bit below his expert rank (worth about ${Math.abs(pct)}% less).` };
  return { word: "Agree", arrow: "=", tone: "flat", long: "SHS AI agrees with the experts on him." };
}

/** How many ticks: 1 = leans (4–7%), 2 = clear (8–14%), 3 = strong (15%+). */
export const shsTicks = (pct: number) => (Math.abs(pct) < 4 ? 0 : Math.abs(pct) < 8 ? 1 : Math.abs(pct) < 15 ? 2 : 3);

function Ticks({ pct }: { pct: number }) {
  const n = shsTicks(pct);
  if (!n) return <span className="text-sm font-bold leading-none text-muted">=</span>;
  const up = pct > 0;
  return (
    <span className={cx("inline-flex items-center", up ? "text-pos" : "text-neg")} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <svg key={i} width="9" height="10" viewBox="0 0 9 10" className="-mx-[1px]"><path d={up ? "M1 7.5 4.5 3 8 7.5" : "M1 2.5 4.5 7 8 2.5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ))}
    </span>
  );
}

/**
 * SHS AI's view as a small mark: "=" when it agrees with the experts, up/down ticks when it doesn't.
 * Tap for the exact number and why.
 */
export function AiChip({ v, ai, name, className }: { v: number | null | undefined; ai?: ShsAiT | null; name?: string; className?: string; label?: boolean }) {
  const [open, setOpen] = useState(false);
  if (v === null || v === undefined) return null;
  const d = shsVerdict(v)!;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={`SHS AI: ${d.word}. Tap for why.`}
        className={cx("inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 transition-colors hover:bg-panel2", className)}>
        <Ticks pct={v} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="SHS AI" sub={name}>
        <ShsWhy pct={v} ai={ai ?? null} />
      </Sheet>
    </>
  );
}

const sp = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 1000) / 10)}%`;

/** The exact number, what it means, and the biggest reasons. */
export function ShsWhy({ pct, ai }: { pct: number; ai: ShsAiT | null }) {
  const d = shsVerdict(pct)!;
  const custom = ai?.mode === "custom";
  const detail = (k: string) => k === "lines" ? (ai?.market ? `Lines imply ${ai.market.pts.toFixed(1)} pts in your scoring (${ai.market.covered.join(", ")})` : "")
    : k === "gap" ? "Sleeper's projection vs what his expert rank is usually worth" : ai?.factors.find((f) => f.key === k)?.detail ?? "";
  const moving = !custom && ai ? [...ai.parts].filter((x) => Math.abs(x.effect) >= 0.005).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)) : [];
  const tracked = !custom && ai ? ai.factors.filter((f) => !ai.parts.some((x) => x.key === f.key)) : [];
  const reasons = custom && ai ? [
    ...(ai.market ? [{ label: "Betting lines", value: ai.market.value, w: ai.blend.market * 3, detail: `Lines imply ${ai.market.pts.toFixed(1)} pts in your scoring` }] : []),
    ...ai.factors.map((f) => ({ label: f.label, value: f.value, w: f.weight, detail: f.detail })),
  ].filter((r) => Math.abs(r.value) >= 0.1).sort((a, b) => Math.abs(b.value * b.w) - Math.abs(a.value * a.w)).slice(0, 4) : [];
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-4 rounded-xl bg-panel2/70 p-4">
        <span className="scale-150"><Ticks pct={pct} /></span>
        <div><div className={cx("num text-2xl font-bold", d.tone === "pos" ? "text-pos" : d.tone === "neg" ? "text-neg" : "")}>{pct > 0 ? "+" : ""}{pct}%</div><div className="text-xs text-muted">vs the value of his expert rank</div></div>
      </div>
      <p className="text-sm">{d.long}</p>
      {custom && ai && <p className="text-xs text-muted">Custom mix: {Math.round(ai.blend.expert * 100)}% expert consensus{ai.blend.sleeper ? ` · ${Math.round(ai.blend.sleeper * 100)}% Sleeper projection` : ""}{ai.blend.market ? ` · ${Math.round(ai.blend.market * 100)}% betting lines` : ""} · {Math.round(ai.blend.factors * 100)}% SHS factors.</p>}
      {moving.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">What moved him</div>
          <ul className="flex flex-col gap-2">
            {moving.map((r) => (
              <li key={r.key} className="rounded-lg border border-line p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2"><b>{label(r.key)}</b><span className={cx("num text-xs font-bold", r.effect > 0 ? "text-pos" : "text-neg")}>{sp(r.effect)}</span></div>
                <div className="text-xs text-muted">{detail(r.key)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {reasons.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">Biggest reasons</div>
          <ul className="flex flex-col gap-2">
            {reasons.map((r) => (
              <li key={r.label} className="rounded-lg border border-line p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2"><b>{r.label}</b><span className={cx("text-xs font-semibold", r.value > 0 ? "text-pos" : "text-neg")}>{r.value > 0 ? "points higher" : "points lower"}</span></div>
                <div className="text-xs text-muted">{r.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!custom && !moving.length && <p className="text-xs text-muted">Nothing with a proven edge pulls him away from where the experts have him.</p>}
      {tracked.length > 0 && (
        <details className="rounded-lg border border-line p-2.5 text-xs">
          <summary className="cursor-pointer font-semibold">Also tracked ({tracked.length}) — no proven edge, so they don&apos;t move the number</summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-muted">{tracked.map((f) => <li key={f.key}><b className="text-fg">{f.label}</b> <span className={f.value > 0.1 ? "text-pos" : f.value < -0.1 ? "text-neg" : ""}>({f.value > 0 ? "+" : ""}{f.value.toFixed(2)})</span> · {f.detail}</li>)}</ul>
        </details>
      )}
      <p className="text-[11px] text-muted">One tick = leans (4–7%), two = clear (8–14%), three = strong (15%+). “=” = agrees with the experts.</p>
    </div>
  );
}

/** College production for young players, when a collegefootballdata.com key is set in Settings. */
export function useCollege(ctx: LeagueContext, rows: { id: string; pos: string }[]): Map<string, CollegeProfile> | null {
  const [data, setData] = useState<Map<string, CollegeProfile> | null>(null);
  const ids = useMemo(() => rows.filter((r) => ["RB", "WR", "TE"].includes(r.pos) && (ctx.players.get(r.id)?.yearsExp ?? 9) <= 3).map((r) => r.id).slice(0, 120), [rows, ctx]);
  const sig = ids.join(",");
  useEffect(() => {
    const key = getSettings().cfbdKey;
    if (!key || !ids.length) return;
    let live = true;
    const season = Number(ctx.league.season);
    collegeProfiles(key, ids.map((id) => {
      const p = ctx.players.get(id)!;
      return { id, name: p.name, pos: p.pos, college: ctx.extras.get(id)?.college ?? null, lastSeason: season - (p.yearsExp ?? 0) - 1 };
    })).then((m) => live && setData(m)).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ctx]);
  return data;
}

/** SHS AI for every ranked player in a scope (weekly includes the kickoff weather forecast). */
export function useShsAiMap(ctx: LeagueContext, scope: RankScope): Map<string, import("@/lib/services/shsai").ShsAi> {
  const w = useShsWeights();
  const w0 = Math.min(ctx.currentWeek, ctx.lastWeek);
  const [wx, setWx] = useState<Map<string, GameWeather> | null>(null);
  useEffect(() => {
    if (scope !== "week") return;
    let live = true;
    weekWeather(ctx.games, w0).then((m) => live && setWx(m)).catch(() => {});
    return () => { live = false; };
  }, [ctx, scope, w0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => shsAi(ctx, rankings(ctx, scope), scope, scope === "week" ? wx : null), [ctx, scope, wx, w]);
}
