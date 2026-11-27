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
    let sx = 0, sy = 0, sl = 0, axis: "x" | "y" | null = null, lastT = 0, lastX = 0, v = 0, raf = 0, active = false;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelAnimationFrame(raf);
      active = true; axis = null; v = 0;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; sl = el.scrollLeft; lastT = performance.now(); lastX = sx;
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
      v = (x - lastX) / Math.max(1, now - lastT); lastX = x; lastT = now;
      el.scrollLeft = sl - dx;
    };
    const end = () => {
      if (!active) return;
      active = false;
      if (axis !== "x") return;
      let vel = v * 16;
      const step = () => { if (Math.abs(vel) < 0.4) return; el.scrollLeft -= vel; vel *= 0.95; raf = requestAnimationFrame(step); };
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
