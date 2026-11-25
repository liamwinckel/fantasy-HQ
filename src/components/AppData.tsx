"use client";

/**
 * Loads everything in the browser: the Sleeper user's leagues (Setup) and the selected league's full model (LeagueContext).
 * Pages read it with useLeagueData() / <LeaguePage>.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loadSetup, type Setup } from "@/lib/services/portfolio";
import { clearLeagueContexts, getLeagueContext, type LeagueContext, type TeamInfo } from "@/lib/services/league";
import { effectiveMode, getSettings, saveSettings } from "@/lib/settings";
import { forgetMemo, lastSync } from "@/lib/cache";
import type { League } from "@/lib/sleeper/types";
import { Onboarding } from "./Onboarding";
import { Notice } from "./ui";
import Link from "next/link";

interface AppState {
  setup: Setup | null;
  setupError: string | null;
  leagueId: string | null;
  ctx: LeagueContext | null;
  ctxFor: string | null;
  ctxError: string | null;
  loadingCtx: boolean;
  synced: number | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  selectLeague: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<LeagueContext | null>(null);
  const [ctxFor, setCtxFor] = useState<string | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [synced, setSynced] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const forceNext = useRef(false);
  const params = useSearchParams();
  const urlLeague = params.get("league");

  const loadAll = useCallback(async (force: boolean) => {
    try {
      const s = await loadSetup(force);
      setSetup(s);
      setSetupError(null);
    } catch (e) {
      setSetupError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setPicked(getSettings().selectedLeague);
    loadAll(false);
    const onSettings = () => { setVersion((v) => v + 1); loadAll(false); };
    window.addEventListener("fhq-settings", onSettings);
    return () => window.removeEventListener("fhq-settings", onSettings);
  }, [loadAll]);

  const leagueId = useMemo(() => {
    if (!setup) return null;
    const ids = setup.leagues.map((l) => l.league_id);
    return [urlLeague, picked].find((id) => id && ids.includes(id)) ?? ids[0] ?? null;
  }, [setup, urlLeague, picked]);

  useEffect(() => {
    if (urlLeague && setup?.leagues.some((l) => l.league_id === urlLeague) && urlLeague !== getSettings().selectedLeague) {
      saveSettings({ selectedLeague: urlLeague });
    }
  }, [urlLeague, setup]);

  useEffect(() => {
    if (!setup || !leagueId || !setup.settings.userId) return;
    const league = setup.leagues.find((l) => l.league_id === leagueId)!;
    let live = true;
    const force = forceNext.current;
    forceNext.current = false;
    setLoadingCtx(true);
    setCtxError(null);
    getLeagueContext(leagueId, { userId: setup.settings.userId, mode: effectiveMode(setup.settings, leagueId, league.settings.type), force })
      .then((c) => { if (live) { setCtx(c); setCtxFor(leagueId); } })
      .catch((e) => { if (live) { setCtxError((e as Error).message); setCtxFor(leagueId); setCtx(null); } })
      .finally(async () => { if (live) { setLoadingCtx(false); setSynced(await lastSync()); } });
    return () => { live = false; };
  }, [setup, leagueId, version]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    forgetMemo();
    clearLeagueContexts();
    forceNext.current = true;
    await loadAll(true);
    setVersion((v) => v + 1);
    setRefreshing(false);
  }, [loadAll]);

  const selectLeague = useCallback((id: string) => {
    setPicked(id);
    saveSettings({ selectedLeague: id });
  }, []);

  return (
    <Ctx.Provider value={{ setup, setupError, leagueId, ctx: ctxFor === leagueId ? ctx : null, ctxFor, ctxError: ctxFor === leagueId ? ctxError : null, loadingCtx, synced, refreshing, refresh, selectLeague }}>
      {children}
    </Ctx.Provider>
  );
}

export type SearchParams = Record<string, string | undefined>;

export interface LeagueData {
  setup: Setup;
  league: League;
  ctx: LeagueContext;
  me: TeamInfo | undefined;
  sp: SearchParams;
}

/** URL query as a plain object, plus a helper to change it. */
export function useQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const sp = useMemo(() => Object.fromEntries(params.entries()) as SearchParams, [params]);
  const set = useCallback((patch: SearchParams, replace = false) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v === undefined || v === "" ? p.delete(k) : p.set(k, v));
    const q = p.toString();
    const base = path.endsWith("/") ? path : `${path}/`;
    (replace ? router.replace : router.push)(`${base}${q ? `?${q}` : ""}`, { scroll: false });
  }, [params, router, path]);
  return { sp, set };
}

/** Wraps a league tool page: handles first-run setup, loading and errors, then renders with the league's data. */
export function LeaguePage({ children }: { children: (d: LeagueData) => ReactNode }) {
  const app = useApp();
  const { sp } = useQuery();
  const { setup } = app;
  if (!setup) return app.setupError ? <Notice tone="warn">{app.setupError}</Notice> : <Loading label="Connecting to Sleeper" />;
  if (!setup.settings.userId) return <Onboarding suggested="L1am" />;
  const league = setup.leagues.find((l) => l.league_id === app.leagueId);
  if (!league) return <Notice tone="warn">No leagues found for {setup.settings.username}. Add one in <Link href="/settings" className="underline">Settings</Link>.{setup.errors.length ? ` ${setup.errors.join(" ")}` : ""}</Notice>;
  if (app.ctxError) return <Notice tone="warn">Couldn&apos;t load {league.name}: {app.ctxError}</Notice>;
  if (!app.ctx) return <Loading label={`Crunching ${league.name}`} />;
  const me = app.ctx.teams.find((t) => t.rosterId === app.ctx!.myRosterId);
  return <>{children({ setup, league, ctx: app.ctx, me, sp })}</>;
}

export function Loading({ label }: { label: string }) {
  // Placeholder shaped like a league screen: header band, a score card and list rows, with a soft shimmer.
  // Fades in only if loading takes longer than ~200 ms, so quick loads never flash it.
  return (
    <div className="sk-late flex flex-col gap-4" aria-busy="true" aria-label={`${label}…`}>
      <div className="flex items-center gap-3">
        <div className="sk h-11 w-11 rounded-xl" />
        <div className="flex-1"><div className="sk h-5 w-2/3" /><div className="sk mt-2 h-3 w-1/3" /></div>
        <div className="sk h-7 w-12" />
      </div>
      <div className="sk h-11 rounded-2xl" />
      <div className="rounded-2xl border border-line bg-panel p-4">
        <div className="mx-auto sk h-6 w-32" />
        <div className="mt-5 flex justify-between"><div><div className="sk h-10 w-10 rounded-full" /><div className="sk mt-3 h-10 w-28" /></div><div className="flex flex-col items-end"><div className="sk h-10 w-10 rounded-full" /><div className="sk mt-3 h-10 w-28" /></div></div>
        <div className="sk mt-5 h-3 rounded-full" />
        <ul className="mt-5 flex flex-col gap-3">
          {[64, 52, 70, 46, 58].map((w, i) => (
            <li key={i} className="flex items-center gap-3"><div className="sk h-8 w-8 rounded-full" /><div className="flex-1"><div className="sk h-3" style={{ width: `${w}%` }} /><div className="sk mt-1.5 h-2.5 w-1/3" /></div><div className="sk h-5 w-12" /></li>
          ))}
        </ul>
      </div>
      <p className="text-center text-[11px] text-muted">{label}… first load downloads this season&apos;s data; later loads are instant.</p>
    </div>
  );
}

/** Run an async job when deps change (e.g. keeper plans that need the draft). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: (e as Error).message, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
