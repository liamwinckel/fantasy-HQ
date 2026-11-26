"use client";

/**
 * Home: which of your players are on the field today, and when. One slim, swipeable row: each game slot shows the
 * kickoff, the two teams and the faces of your players in it (yellow ring = starting somewhere, faded = bench only).
 * No games today → a single line pointing at the next game day.
 */
import type { LeagueContext } from "@/lib/services/league";
import type { Game } from "@/lib/nflverse/types";
import { cx, NflLogo } from "@/components/ui";
import { PlayerImg } from "@/components/client";

const ET = "America/New_York";
const dayET = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const kickMs = (k: string) => { const m = Number(k.slice(5, 7)); return Date.parse(`${k.replace(" ", "T").slice(0, 16)}:00${m >= 4 && m <= 10 ? "-04:00" : "-05:00"}`); };
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

interface Mine { id: string; name: string; pos: string; starting: boolean }
interface Slot { game: Game; at: number; mine: Mine[]; live: boolean; final: boolean }

export function OnToday({ ctxs }: { ctxs: LeagueContext[] }) {
  const active = ctxs.filter((c) => c.myRosterId !== null && !c.seasonOver);
  if (!active.length) return null;
  // Every player you roster (any league), and whether he's in a starting lineup anywhere.
  const owned = new Map<string, Mine>();
  for (const c of active) {
    const team = c.teams.find((t) => t.rosterId === c.myRosterId);
    if (!team) continue;
    const set = c.matchupsThisWeek.find((m) => m.roster_id === c.myRosterId)?.starters ?? c.lineups.get(team.rosterId)?.optimal.map((s) => s.playerId) ?? [];
    for (const id of team.players) {
      const p = c.players.get(id);
      if (!p?.team) continue;
      const prev = owned.get(id);
      owned.set(id, { id, name: p.name, pos: p.pos, starting: !!prev?.starting || set.includes(id) });
    }
  }
  const byTeam = new Map<string, Mine[]>();
  for (const m of owned.values()) {
    const team = active.map((c) => c.players.get(m.id)?.team).find(Boolean)!;
    (byTeam.get(team) ?? byTeam.set(team, []).get(team)!).push(m);
  }
  const games = active[0].games.filter((g) => g.kickoff).map((g) => ({ g, at: kickMs(g.kickoff!) })).filter((x) => Number.isFinite(x.at));
  const now = Date.now(), today = dayET(new Date());
  const slotsFor = (day: string): Slot[] => games.filter((x) => dayET(new Date(x.at)) === day).map(({ g, at }) => ({
    game: g, at,
    mine: [...(byTeam.get(g.away) ?? []), ...(byTeam.get(g.home) ?? [])].sort((a, b) => Number(b.starting) - Number(a.starting)),
    final: g.homeScore != null && now > at + 3 * 3600_000, live: now >= at && !(g.homeScore != null && now > at + 3.5 * 3600_000) && now < at + 4 * 3600_000,
  })).filter((s) => s.mine.length).sort((a, b) => a.at - b.at);

  const slots = slotsFor(today);
  if (!slots.length) {
    // Next game day with any of your players.
    const next = games.filter((x) => x.at > now).sort((a, b) => a.at - b.at).map((x) => dayET(new Date(x.at))).find((d) => slotsFor(d).length);
    if (!next) return null;
    const ns = slotsFor(next);
    const n = new Set(ns.flatMap((s) => s.mine.map((m) => m.id))).size;
    const label = new Date(ns[0].at).toLocaleDateString([], { weekday: "long" });
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-2.5 text-sm">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">Next up</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{label} · {timeLabel(ns[0].at)} <span className="text-muted">· {n} of your players</span></span>
      </div>
    );
  }
  const total = new Set(slots.flatMap((s) => s.mine.map((m) => m.id))).size;
  return (
    <section className="rounded-2xl border border-line bg-panel py-2.5">
      <div className="flex items-baseline justify-between px-4">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-acc-ink">On today</span>
        <span className="text-[11px] text-muted">{total} player{total > 1 ? "s" : ""}</span>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
        {slots.map((s) => (
          <div key={`${s.game.away}${s.game.home}`} className={cx("flex shrink-0 items-center gap-2.5 rounded-xl border bg-panel2 px-2.5 py-2", s.live ? "border-acc/50" : "border-line", s.final && "opacity-50")}>
            <div className="flex flex-col items-center gap-0.5">
              <span className={cx("num whitespace-nowrap text-[11px] font-bold", s.live ? "text-acc-ink" : "text-fg")}>{s.live ? "Live" : s.final ? "Final" : timeLabel(s.at)}</span>
              <span className="flex items-center gap-0.5"><NflLogo team={s.game.away} size={14} textFallback /><span className="text-[9px] text-muted">@</span><NflLogo team={s.game.home} size={14} textFallback /></span>
            </div>
            <div className="flex -space-x-1">
              {s.mine.slice(0, 5).map((m) => (
                <span key={m.id} className={cx("rounded-full ring-2", m.starting ? "ring-acc" : "opacity-55 ring-panel2")}><PlayerImg id={m.id} name={m.name} pos={m.pos} size={28} /></span>
              ))}
              {s.mine.length > 5 && <span className="num grid h-7 w-7 place-items-center rounded-full bg-panel text-[10px] font-bold text-muted ring-2 ring-panel2">+{s.mine.length - 5}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
