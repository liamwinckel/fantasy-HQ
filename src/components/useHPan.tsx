"use client";

/**
 * Sideways scrolling for wide boards inside the page (draft boards, big tables). The first finger movement decides
 * the axis: sideways → the board scrolls horizontally (with momentum) and the page is held still; up/down → the
 * page scrolls normally. Native horizontal scrolling inside a vertically scrolling page is unreliable on iOS (it
 * drifts or gets stolen by the page), so the horizontal axis is driven here.
 */
import { useEffect, useRef, type RefObject } from "react";

export function useHPan(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.touchAction = "pan-y";
    let sx = 0, sy = 0, sl = 0, axis: "x" | "y" | null = null, raf = 0, active = false;
    const trail: { t: number; x: number }[] = [];
    // Rubber band: past either end the content stretches (resisting, like iOS) and springs back — never a hard stop.
    const inner = () => el.firstElementChild as HTMLElement | null;
    let over = 0;
    const setOver = (o: number, anim = false) => {
      over = o;
      const c = inner(); if (!c) return;
      c.style.transition = anim ? "transform 420ms cubic-bezier(.2,.9,.3,1.15)" : "none";
      c.style.transform = o ? `translate3d(${o}px,0,0)` : "";
    };
    const maxL = () => el.scrollWidth - el.clientWidth;
    const scrollTo = (target: number) => {
      const m = maxL();
      if (target < 0) { el.scrollLeft = 0; setOver(Math.min(120, -target * 0.35)); }
      else if (target > m) { el.scrollLeft = m; setOver(-Math.min(120, (target - m) * 0.35)); }
      else { el.scrollLeft = target; if (over) setOver(0); }
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelAnimationFrame(raf);
      active = true; axis = null;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; sl = el.scrollLeft; trail.length = 0; trail.push({ t: performance.now(), x: sx });
    };
    const move = (e: TouchEvent) => {
      if (!active || e.touches.length !== 1) return;
      const x = e.touches[0].clientX, dx = x - sx, dy = e.touches[0].clientY - sy;
      if (!axis) {
        if (dx === 0 && dy === 0) return;
        axis = Math.abs(dx) >= Math.abs(dy) && el.scrollWidth > el.clientWidth + 1 ? "x" : "y";
      }
      if (axis !== "x") return;
      e.preventDefault();
      const now = performance.now();
      trail.push({ t: now, x }); while (trail.length > 2 && now - trail[0].t > 80) trail.shift();
      // A little extra reach per finger-pixel so long boards don't feel heavy.
      scrollTo(sl - dx * 1.15);
    };
    const end = () => {
      if (!active) return;
      active = false;
      if (axis !== "x") return;
      if (over) { setOver(0, true); return; } // released while stretched: spring back
      // Fling speed from the last ~80ms of movement (px per frame), with iOS-like momentum and friction.
      const a = trail[0], b = trail[trail.length - 1];
      let vel = b && a && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 16 * 1.6 : 0;
      if (performance.now() - (b?.t ?? 0) > 60) vel = 0; // finger stopped before lifting
      const step = () => {
        if (Math.abs(vel) < 0.3) return;
        const next = el.scrollLeft - vel, m = maxL();
        if (next < 0 || next > m) {
          // Momentum hits an edge: a small bounce proportional to the speed, then settle.
          el.scrollLeft = next < 0 ? 0 : m;
          setOver(Math.max(-60, Math.min(60, vel * 2.2)));
          requestAnimationFrame(() => setOver(0, true));
          return;
        }
        el.scrollLeft = next; vel *= 0.972; raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end); cancelAnimationFrame(raf);
    };
  }, [ref]);
}

/** A horizontally scrolling box using useHPan. */
export function HScroll({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const r = useRef<HTMLDivElement>(null);
  useHPan(r);
  return <div ref={r} className={className} {...rest}>{children}</div>;
}
