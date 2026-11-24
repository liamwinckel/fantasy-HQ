"use client";

/**
 * Swipe left/right to change week, like turning a page:
 *   - the page follows your finger 1:1 (with resistance at the first/last week);
 *   - let go past a third of the screen, or flick, and it slides fully off;
 *   - the next week slides in from the opposite edge on the same curve.
 * No fades or scaling: one clean horizontal motion. Vertical scrolling is untouched; the gesture only
 * takes over once the movement is clearly sideways.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const OUT = "cubic-bezier(0.4, 0, 1, 1)";      // accelerate off-screen
const IN = "cubic-bezier(0.16, 1, 0.3, 1)";     // decelerate into place
const BACK = "cubic-bezier(0.2, 0.9, 0.3, 1)";  // settle back when the swipe is cancelled

export function WeekSwipe({ week, min, max, onWeek, children }: { week: number; min: number; max: number; onWeek: (w: number) => void; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const dir = useRef<1 | -1 | 0>(0);
  const prevWeek = useRef(week);
  const state = useRef({ week, min, max, onWeek });
  state.current = { week, min, max, onWeek };

  // New week arrives: start it one screen-width away and slide it in.
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || prevWeek.current === week) return;
    const d = dir.current || (week > prevWeek.current ? 1 : -1);
    prevWeek.current = week;
    dir.current = 0;
    const width = node.parentElement?.clientWidth || window.innerWidth;
    node.style.transition = "none";
    node.style.transform = `translate3d(${d * width}px, 0, 0)`;
    node.getBoundingClientRect();
    node.style.transition = `transform 340ms ${IN}`;
    node.style.transform = "translate3d(0, 0, 0)";
  }, [week]);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let x0 = 0, y0 = 0, dx = 0, mode: "idle" | "h" | "v" = "idle", width = 1;
    let samples: { x: number; t: number }[] = [];
    const interactive = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest("input,select,textarea,[data-no-swipe],[role=dialog]");
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || interactive(e.target)) { mode = "v"; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = "idle";
      width = node.parentElement?.clientWidth || window.innerWidth;
      samples = [{ x: x0, t: performance.now() }];
    };
    const move = (e: TouchEvent) => {
      if (mode === "v") return;
      const x = e.touches[0].clientX, mx = x - x0, my = e.touches[0].clientY - y0;
      if (mode === "idle") {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        mode = Math.abs(mx) > Math.abs(my) * 1.4 ? "h" : "v";
        if (mode === "v") return;
        node.style.transition = "none";
        x0 = x; // start tracking from here, so the page doesn't jump by the dead-zone
      }
      e.preventDefault();
      const d = x - x0;
      const { week: w, min: lo, max: hi } = state.current;
      const blocked = (d > 0 && w <= lo) || (d < 0 && w >= hi);
      dx = blocked ? d / (1 + Math.abs(d) / 60) : d; // firm rubber-band at the ends
      node.style.transform = `translate3d(${dx}px, 0, 0)`;
      samples.push({ x, t: performance.now() });
      if (samples.length > 5) samples.shift();
    };
    const end = () => {
      if (mode !== "h") { mode = "idle"; return; }
      mode = "idle";
      const { week: w, min: lo, max: hi, onWeek: go } = state.current;
      const a = samples[0], b = samples[samples.length - 1];
      const v = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0; // px/ms over the last few moves
      const next = dx < 0 ? w + 1 : w - 1;
      const commit = next >= lo && next <= hi && (Math.abs(dx) > width / 3 || (Math.abs(v) > 0.5 && Math.sign(v) === Math.sign(dx)));
      if (!commit) {
        node.style.transition = `transform 320ms ${BACK}`;
        node.style.transform = "translate3d(0, 0, 0)";
        return;
      }
      const d = dx < 0 ? 1 : -1;
      const remaining = width - Math.abs(dx);
      const ms = Math.max(140, Math.min(240, remaining / Math.max(1.2, Math.abs(v))));
      node.style.transition = `transform ${ms}ms ${OUT}`;
      node.style.transform = `translate3d(${-d * width}px, 0, 0)`;
      dir.current = d;
      window.setTimeout(() => go(next), ms);
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

  // overflow-x clip on the wrapper so the sliding page never widens the screen
  return (
    <div className="overflow-x-clip">
      <div ref={el} className="flex flex-col gap-5 will-change-transform" style={{ touchAction: "pan-y" }}>{children}</div>
    </div>
  );
}
