"use client";

/** Shared SHS AI pieces: the plain-language explainer, the ±% chip, and optional college data. */
import { useEffect, useMemo, useState } from "react";
import { cx } from "./ui";
import { DEFAULT_SHS, getSettings, type ShsWeights } from "@/lib/settings";
import { SHS_METRICS, shsAi } from "@/lib/services/shsai";
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

/** What SHS AI is, in plain terms: the blend and the metrics it weighs. */
export function ShsExplainer({ scope }: { scope: RankScope }) {
  const w = useShsWeights();
  const t = w.wkExpert + w.wkMarket + w.wkFactors || 1;
  const pc = (x: number) => `${Math.round((x / t) * 100)}%`;
  const list = [...SHS_METRICS.all, ...SHS_METRICS[scope]];
  return (
    <div className="text-xs leading-relaxed text-muted">
      <p className="text-fg"><b>SHS AI</b> starts from the expert consensus rank and asks: does the evidence agree?</p>
      <p className="mt-1.5">
        {scope === "week"
          ? <>When betting markets have lines on a player this week, the score is <b className="text-fg">{pc(w.wkExpert)} experts · {pc(w.wkMarket)} betting markets · {pc(w.wkFactors)} SHS factors</b>. Otherwise it&apos;s <b className="text-fg">{w.wkNoMkt}% experts · {100 - w.wkNoMkt}% SHS factors</b>, the mix that tested best over every week since 2021.</>
          : <>The score is <b className="text-fg">{w.expert}% experts · {100 - w.expert}% SHS factors</b>.</>}
        {" "}Each factor compares him with players ranked near him at his position, from −1 (points to worse) to +1 (better).
      </p>
      <p className="mt-1.5">The verdict says how far it moves him: <b className="text-pos">▲▲ Strong buy</b> (12%+ more valuable than his expert rank), <b className="text-pos">▲ Buy</b> (4–11%), <b>= Agree</b>, <b className="text-neg">▼ Fade</b>, <b className="text-neg">▼▼ Strong fade</b>. In Rankings the arrow number is how many spots SHS AI moves him at his position (▲3 = three spots higher than the experts).</p>
      <p className="mt-2 font-semibold text-fg">What it looks at{scope === "week" ? " this week" : scope === "ros" ? " for the rest of the season" : " in dynasty"}:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">{list.map((m) => <li key={m}>{m}</li>)}</ul>
      <p className="mt-2">Weights can be changed in Settings → SHS AI. Results are graded each week, and factors that predict well gain weight.</p>
    </div>
  );
}

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

/** Compact verdict chip: ▲ Buy / = Agree / ▼ Fade. */
export function AiChip({ v, className, label }: { v: number | null | undefined; className?: string; label?: boolean }) {
  const d = shsVerdict(v);
  if (!d) return null;
  return (
    <span title={d.long} className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold", d.tone === "pos" ? "bg-pos/15 text-pos" : d.tone === "neg" ? "bg-neg/15 text-neg" : "bg-panel2 text-muted", className)}>
      {label && <span className="font-semibold opacity-75">SHS</span>}<span aria-hidden>{d.arrow}</span>{d.word}
    </span>
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
