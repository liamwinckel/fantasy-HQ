"use client";

/**
 * iOS-style "swipe from the left edge to go back" for the installed (home-screen) app, which has no browser back
 * gesture of its own. The page follows the finger; let go past a third of the width (or flick) and it slides off,
 * then we navigate. In Safari proper the browser's own gesture is left alone so the two never fight.
 */
import { useEffect, useRef, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";

const EDGE = 24;

export function useEdgeBack(target: RefObject<HTMLElement | null>) {
  const router = useRouter();
  const path = usePathname();
  const depth = useRef(-1);
  const pending = useRef(false);
  const onHome = useRef(path === "/");
  onHome.current = path === "/";

  // Count in-app navigations so "back" knows whether there's somewhere to go back to.
  useEffect(() => {
    depth.current += 1;
    const el = target.current;
    if (el && pending.current) {
      pending.current = false;
      el.style.transition = "none";
      el.style.transform = "";
      el.style.boxShadow = "";
    }
  }, [path, target]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    if (!standalone) return;
    let x0 = 0, y0 = 0, dx = 0, mode: "off" | "idle" | "h" = "off", width = 1;
    let samples: { x: number; t: number }[] = [];
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || t.clientX > EDGE || onHome.current || pending.current) { mode = "off"; return; }
      x0 = t.clientX; y0 = t.clientY; dx = 0; mode = "idle"; width = window.innerWidth;
      samples = [{ x: x0, t: performance.now() }];
    };
    const move = (e: TouchEvent) => {
      if (mode === "off") return;
      const t = e.touches[0];
      const mx = t.clientX - x0, my = t.clientY - y0;
      if (mode === "idle") {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        if (mx <= 0 || Math.abs(my) > Math.abs(mx)) { mode = "off"; return; }
        mode = "h";
        el.style.transition = "none";
        el.style.boxShadow = "-12px 0 24px rgba(0,0,0,.35)";
      }
      e.preventDefault();
      e.stopPropagation();
      dx = Math.max(0, mx);
      el.style.transform = `translate3d(${dx}px,0,0)`;
      samples.push({ x: t.clientX, t: performance.now() });
      if (samples.length > 5) samples.shift();
    };
    const end = () => {
      if (mode !== "h") { mode = "off"; return; }
      mode = "off";
      const a = samples[0], b = samples[samples.length - 1];
      const v = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
      if (dx > width / 3 || v > 0.5) {
        const ms = Math.max(140, Math.min(240, (width - dx) / Math.max(1.2, v)));
        el.style.transition = `transform ${ms}ms cubic-bezier(0.4,0,1,1)`;
        el.style.transform = `translate3d(${width}px,0,0)`;
        pending.current = true;
        window.setTimeout(() => {
          if (depth.current > 0) router.back(); else router.push("/");
          // Safety net: if nothing changes (no history), put the page back.
          window.setTimeout(() => { if (pending.current) { pending.current = false; el.style.transition = "transform 200ms ease-out"; el.style.transform = ""; el.style.boxShadow = ""; } }, 900);
        }, ms);
      } else {
        el.style.transition = "transform 260ms cubic-bezier(0.2,0.9,0.3,1)";
        el.style.transform = "";
        window.setTimeout(() => { el.style.boxShadow = ""; }, 260);
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
  }, [router, target]);
}
