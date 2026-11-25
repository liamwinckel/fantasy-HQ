"use client";

import Link from "next/link";
import { ChevronDown, Settings } from "lucide-react";
import { AppProvider, useApp } from "./AppData";
import { LeagueSelect, MobileTabs, QUICK_ACTIONS, RefreshButton, SideNavLink } from "./client";
import { PlayerCardProvider } from "./PlayerCard";
import { TeamPeekProvider } from "./TeamPeek";
import { formatLabel } from "@/lib/services/portfolio";
import { ago } from "@/lib/time";
import { BASE_PATH } from "@/lib/net";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { sleeper } from "@/lib/sleeper/client";
import { Logo, cx } from "./ui";
import { usePathname, useRouter } from "next/navigation";
import { EdgeBackStage } from "./EdgeBack";
import Home from "@/app/page";

const MAIN = [
  { href: "/", label: "Home" },
  { href: "/matchup", label: "Matchup" },
  { href: "/rankings", label: "Rankings" },
  { href: "/league", label: "League" },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <PlayerCardProvider>
        <TeamPeekProvider>
          <Frame>{children}</Frame>
        </TeamPeekProvider>
      </PlayerCardProvider>
    </AppProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { setup, leagueId, synced } = useApp();
  const scroller = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [path]);
  // Belt and braces: if iOS ever scrolls the document (keyboard, tab restore), snap it back so the header stays visible.
  useEffect(() => {
    const reset = () => { if (window.scrollY !== 0 || document.documentElement.scrollTop !== 0) window.scrollTo(0, 0); };
    window.addEventListener("scroll", reset, { passive: true });
    document.addEventListener("focusout", reset);
    window.visualViewport?.addEventListener("resize", reset);
    window.addEventListener("pageshow", reset);
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => {
      window.removeEventListener("scroll", reset);
      document.removeEventListener("focusout", reset);
      window.visualViewport?.removeEventListener("resize", reset);
      window.removeEventListener("pageshow", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);
  const home = path === "/";
  const leagues = (setup?.leagues ?? []).map((l) => ({ id: l.league_id, name: l.name, format: formatLabel(l), avatar: l.avatar ? `https://sleepercdn.com/avatars/thumbs/${l.avatar}` : null }));
  const isKeeper = setup?.leagues.find((l) => l.league_id === leagueId)?.settings.type === 1;
  const tools = [...QUICK_ACTIONS.map((a) => ({ href: a.href, label: a.label })), ...(isKeeper ? [{ href: "/keepers", label: "Keeper Planner" }] : []), { href: "/shs", label: "SHS AI Lab" }];
  return (
    <>
      {/* App shell: the header never moves; only the content area scrolls (no page bounce on iPhone). */}
      <div className="flex h-full overflow-hidden">
        <aside className="hidden h-full w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-panel px-3 py-5 md:flex">
          <Link href="/" className="flex items-center gap-2.5 px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/shs-logo.png`} alt="SHS" width={40} height={40} />
            <span className="h-display text-[22px] leading-none">Fantasy HQ</span>
          </Link>
          <div className="px-1">
            {home ? <UserChip name={setup?.settings.username ?? null} userId={setup?.settings.userId ?? null} leagues={leagues} /> : <LeagueSelect leagues={leagues} current={leagueId} />}
          </div>
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {MAIN.map((i) => <SideNavLink key={i.href} {...i} />)}
          </nav>
          <nav aria-label="Tools" className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Tools</div>
            {tools.map((i) => <SideNavLink key={i.href} {...i} />)}
          </nav>
          <nav aria-label="System" className="mt-auto flex flex-col gap-0.5 border-t border-line pt-4">
            <SideNavLink href="/methodology" label="How it's calculated" />
            <SideNavLink href="/settings" label="Settings" />
            <p className="px-3 pt-3 text-[11px] leading-relaxed text-muted">Data: Sleeper (leagues, projections) · NFLverse (stats). Values are SHS model estimates.</p>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 flex shrink-0 items-center gap-2 border-b border-line bg-bg px-3 pb-2.5 pt-[max(env(safe-area-inset-top),0.625rem)] sm:gap-3 sm:px-6">
            <Link href="/" className="shrink-0 md:hidden" aria-label="Home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/shs-logo.png`} alt="SHS" width={34} height={34} />
            </Link>
            <div className="min-w-0 flex-1 md:hidden">
              {home ? <UserChip name={setup?.settings.username ?? null} userId={setup?.settings.userId ?? null} leagues={leagues} /> : <LeagueSelect leagues={leagues} current={leagueId} compact />}
            </div>
            <div className="hidden items-center gap-2 text-xs text-muted md:flex">
              <span className={synced ? "h-2 w-2 rounded-full bg-pos" : "h-2 w-2 rounded-full bg-muted"} aria-hidden />
              <span>Synced {ago(synced)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 md:ml-auto">
              <RefreshButton compact />
              <Link href="/settings" aria-label="Settings" className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel md:hidden"><Settings size={18} /></Link>
            </div>
          </header>
          <EdgeBackStage under={<Home />}>
          <div ref={scroller} id="fhq-scroll" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none">
            <main className="app-bottom-pad mx-auto w-full max-w-[1320px] px-3 pt-5 sm:px-6"><Boundary>{children}</Boundary></main>
          </div>
          </EdgeBackStage>
        </div>
      </div>
      <MobileTabs keeper={!!isKeeper} />
    </>
  );
}

/** Shows what went wrong instead of a blank screen. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/60 bg-panel p-5 text-sm">
        <div className="h-display text-2xl">Something broke on this screen</div>
        <p className="mt-2 break-words text-muted">{this.state.error.message}</p>
        <button type="button" className="mt-4 rounded-lg bg-acc px-4 py-2 font-bold text-on-acc" onClick={() => { this.setState({ error: null }); location.reload(); }}>Reload</button>
      </div>
    );
  }
}

/**
 * On the all-leagues home there's no single league to pick, so this shows who's signed in, with a faded stack of the
 * league logos filling the spare room (spread out when the name is short, overlapping when it's long). Tap it to pick
 * a league and jump straight into that league's matchup.
 */
function UserChip({ name, userId, leagues }: { name: string | null; userId: string | null; leagues: { id: string; name: string; format: string; avatar: string | null }[] }) {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { selectLeague } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (!userId) return;
    let live = true;
    sleeper.user(userId).then((r) => {
      const a = r.data.avatar;
      if (live && a) setAvatar(`https://sleepercdn.com/avatars/thumbs/${a}`);
    }).catch(() => {});
    return () => { live = false; };
  }, [userId]);
  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); };
  }, []);
  const n = leagues.length;
  const pick = (id: string) => { setOpen(false); selectLeague(id); router.push(`/matchup/?league=${id}`); };
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label="Choose a league"
        className="flex w-full min-w-0 items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-2.5 text-left">
        <Logo src={avatar} name={name ?? "?"} size={32} />
        <span className="min-w-0 shrink leading-tight"><span className="block truncate text-sm font-bold">@{name ?? "Sleeper"}</span><span className="block text-[10px] text-muted">{n} league{n === 1 ? "" : "s"}</span></span>
        {/* Faded league logos: spacing adapts to the room left (container query units). */}
        <span aria-hidden className="flex min-w-0 flex-1 items-center justify-end overflow-hidden pl-1 opacity-45 [container-type:inline-size]">
          {leagues.map((l, i) => (
            <span key={l.id} className="shrink-0 rounded-full ring-2 ring-panel" style={{ marginLeft: i === 0 ? 0 : `clamp(-14px, calc((100cqw - ${n * 22}px) / ${Math.max(1, n - 1)}), 6px)`, zIndex: n - i }}>
              <Logo src={l.avatar} name={l.name} size={22} />
            </span>
          ))}
        </span>
        <ChevronDown size={15} className={cx("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul role="listbox" className="fhq-in absolute left-0 right-0 z-50 mt-1 min-w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <li className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Open a league&apos;s matchup</li>
          {leagues.map((l) => (
            <li key={l.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => pick(l.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-panel2 active:bg-panel2">
                <Logo src={l.avatar} name={l.name} size={30} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{l.name}</span><span className="block text-[11px] text-muted">{l.format}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
