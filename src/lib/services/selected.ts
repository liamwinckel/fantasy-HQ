/** Week from the URL (?week=), clamped to the season; defaults to this week. */
export function parseWeek(raw: string | undefined, ctx: { currentWeek: number; lastWeek: number; seasonOver: boolean }) {
  const def = ctx.seasonOver ? ctx.lastWeek : Math.min(ctx.currentWeek, ctx.lastWeek);
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= ctx.lastWeek ? n : def;
}
