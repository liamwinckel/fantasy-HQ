"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, Home, ListOrdered, Moon, RefreshCw, Scale, Sparkles, Sun, Swords, TrendingUp, Trophy, UserPlus, X } from "lucide-react";
import { BASE_PATH } from "@/lib/net";
import { cx, Logo } from "./ui";
import { usePlayerCard } from "./PlayerCard";
import { useApp } from "./AppData";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"), []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("fhq-theme", next); } catch { /* ignore */ }
  };
  return (
    <button type="button" onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel text-fg hover:bg-panel2">
      {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label, size = "md" }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; size?: "md" | "lg" }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-line bg-panel2 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={cx("flex-1 rounded-md font-semibold transition-colors", size === "lg" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-acc text-on-acc" : "text-muted hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RefreshButton({ compact = false }: { compact?: boolean }) {
  const { refresh, refreshing } = useApp();
  return (
    <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh from Sleeper"
      className="flex h-10 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-xs font-medium hover:bg-panel2 disabled:opacity-60">
      <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} aria-hidden />
      {!compact && (refreshing ? "Syncing…" : "Refresh")}
    </button>
  );
}

const TABS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/matchup", label: "Matchup", icon: Swords },
  { href: "/rankings", label: "Rankings", icon: ListOrdered },
  { href: "/league", label: "League", icon: Trophy },
];

export const QUICK_ACTIONS = [
  { href: "/trade", label: "Trade Analyzer", sub: "Evaluate and compare trades", icon: Scale },
  { href: "/trade-finder", label: "Trade Finder", sub: "Find trade opportunities", icon: ArrowLeftRight },
  { href: "/waivers", label: "Waiver Assistant", sub: "Best pickups for your team", icon: UserPlus },
  { href: "/breakouts", label: "Breakout Finder", sub: "Emerging young players", icon: TrendingUp },
  { href: "/rookies", label: "Rookie Report", sub: "Evaluate this year's rookies", icon: Sparkles },
  { href: "/stats", label: "Stats & Schedule", sub: "Stats, schedules, matchups", icon: BarChart3 },
];

/** Bottom bar on phones: four tabs and the SHS quick-actions button in the middle. */
export function MobileTabs({ keeper }: { keeper: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) && !(href === "/trade" && path.startsWith("/trade-finder")));
  const close = () => {
    if (!open || closing) return;
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 270);
  };
  const toggle = () => (open ? close() : setOpen(true));
  // Grow the card out of the button's centre.
  useEffect(() => {
    if (!open || !card.current || !btn.current) return;
    const b = btn.current.getBoundingClientRect();
    const c = card.current.getBoundingClientRect();
    card.current.style.setProperty("--ox", `${b.left + b.width / 2 - c.left}px`);
    card.current.style.setProperty("--oy", `${b.top + b.height / 2 - c.top}px`);
  }, [open]);
  useEffect(() => { setOpen(false); setClosing(false); }, [path]);
  const tab = ({ href, label, icon: Icon }: (typeof TABS)[number]) => (
    <Link key={href} href={href} onClick={close} className={cx("flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold", isOn(href) && !open ? "text-acc-ink" : "text-muted")}>
      <Icon size={22} aria-hidden />
      {label}
    </Link>
  );
  return (
    <>
      {open && <div className={cx("qa-scrim fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] md:hidden", closing && "qa-closing")} onClick={close} />}
      {open && (
        <div ref={card} role="dialog" aria-label="Quick actions" className={cx("qa-card fixed inset-x-3 bottom-[calc(max(env(safe-area-inset-bottom),8px)+74px)] z-50 rounded-3xl border border-line bg-panel p-3 shadow-2xl md:hidden", closing && "qa-closing")}>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((a, i) => (
              <Link key={a.href} href={a.href} style={{ animationDelay: `${90 + i * 35}ms` }}
                className={cx("qa-tile flex min-h-24 flex-col justify-between rounded-2xl border p-3 active:scale-[0.97]", isOn(a.href) ? "border-acc bg-acc-soft" : "border-line bg-panel2")}>
                <a.icon size={22} className="text-acc-ink" aria-hidden />
                <span><span className="block text-sm font-bold leading-tight">{a.label}</span><span className="block text-[11px] leading-snug text-muted">{a.sub}</span></span>
              </Link>
            ))}
          </div>
          <div className="qa-tile mt-2 flex justify-center gap-4 text-xs font-semibold text-muted" style={{ animationDelay: "320ms" }}>
            {keeper && <Link href="/keepers" className="py-1.5 hover:text-fg">Keeper Planner</Link>}
            <Link href="/methodology" className="py-1.5 hover:text-fg">How it&apos;s calculated</Link>
            <Link href="/settings" className="py-1.5 hover:text-fg">Settings</Link>
          </div>
        </div>
      )}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 flex items-end border-t border-line bg-panel px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 md:hidden">
        {TABS.slice(0, 2).map(tab)}
        <div className="flex flex-1 justify-center">
          <button ref={btn} type="button" onClick={toggle} aria-label={open ? "Close quick actions" : "Quick actions"} aria-expanded={open}
            className={cx("qa-btn -mt-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-bg shadow-lg", open && !closing ? "rotate-90 bg-acc" : "bg-panel2")}>
            {open && !closing
              ? <X size={28} className="text-on-acc" strokeWidth={2.5} />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={`${BASE_PATH}/shs-mark.png`} alt="" width={40} height={40} className="h-10 w-10 object-contain" />}
          </button>
        </div>
        {TABS.slice(2).map(tab)}
      </nav>
    </>
  );
}

