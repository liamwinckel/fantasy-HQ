"use client";

/** Settings → SHS AI: how much weight experts, betting markets and each factor get; optional college data key. */
import { useState } from "react";
import { Card, cx } from "@/components/ui";
import { useShsWeights } from "@/components/ShsAiParts";
import { DEFAULT_SHS, getSettings, saveSettings, type ShsWeights } from "@/lib/settings";
import { testCfbdKey } from "@/lib/cfbd";

const FACTORS: [string, string][] = [
  ["ppg", "Points per game"], ["snap", "Snap share"], ["adv", "Opportunity & efficiency"], ["xfp", "Expected points"],
  ["track", "Player tracking"], ["chart", "Film charting"], ["proj", "Projection"],
  ["weather", "Weather"], ["inj", "Injuries & practice"], ["matchup", "Defensive matchup"], ["vegas", "Team implied total"], ["script", "Game script"],
  ["sched", "Schedule ahead"], ["age", "Age cliff"], ["team", "Team situation"], ["coach", "Coaching"], ["usage", "Usage (dynasty)"], ["draft", "Draft & combine"], ["college", "College production"],
];

function Slider({ label, value, min, max, step = 1, suffix = "%", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3rem] items-center gap-3 text-sm">
      <span className="truncate">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--acc)]" />
      <span className="num text-right font-semibold">{suffix === "×" ? `${value.toFixed(2)}×` : `${value}${suffix}`}</span>
    </label>
  );
}

export function ShsSettings() {
  const w = useShsWeights();
  const set = (patch: Partial<ShsWeights>) => saveSettings({ shs: { ...w, ...patch } });
  const t = w.wkExpert + w.wkMarket + w.wkFactors || 1;
  const [key, setKey] = useState(() => (typeof window === "undefined" ? "" : getSettings().cfbdKey ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card title="SHS AI" info={<>SHS AI starts from the expert consensus and moves a player up or down by what the evidence says. These sliders set how much each part counts. Factor weights multiply the default (1.00× = normal, 0 = ignore).</>}>
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Without betting lines</h3>
          <Slider label="Expert consensus" value={w.expert} min={50} max={95} onChange={(v) => set({ expert: v })} />
          <p className="mt-1 text-xs text-muted">{w.expert}% experts · {100 - w.expert}% SHS factors</p>
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">This week, when betting markets have his lines</h3>
          <div className="flex flex-col gap-2">
            <Slider label="Experts" value={w.wkExpert} min={0} max={100} suffix="" onChange={(v) => set({ wkExpert: v })} />
            <Slider label="Betting markets" value={w.wkMarket} min={0} max={100} suffix="" onChange={(v) => set({ wkMarket: v })} />
            <Slider label="SHS factors" value={w.wkFactors} min={0} max={100} suffix="" onChange={(v) => set({ wkFactors: v })} />
          </div>
          <p className="mt-1 text-xs text-muted">= {Math.round((w.wkExpert / t) * 100)}% experts · {Math.round((w.wkMarket / t) * 100)}% markets · {Math.round((w.wkFactors / t) * 100)}% factors</p>
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Factor weights</h3>
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {FACTORS.map(([k, l]) => <Slider key={k} label={l} value={w.factor[k] ?? 1} min={0} max={2} step={0.05} suffix="×" onChange={(v) => set({ factor: { ...w.factor, [k]: v } })} />)}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span><b>Auto-tune from results</b><span className="block text-xs text-muted">After 3 graded weeks, factors that predicted well get up to 1.5× weight; poor ones down to 0.5×.</span></span>
          <button type="button" role="switch" aria-checked={w.autoTune} onClick={() => set({ autoTune: !w.autoTune })}
            className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", w.autoTune ? "bg-acc" : "bg-panel2")}>
            <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", w.autoTune ? "left-6" : "left-1")} />
          </button>
        </label>
        <button type="button" onClick={() => saveSettings({ shs: DEFAULT_SHS })} className="self-start rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">Reset to defaults</button>

        <div className="border-t border-line pt-4">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted">College production (optional)</h3>
          <p className="mb-2 text-xs text-muted">Adds a college-production factor for young RBs, WRs and TEs in dynasty. Needs a free API key from collegefootballdata.com; it stays on this device.</p>
          <div className="flex gap-2">
            <input value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="Paste API key" type="password" autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm" />
            <button type="button" className="rounded-lg bg-acc px-3 py-2 text-sm font-bold text-on-acc" onClick={async () => {
              saveSettings({ cfbdKey: key || null });
              if (!key) { setMsg("Removed"); return; }
              setMsg("Checking…");
              try { setMsg(await testCfbdKey(key)); } catch (e) { setMsg((e as Error).message); }
            }}>Save</button>
          </div>
          {msg && <p className="mt-1.5 text-xs text-muted">{msg}</p>}
        </div>
      </div>
    </Card>
  );
}
