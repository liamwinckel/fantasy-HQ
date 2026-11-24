"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { AppProvider, useApp } from "./AppData";
import { LeagueSelect, MobileTabs, QUICK_ACTIONS, RefreshButton, SideNavLink, ThemeToggle } from "./client";
import { PlayerCardProvider } from "./PlayerCard";
import { TeamPeekProvider } from "./TeamPeek";
import { formatLabel } from "@/lib/services/portfolio";
import { ago } from "@/lib/time";
import { BASE_PATH } from "@/lib/net";
import { Component, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/", label: "Dashboard" },
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
  const leagues = (setup?.leagues ?? []).map((l) => ({ id: l.league_id, name: l.name, format: formatLabel(l), avatar: l.avatar ? `https://sleepercdn.com/avatars/thumbs/${l.avatar}` : null }));
  const isKeeper = setup?.leagues.find((l) => l.league_id === leagueId)?.settings.type === 1;
  const tools = [...QUICK_ACTIONS.map((a) => ({ href: a.href, label: a.label })), ...(isKeeper ? [{ href: "/keepers", label: "Keeper Planner" }] : [])];
  return (
    <>
      {/* App shell: the header never moves; only the content area scrolls (no page bounce on iPhone). */}
      <div className="flex h-[100dvh] overflow-hidden">
        <aside className="hidden h-full w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-panel px-3 py-5 md:flex">
          <Link href="/" className="flex items-center gap-2.5 px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/shs-mark.png`} alt="SHS" width={40} height={40} />
            <span className="h-display text-[22px] leading-none">Fantasy HQ</span>
          </Link>
          <div className="px-1">
            <LeagueSelect leagues={leagues} current={leagueId} />
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
            <Link href="/" className="shrink-0 md:hidden" aria-label="Dashboard">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/shs-mark.png`} alt="SHS" width={34} height={34} />
            </Link>
            <div className="min-w-0 flex-1 md:hidden">
              <LeagueSelect leagues={leagues} current={leagueId} compact />
            </div>
            <div className="hidden items-center gap-2 text-xs text-muted md:flex">
              <span className={synced ? "h-2 w-2 rounded-full bg-pos" : "h-2 w-2 rounded-full bg-muted"} aria-hidden />
              <span>Synced {ago(synced)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 md:ml-auto">
              <RefreshButton compact />
              <Link href="/settings" aria-label="Settings" className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel md:hidden"><Settings size={18} /></Link>
              <ThemeToggle />
            </div>
          </header>
          <div ref={scroller} id="fhq-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <main className="mx-auto w-full max-w-[1320px] px-3 pb-32 pt-5 sm:px-6 md:pb-10"><Boundary>{children}</Boundary></main>
          </div>
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
