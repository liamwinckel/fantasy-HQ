"use client";

/**
 * Native-feeling "swipe from the left edge to go back" for the installed (home-screen) app.
 *
 * iOS gives home-screen web apps Safari's own back swipe whenever there is browser history, and that's the
 * "web page" slide-and-flash. So in the installed app we keep the browser history to a single entry (every
 * navigation replaces instead of pushes) and track the in-app trail ourselves. With no browser history iOS
 * has nothing to swipe back to, and this gesture takes over: the page follows your finger while the
 * previous screen (Home, rendered live underneath) eases in from behind, like a native navigation stack.
 * In Safari proper nothing changes; the browser's gesture is left alone.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const EDGE = 30;
const KEY = "fhq-trail";

const isStandalone = () =>
  typeof window !== "undefined" &&
  ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches);

const readTrail = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "[]"); } catch { return []; }
};
const writeTrail = (t: string[]) => {
  try { sessionStorage.setItem(KEY, JSON.stringify(t.slice(-30))); } catch { /* private mode */ }
};
const pathOf = (url: string) => url.split("?")[0].replace(/\/$/, "") || "/";

let patched = false;
/** Installed app only: make every navigation replace the current history entry. */
function keepSingleHistoryEntry() {
  if (patched || !isStandalone()) return;
  patched = true;
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => history.replaceState(data, unused, url);
}

/** The in-app trail of screens, plus the screen you'd go back to. */
export function useTrail() {
  const path = usePathname();
  const params = useSearchParams();
  const url = `${path}${params.toString() ? `?${params}` : ""}`;
  const [prev, setPrev] = useState<string | null>(null);
  useLayoutEffect(() => {
    keepSingleHistoryEntry();
    let t = readTrail();
    if (t.length >= 2 && t[t.length - 2] === url) t = t.slice(0, -1); // went back
    else if (t.length && pathOf(t[t.length - 1]) === pathOf(url)) t[t.length - 1] = url; // same screen, new tab/week
    else t = [...t, url];
    writeTrail(t);
    setPrev(t.length >= 2 ? t[t.length - 2] : path === "/" ? null : "/");
  }, [url, path]);
  return { url, prev };
}

/** Go back one screen in the in-app trail (falls back to Home). */
export function useGoBack() {
  const router = useRouter();
  return () => {
    const t = readTrail();
    const target = t.length >= 2 ? t[t.length - 2] : "/";
    if (isStandalone()) router.push(target);
    else if (window.history.length > 1) router.back();
    else router.push(target);
  };
}

/**
 * Wraps the scrolling page. `under` renders the previous screen when that's Home, so it can be revealed
 * during the swipe; other screens get a dimmed backdrop.
 */
export function EdgeBackStage({ children, under }: { children: ReactNode; under: ReactNode }) {
  const { prev, url } = useTrail();
  const page = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const goBack = useGoBack();
  const pending = useRef(false);
  const showHome = prev !== null && pathOf(prev) === "/";
  const enabled = prev !== null;

  // After navigating, put the page back in place before the browser paints (no flash).
  useLayoutEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    reset(page, back, shade, false);
  }, [url]);

  useEdgeGesture({ page, back, shade, enabled, pending, onCommit: goBack });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={back} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-bg" style={{ visibility: "hidden" }}>
        {showHome && <div className="app-bottom-pad mx-auto w-full max-w-[1320px] px-3 pt-5 sm:px-6">{under}</div>}
        <div ref={shade} className="absolute inset-0 bg-black" style={{ opacity: 0.35 }} />
      </div>
      <div ref={page} className="relative z-10 flex min-h-0 flex-1 flex-col bg-bg">{children}</div>
    </div>
  );
}

function reset(page: RefObject<HTMLDivElement | null>, back: RefObject<HTMLDivElement | null>, shade: RefObject<HTMLDivElement | null>, animate: boolean) {
  const p = page.current, b = back.current, s = shade.current;
  if (!p || !b || !s) return;
  const t = animate ? "transform 280ms cubic-bezier(0.2,0.9,0.3,1)" : "none";
  p.style.transition = t; p.style.transform = ""; p.style.boxShadow = "";
  b.style.transition = t; b.style.transform = "";
  s.style.transition = animate ? "opacity 280ms ease-out" : "none"; s.style.opacity = "0.35";
  if (animate) window.setTimeout(() => { b.style.visibility = "hidden"; }, 290);
  else b.style.visibility = "hidden";
}

