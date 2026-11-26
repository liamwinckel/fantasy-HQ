"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { History, ArrowLeftRight, BarChart3, ClipboardList, MessageCircle, Newspaper, Users, Check, ChevronDown, ChevronLeft, ChevronRight, Home, ListOrdered, Moon, RefreshCw, Scale, Sparkles, Sun, Trophy, UserPlus, X } from "lucide-react";
import { BASE_PATH } from "@/lib/net";
import { cx, Logo } from "./ui";
import { usePlayerCard } from "./PlayerCard";
import { useApp } from "./AppData";

/** Appearance setting (Settings page): dark or light. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"), []);
  const pick = (next: "dark" | "light") => {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("fhq-theme", next); } catch { /* ignore */ }
  };
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 font-semibold">{theme === "dark" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}Appearance</span>
      <div className="w-44"><Segmented label="Appearance" value={theme} onChange={pick} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} /></div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label, size = "md" }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; size?: "md" | "lg" }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  return (
    <div role="group" aria-label={label} className="relative isolate flex rounded-lg border border-line bg-panel2 p-0.5">
      {/* sliding highlight */}
      <span aria-hidden className="absolute inset-y-0.5 left-0.5 -z-10 rounded-md bg-acc transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `calc((100% - 4px) / ${n})`, transform: `translateX(${i * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={cx("flex-1 whitespace-nowrap rounded-md font-semibold transition-colors duration-200", size === "lg" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "text-on-acc" : "text-muted hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Bigger two-line switch (title + small subtitle) with a sliding highlight. Equal-width cells that never
 * truncate: titles stay short, detail goes in the subtitle.
 */
export function TabSwitch<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  return (
    <div role="tablist" aria-label={label} className="relative isolate grid w-full max-w-md rounded-2xl border border-line bg-panel2 p-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute inset-y-1 left-1 -z-10 rounded-xl bg-acc shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `calc((100% - 8px) / ${n})`, transform: `translateX(${i * 100}%)` }} />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={cx("flex min-w-0 flex-col items-center justify-center rounded-xl px-2 py-2 text-center transition-colors duration-200", on ? "text-on-acc" : "text-muted hover:text-fg")}>
            <span className="text-sm font-bold leading-tight">{o.label}</span>
            {o.sub && <span className={cx("mt-0.5 text-[10px] leading-tight", on ? "text-on-acc/75" : "text-muted")}>{o.sub}</span>}
          </button>
        );
      })}
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
  { href: "/", label: "Home", icon: Home },
  { href: "/matchup", label: "Matchup", icon: ScoreboardIcon },
  { href: "/rankings", label: "Rankings", icon: ListOrdered },
  { href: "/league", label: "League", icon: Trophy },
];

export const QUICK_ACTIONS = [
  { href: "/start-sit", label: "Start / Sit", sub: "Compare 2–4 players", icon: Users },
  { href: "/waivers", label: "Waivers", sub: "Pickups + 4-week plan", icon: UserPlus },
  { href: "/trade", label: "Trade Analyzer", sub: "Evaluate a trade", icon: Scale },
  { href: "/trade-finder", label: "Trade Finder", sub: "Deals they'd accept", icon: ArrowLeftRight },
  { href: "/mock-draft", label: "Mock Draft", sub: "Your league's format", icon: ClipboardList },
  { href: "/brief", label: "Weekly Brief", sub: "Recap and preview", icon: Newspaper },
  { href: "/history", label: "League History", sub: "Trades, drafts, FAAB", icon: History },
  { href: "/rookies", label: "Rookies", sub: "This year's class", icon: Sparkles },
  { href: "/stats", label: "Stats", sub: "Stats and schedule", icon: BarChart3 },
];
export const ASK = { href: "/ask", label: "Ask SHS", sub: "Ask anything about your league", icon: MessageCircle };

/** Matchup tab: a scoreboard (7 : 3), drawn in the same stroke style as the other tab icons. */
export function ScoreboardIcon({ size = 24, className, strokeWidth = 2 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="4.5" width="20" height="15" rx="2.5" />
      <circle cx="12" cy="10" r="0.5" fill="currentColor" />
      <circle cx="12" cy="14" r="0.5" fill="currentColor" />
      <path d="M5.6 9h3.2l-2.2 6" />
      <path d="M15.2 9h3.2l-1.8 2.6c1.2 0 1.9.7 1.9 1.7 0 1.1-.8 1.7-1.9 1.7-.6 0-1.1-.2-1.5-.6" />
    </svg>
  );
}

/** Football in the app's icon style (stroke-drawn, like the other icons). */
export function FootballIcon({ size = 24, className, strokeWidth = 2 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 20Q2.5 5 20 4Q21.5 19 4 20Z" />
      <path d="M5.6 15.4 8.6 18.4" />
      <path d="M15.4 5.6 18.4 8.6" />
      <path d="M9.6 14.4 14.4 9.6" />
      <path d="M10.1 12.1 11.9 13.9" />
      <path d="M12.1 10.1 13.9 11.9" />
    </svg>
  );
}

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
          <div className="grid grid-cols-3 gap-2">
            {QUICK_ACTIONS.map((a, i) => (
              <Link key={a.href} href={a.href} style={{ animationDelay: `${90 + i * 30}ms` }}
                className={cx("qa-tile flex min-h-[5.5rem] flex-col justify-between rounded-2xl border p-2.5 active:scale-[0.97]", isOn(a.href) ? "border-acc bg-acc-soft" : "border-line bg-panel2")}>
                <a.icon size={20} className="text-acc-ink" aria-hidden />
                <span><span className="block text-[13px] font-bold leading-tight">{a.label}</span><span className="block text-[10px] leading-snug text-muted">{a.sub}</span></span>
              </Link>
            ))}
          </div>
          <div className="qa-tile mt-2 flex justify-center gap-4 text-xs font-semibold text-muted" style={{ animationDelay: "320ms" }}>
            <Link href="/methodology" className="py-1.5 hover:text-fg">How it&apos;s calculated</Link>
            <Link href="/shs" className="py-1.5 hover:text-fg">SHS AI Lab</Link>
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
              : <img src={`${BASE_PATH}/shs-h.png`} alt="" width={40} height={40} className="h-10 w-10 object-contain" />}
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