export function SideNavLink({ href, label }: { href: string; label: string }) {
  const path = usePathname();
  const on = href === "/" ? path === "/" : path.startsWith(href) && !(href === "/trade" && path.startsWith("/trade-finder"));
  return (
    <Link href={href} className={cx("flex items-center justify-between rounded-lg px-3 py-2 text-sm", on ? "bg-acc-soft font-semibold text-fg" : "text-muted hover:text-fg")}>
      {label}
      {on && <span className="h-1.5 w-1.5 rounded-full bg-acc" />}
    </Link>
  );
}

export function PlayerImg({ id, name, pos, size = 36 }: { id: string; name: string; pos: string; size?: number }) {
  const { open } = usePlayerCard();
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); open(id); }} aria-label={`Open ${name}`} className="shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95">
      <PlayerPhoto id={id} name={name} pos={pos} size={size} />
    </button>
  );
}

export function PlayerPhoto({ id, name, pos, size = 36 }: { id: string; name: string; pos: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const src = pos === "DEF" ? `https://sleepercdn.com/images/team_logos/nfl/${id.toLowerCase()}.png` : `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`;
  if (failed) {
    return <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-panel2 text-[11px] font-bold text-muted">{initials}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} style={{ width: size, height: size }} className="shrink-0 rounded-full bg-panel2 object-cover" />;
}

/** Picks the league every tool works on. Remembered on this device. Shows each league's Sleeper logo. */
export function LeagueSelect({ leagues, current, compact = false }: { leagues: { id: string; name: string; format: string; avatar: string | null }[]; current: string | null; compact?: boolean }) {
  const { selectLeague } = useApp();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!leagues.length) return null;
  const cur = leagues.find((l) => l.id === current) ?? leagues[0];
  const pick = (id: string) => {
    setOpen(false);
    selectLeague(id);
    router.push(path.endsWith("/") ? path : `${path}/`); // drop ?league= and other per-league params
  };
  return (
    <div ref={ref} className={cx("relative", compact && "min-w-0 flex-1")}>
      {!compact && <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">League</div>}
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
        className={cx("flex w-full min-w-0 items-center gap-2 rounded-lg border border-line bg-panel2 text-left font-semibold", compact ? "px-2 py-1.5 text-sm" : "px-2.5 py-2 text-sm")}>
        <Logo src={cur.avatar} name={cur.name} size={compact ? 24 : 28} />
        <span className="min-w-0 flex-1"><span className="block truncate">{cur.name}</span>{!compact && <span className="block truncate text-[11px] font-medium text-muted">{cur.format}</span>}</span>
        <ChevronDown size={16} className={cx("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul role="listbox" className="fhq-in absolute left-0 right-0 z-50 mt-1 min-w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          {leagues.map((l) => (
            <li key={l.id}>
              <button type="button" role="option" aria-selected={l.id === cur.id} onClick={() => pick(l.id)}
                className={cx("flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-panel2", l.id === cur.id && "bg-acc-soft")}>
                <Logo src={l.avatar} name={l.name} size={30} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{l.name}</span><span className="block text-[11px] text-muted">{l.format}</span></span>
                {l.id === cur.id && <Check size={16} className="text-acc-ink" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** ◀ Week N ▶ : keeps other URL params. */
export function WeekNav({ week, current, last, label }: { week: number; current: number; last: number; label: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const go = (w: number) => {
    const p = new URLSearchParams(params.toString());
    p.set("week", String(w));
    router.push(`${path.endsWith("/") ? path : `${path}/`}?${p.toString()}`, { scroll: false });
  };
  const btn = "flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel hover:bg-panel2 disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Choose week">
      <button type="button" className={btn} onClick={() => go(week - 1)} disabled={week <= 1} aria-label="Previous week"><ChevronLeft size={18} /></button>
      <div className="min-w-32 text-center">
        <div className="h-display text-2xl">Week {week}</div>
        <div className={cx("text-[11px] font-semibold uppercase tracking-wider", label === "Live" ? "text-pos" : label === "Final" ? "text-muted" : "text-acc-ink")}>{label}</div>
      </div>
      <button type="button" className={btn} onClick={() => go(week + 1)} disabled={week >= last} aria-label="Next week"><ChevronRight size={18} /></button>
      {week !== current && <button type="button" onClick={() => go(current)} className="rounded-lg px-2 py-1 text-xs font-semibold text-acc-ink underline">This week</button>}
    </div>
  );
}