function useEdgeGesture({ page, back, shade, enabled, pending, onCommit }: {
  page: RefObject<HTMLDivElement | null>; back: RefObject<HTMLDivElement | null>; shade: RefObject<HTMLDivElement | null>;
  enabled: boolean; pending: RefObject<boolean>; onCommit: () => void;
}) {
  const live = useRef({ enabled, onCommit });
  live.current = { enabled, onCommit };
  useEffect(() => {
    if (!isStandalone()) return;
    let x0 = 0, y0 = 0, dx = 0, mode: "off" | "idle" | "h" = "off", width = 1;
    let samples: { x: number; t: number }[] = [];
    const paint = (x: number) => {
      const p = page.current, b = back.current, s = shade.current;
      if (!p || !b || !s) return;
      const k = Math.min(1, x / width);
      p.style.transform = `translate3d(${x}px,0,0)`;
      b.style.transform = `translate3d(${-0.3 * width * (1 - k)}px,0,0)`; // previous screen eases in from behind
      s.style.opacity = String(0.35 * (1 - k));
    };
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!live.current.enabled || pending.current || e.touches.length !== 1 || t.clientX > EDGE) { mode = "off"; return; }
      x0 = t.clientX; y0 = t.clientY; dx = 0; mode = "idle"; width = window.innerWidth;
      samples = [{ x: x0, t: performance.now() }];
    };
    const move = (e: TouchEvent) => {
      if (mode === "off") return;
      const t = e.touches[0];
      const mx = t.clientX - x0, my = t.clientY - y0;
      if (mode === "idle") {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        if (mx <= 0 || Math.abs(my) > Math.abs(mx)) { mode = "off"; return; }
        mode = "h";
        const p = page.current, b = back.current, s = shade.current;
        if (!p || !b || !s) { mode = "off"; return; }
        p.style.transition = b.style.transition = s.style.transition = "none";
        p.style.boxShadow = "-10px 0 30px rgba(0,0,0,.45)";
        b.style.visibility = "visible";
      }
      e.preventDefault();
      e.stopPropagation();
      dx = Math.max(0, mx);
      paint(dx);
      samples.push({ x: t.clientX, t: performance.now() });
      if (samples.length > 5) samples.shift();
    };
    const end = () => {
      if (mode !== "h") { mode = "off"; return; }
      mode = "off";
      const a = samples[0], b = samples[samples.length - 1];
      const v = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
      if (dx > width * 0.35 || (v > 0.45 && dx > 20)) {
        const ms = Math.max(160, Math.min(280, (width - dx) / Math.max(1.1, v)));
        const ease = `${ms}ms cubic-bezier(0.25,0.8,0.35,1)`;
        const p = page.current!, bk = back.current!, s = shade.current!;
        p.style.transition = `transform ${ease}`; bk.style.transition = `transform ${ease}`; s.style.transition = `opacity ${ease}`;
        paint(width);
        pending.current = true;
        window.setTimeout(() => {
          live.current.onCommit();
          // Safety net: if navigation didn't happen, slide the page back.
          window.setTimeout(() => { if (pending.current) { pending.current = false; reset(page, back, shade, true); } }, 1200);
        }, ms);
      } else {
        reset(page, back, shade, true);
      }
    };
    // Capture phase so the week swipe underneath never sees an edge drag.
    window.addEventListener("touchstart", start, { passive: true, capture: true });
    window.addEventListener("touchmove", move, { passive: false, capture: true });
    window.addEventListener("touchend", end, { capture: true });
    window.addEventListener("touchcancel", end, { capture: true });
    return () => {
      window.removeEventListener("touchstart", start, { capture: true });
      window.removeEventListener("touchmove", move, { capture: true });
      window.removeEventListener("touchend", end, { capture: true });
      window.removeEventListener("touchcancel", end, { capture: true });
    };
  }, [page, back, shade, pending]);
}
