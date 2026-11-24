"use client";

/**
 * Swipe left/right to move between weeks. The content follows your finger, then slides out and the
 * next week slides in from the other side. Vertical scrolling is untouched: the gesture only takes over
 * once the movement is clearly sideways. Pages that change week by any other means slide too.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function WeekSwipe({ week, min, max, onWeek, children }: { week: number; min: number; max: number; onWeek: (w: number) => void; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const dir = useRef<1 | -1 | 0>(0); // direction of the last change: 1 = went forward
  const prevWeek = useRef(week);
  const state = useRef({ week, min, max, onWeek });
  state.current = { week, min, max, onWeek };

  // Incoming slide: after the week changes, start the new content off to one side and glide it in.
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || prevWeek.current === week) return;
    const d = dir.current || (week > prevWeek.current ? 1 : -1);
    prevWeek.current = week;
    dir.current = 0;
    node.style.transition = "none";
    node.style.transform = `translate3d(${d * 36}%, 0, 0)`;
    node.style.opacity = "0";
    node.getBoundingClientRect(); // commit the start position
    node.style.transition = `transform 380ms ${EASE}, opacity 260ms ease-out`;
    node.style.transform = "translate3d(0, 0, 0)";
    node.style.opacity = "1";
  }, [week]);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, mode: "idle" | "h" | "v" = "idle", width = 1;
    const interactive = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest("input,select,textarea,[data-no-swipe],[role=dialog]");
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || interactive(e.target)) { mode = "v"; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = performance.now(); dx = 0; mode = "idle"; width = node.clientWidth || 1;
    };
    const move = (e: TouchEvent) => {
      if (mode === "v") return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (mode === "idle") {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        mode = Math.abs(mx) > Math.abs(my) * 1.2 ? "h" : "v";
        if (mode === "v") return;
        node.style.transition = "none";
      }
      e.preventDefault(); // we own this gesture now: no vertical scroll while swiping sideways
      const { week: w, min: lo, max: hi } = state.current;
      const blocked = (mx > 0 && w <= lo) || (mx < 0 && w >= hi);
      dx = blocked ? mx * 0.25 : mx; // rubber-band at the ends
      node.style.transform = `translate3d(${dx}px, 0, 0)`;
      node.style.opacity = String(1 - Math.min(0.35, Math.abs(dx) / width / 2));
    };
    const end = () => {
      if (mode !== "h") { mode = "idle"; return; }
      mode = "idle";
      const { week: w, min: lo, max: hi, onWeek: go } = state.current;
      const v = dx / Math.max(1, performance.now() - t0); // px/ms
      const next = dx < 0 ? w + 1 : w - 1;
      const commit = (Math.abs(dx) > width * 0.22 || Math.abs(v) > 0.45) && next >= lo && next <= hi;
      if (!commit) {
        node.style.transition = `transform 300ms ${EASE}, opacity 200ms ease-out`;
        node.style.transform = "translate3d(0, 0, 0)";
        node.style.opacity = "1";
        return;
      }
      const d = dx < 0 ? 1 : -1;
      node.style.transition = `transform 180ms ease-in, opacity 180ms ease-in`;
      node.style.transform = `translate3d(${-d * width * 0.6}px, 0, 0)`;
      node.style.opacity = "0";
      dir.current = d;
      window.setTimeout(() => go(next), 150);
    };
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", move, { passive: false });
    node.addEventListener("touchend", end);
    node.addEventListener("touchcancel", end);
    return () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", end);
    };
  }, []);

  return <div ref={el} className="flex flex-col gap-5 will-change-transform" style={{ touchAction: "pan-y" }}>{children}</div>;
}
