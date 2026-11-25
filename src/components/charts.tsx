"use client";

import { useId, useRef } from "react";
import { reducedMotion, useInView } from "./motion";
import type { LeagueContext } from "@/lib/services/league";

/** Your weekly score vs league average (actual), then projected best lineup for the weeks ahead. */
export function SeasonChart({ ctx, rosterId, selectedWeek }: { ctx: LeagueContext; rosterId: number; selectedWeek: number }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  const weeks = Array.from({ length: ctx.lastWeek }, (_, i) => i + 1);
  const rows = weeks.map((w) => {
    const ms = ctx.matchupsByWeek[w - 1] ?? [];
    const mine = ms.find((m) => m.roster_id === rosterId);
    const played = w < ctx.currentWeek || ctx.seasonOver;
    const avg = ms.length ? ms.reduce((a, m) => a + m.points, 0) / ms.length : 0;
    const proj = !played ? ctx.weekStrength.get(rosterId)?.get(w)?.mean ?? null : null;
    const oppId = mine?.matchup_id ? ms.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== rosterId) : undefined;
    const won = played && mine && oppId ? mine.points > oppId.points : null;
    return { w, actual: played ? mine?.points ?? null : null, avg: played ? avg : null, proj, won };
  });
  const max = Math.max(50, ...rows.map((r) => Math.max(r.actual ?? 0, r.proj ?? 0, r.avg ?? 0))) * 1.08;
  const W = 900, H = 170, padL = 30, padB = 20;
  const bw = (W - padL) / weeks.length;
  const y = (v: number) => H - padB - (v / max) * (H - padB - 10);
  const avgPts = rows.filter((r) => r.avg !== null).map((r, i) => `${padL + (r.w - 1) * bw + bw / 2},${y(r.avg!)}${i === 0 ? "" : ""}`);
  const grow = (i: number) => (seen ? { className: "fhq-grow-y", style: { animationDelay: `${i * 35}ms` } } : { style: { opacity: 0 } });
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weekly scores: actual, league average and projected">
        {[0.5, 1].map((f) => (
          <g key={f}><line x1={padL} x2={W} y1={y((max / 1.08) * f)} y2={y((max / 1.08) * f)} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={0} y={y((max / 1.08) * f) + 3} fontSize="10" fill="var(--muted)">{Math.round((max / 1.08) * f)}</text></g>
        ))}
        {ctx.playoffStart <= ctx.lastWeek && <rect x={padL + (ctx.playoffStart - 1) * bw} y={4} width={(ctx.lastWeek - ctx.playoffStart + 1) * bw} height={H - padB - 4} fill="var(--acc-soft)" opacity="0.5" />}
        {rows.map((r) => {
          const x = padL + (r.w - 1) * bw + bw * 0.2;
          const width = bw * 0.6;
          const sel = r.w === selectedWeek;
          return (
            <g key={r.w}>
              {r.actual !== null && <rect {...grow(r.w)} x={x} y={y(r.actual)} width={width} height={Math.max(1, H - padB - y(r.actual))} rx="3" fill={r.won === false ? "var(--muted)" : "var(--acc)"} opacity={sel ? 1 : 0.85}><title>{`Week ${r.w}: ${r.actual.toFixed(1)}${r.won === null ? "" : r.won ? " (W)" : " (L)"}`}</title></rect>}
              {r.proj !== null && <rect {...grow(r.w)} x={x} y={y(r.proj)} width={width} height={Math.max(1, H - padB - y(r.proj))} rx="3" fill="none" stroke="var(--acc)" strokeDasharray="4 3"><title>{`Week ${r.w}: ${r.proj.toFixed(1)} projected`}</title></rect>}
              {sel && <rect x={x - 3} y={6} width={width + 6} height={H - padB - 4} rx="4" fill="none" stroke="var(--text)" strokeWidth="1.5" />}
              <text x={x + width / 2} y={H - 5} fontSize="10" textAnchor="middle" fill={sel ? "var(--text)" : "var(--muted)"} fontWeight={sel ? 700 : 400}>{r.w}</text>
            </g>
          );
        })}
        {avgPts.length > 1 && <polyline points={avgPts.join(" ")} fill="none" stroke="var(--text)" strokeWidth="1.5" strokeDasharray="2 3" style={{ opacity: seen ? 1 : 0, transition: "opacity 600ms ease 500ms" }} />}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-acc" />Win</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted" />Loss</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-acc" />Projected</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-fg" />League average</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-acc-soft" />Fantasy playoffs</span>
      </div>
    </div>
  );
}

