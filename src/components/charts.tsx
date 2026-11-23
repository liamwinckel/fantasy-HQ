import type { LeagueContext } from "@/lib/services/league";

/** Your weekly score vs league average (actual), then projected best lineup for the weeks ahead. */
export function SeasonChart({ ctx, rosterId, selectedWeek }: { ctx: LeagueContext; rosterId: number; selectedWeek: number }) {
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
  return (
    <div>
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
              {r.actual !== null && <rect x={x} y={y(r.actual)} width={width} height={Math.max(1, H - padB - y(r.actual))} rx="3" fill={r.won === false ? "var(--muted)" : "var(--acc)"} opacity={sel ? 1 : 0.85}><title>{`Week ${r.w}: ${r.actual.toFixed(1)}${r.won === null ? "" : r.won ? " (W)" : " (L)"}`}</title></rect>}
              {r.proj !== null && <rect x={x} y={y(r.proj)} width={width} height={Math.max(1, H - padB - y(r.proj))} rx="3" fill="none" stroke="var(--acc)" strokeDasharray="4 3"><title>{`Week ${r.w}: ${r.proj.toFixed(1)} projected`}</title></rect>}
              {sel && <rect x={x - 3} y={6} width={width + 6} height={H - padB - 4} rx="4" fill="none" stroke="var(--text)" strokeWidth="1.5" />}
              <text x={x + width / 2} y={H - 5} fontSize="10" textAnchor="middle" fill={sel ? "var(--text)" : "var(--muted)"} fontWeight={sel ? 700 : 400}>{r.w}</text>
            </g>
          );
        })}
        {avgPts.length > 1 && <polyline points={avgPts.join(" ")} fill="none" stroke="var(--text)" strokeWidth="1.5" strokeDasharray="2 3" />}
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