// ---- small generic charts (SVG, theme colours) ----
export type Series = { name: string; color: string; values: (number | null)[]; dash?: boolean; area?: boolean };
const niceMax = (v: number) => { const m = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); return Math.ceil(v / m) * m; };

export function LineChart({ labels, series, height = 200, yMin, yMax, invert = false, fmt = (v: number) => String(Math.round(v)) }: { labels: string[]; series: Series[]; height?: number; yMin?: number; yMax?: number; invert?: boolean; fmt?: (v: number) => string }) {
  const W = 900, H = height, padL = 36, padB = 22, padT = 10;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const lo = yMin ?? Math.min(0, ...all), hi = yMax ?? niceMax(Math.max(1, ...all) * 1.05);
  const x = (i: number) => padL + (labels.length <= 1 ? (W - padL) / 2 : (i * (W - padL - 10)) / (labels.length - 1));
  const y = (v: number) => { const f = (v - lo) / (hi - lo || 1); return padT + (invert ? f : 1 - f) * (H - padB - padT); };
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  const clip = `lc${useId().replace(/:/g, "")}`;
  const still = reducedMotion();
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {/* Lines draw left to right the first time the chart is on screen. */}
        <defs><clipPath id={clip}><rect x={0} y={0} height={H} width={seen && still ? W : 0}>
          {seen && !still && <animate attributeName="width" from="0" to={W} dur="0.9s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1" />}
        </rect></clipPath></defs>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" /><text x={0} y={y(t) + 3} fontSize="10" fill="var(--muted)">{fmt(t)}</text></g>)}
        {labels.map((l, i) => (labels.length <= 18 || i % 2 === 0) && <text key={i} x={x(i)} y={H - 5} fontSize="10" textAnchor="middle" fill="var(--muted)">{l}</text>)}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`));
          const segs: string[][] = []; let cur: string[] = [];
          for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
          if (cur.length) segs.push(cur);
          return (
            <g key={s.name} clipPath={`url(#${clip})`}>
              {s.area && segs.map((g, k) => <polygon key={k} points={`${g[0].split(",")[0]},${y(lo)} ${g.join(" ")} ${g[g.length - 1].split(",")[0]},${y(lo)}`} fill={s.color} opacity="0.12" />)}
              {segs.map((g, k) => <polyline key={k} points={g.join(" ")} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash ? "5 4" : undefined} strokeLinejoin="round" />)}
              {s.values.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color} className={seen ? "fhq-pop" : undefined} style={seen ? { animationDelay: `${(i / Math.max(1, labels.length - 1)) * 800}ms` } : undefined}><title>{`${s.name} · ${labels[i]}: ${fmt(v)}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
    </div>
  );
}

export function Legend({ series }: { series: { name: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2" style={{ borderColor: s.color, borderStyle: s.dash ? "dashed" : "solid" }} />{s.name}</span>)}
    </div>
  );
}

export function StackedBars({ labels, stacks, height = 200 }: { labels: string[]; stacks: { name: string; color: string; values: number[] }[]; height?: number }) {
  const W = 900, H = height, padL = 36, padB = 22;
  const totals = labels.map((_, i) => stacks.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals) * 1.05);
  const bw = (W - padL) / Math.max(1, labels.length);
  const y = (v: number) => H - padB - (v / max) * (H - padB - 8);
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box);
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[0.5, 1].map((f) => <g key={f}><line x1={padL} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeDasharray="3 4" /><text x={0} y={y(max * f) + 3} fontSize="10" fill="var(--muted)">{Math.round(max * f)}</text></g>)}
        {labels.map((l, i) => {
          let acc = 0;
          return (
            <g key={i}>
              {stacks.map((s) => { const v = Math.max(0, s.values[i] ?? 0); const top = acc + v; const el = v > 0 ? <rect key={s.name} className={seen ? "fhq-grow-y" : undefined} style={seen ? { animationDelay: `${i * 40}ms` } : { opacity: 0 }} x={padL + i * bw + bw * 0.18} y={y(top)} width={bw * 0.64} height={y(acc) - y(top)} fill={s.color}><title>{`${l} · ${s.name}: ${v.toFixed(1)}`}</title></rect> : null; acc = top; return el; })}
              <text x={padL + i * bw + bw / 2} y={H - 5} fontSize="10" textAnchor="middle" fill="var(--muted)">{l}</text>
            </g>
          );
        })}
      </svg>
      <Legend series={stacks} />
    </div>
  );
}

/** Horizontal bars, one per row (e.g. odds by team). */
export function HBars({ rows, max, fmt = (v: number) => `${v.toFixed(0)}%`, highlight }: { rows: { key: string | number; label: React.ReactNode; value: number }[]; max?: number; fmt?: (v: number) => string; highlight?: string | number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  const box = useRef<HTMLUListElement>(null);
  const seen = useInView(box);
  return (
    <ul ref={box} className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.25rem] items-center gap-2 text-xs">
          <span className={r.key === highlight ? "truncate font-bold text-fg" : "truncate text-muted"}>{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-panel2"><span className="block h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: seen ? `${Math.max(1.5, (r.value / m) * 100)}%` : "0%", background: r.key === highlight ? "var(--acc)" : "var(--muted)" }} /></span>
          <span className="num text-right font-semibold">{fmt(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Fixed top of the scale for a player's trend line, by position, so every line at a position is drawn on the same
 *  axis (a 25-point week sits at the same height for every WR). Bigger weeks are clipped at the top. */
export const TREND_MAX: Record<string, number> = { QB: 36, RB: 32, WR: 32, TE: 26, K: 18, DEF: 22, DL: 22, LB: 22, DB: 22 };

/**
 * Trend line of recent weekly points on a FIXED scale (min..max, shared by every line of the same kind), with a
 * dashed reference line. The end dot is green when the latest week cleared the reference, red when it didn't.
 * For players the reference is the league's startable line at his position; for teams, the league average.
 */
export function Sparkline({ values, width = 64, height = 18, min = 0, max, refLine, color = "var(--acc)", label }: { values: number[]; width?: number; height?: number; min?: number; max: number; refLine?: number; color?: string; label?: string }) {
  const box = useRef<SVGSVGElement>(null);
  const seen = useInView(box);
  if (values.length < 2) return <svg ref={box} width={width} height={height} aria-hidden />;
  const rng = Math.max(1e-6, max - min);
  const X = (i: number) => 2 + (i * (width - 4)) / (values.length - 1);
  const Y = (v: number) => height - 2 - ((Math.max(min, Math.min(max, v)) - min) / rng) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const good = refLine === undefined ? last >= values.slice(0, -1).reduce((a, b) => a + b, 0) / (values.length - 1) : last >= refLine;
  return (
    <svg ref={box} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" role="img" aria-label={label ?? `Last ${values.length}: ${values.map((v) => v.toFixed(1)).join(", ")}`}>
      <title>{label ?? `Last ${values.length}: ${values.map((v) => v.toFixed(1)).join(", ")}`}</title>
      <line x1={2} x2={width - 2} y1={height - 2} y2={height - 2} stroke="var(--border)" strokeWidth={1} />
      {refLine !== undefined && <line x1={2} x2={width - 2} y1={Y(refLine)} y2={Y(refLine)} stroke="var(--muted)" strokeDasharray="2 2" strokeWidth={1} />}
      <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" className={seen ? "fhq-draw" : undefined} style={seen ? undefined : { opacity: 0 }} />
      <circle cx={X(values.length - 1)} cy={Y(last)} r={2.6} fill={good ? "var(--pos)" : "var(--neg)"} className={seen ? "fhq-pop" : undefined} style={seen ? { animationDelay: "700ms" } : { opacity: 0 }} />
    </svg>
  );
}
