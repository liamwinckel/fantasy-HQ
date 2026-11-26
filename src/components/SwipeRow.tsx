"use client";

/**
 * Swipe a row sideways to remove it. Once a drag is clearly horizontal the page stops scrolling vertically
 * (the gesture is locked), the row follows the finger over a red "Remove" backing, and a release past ~35% of its
 * width slides it out and folds the gap closed. Short drags spring back. Taps still reach the row's buttons.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

export function SwipeRow({ children, onRemove, className }: { children: ReactNode; onRemove: () => void; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  const removeRef = useRef(onRemove);
  removeRef.current = onRemove;

  useEffect(() => {
    const el = outer.current, row = inner.current;
    if (!el || !row) return;
    let x0 = 0, y0 = 0, dx = 0, mode: "none" | "h" | "v" = "none", active = false;
    let scroller: HTMLElement | null = null;
    const set = (x: number, anim: boolean) => {
      row.style.transition = anim ? "transform 260ms cubic-bezier(.2,.8,.2,1), opacity 260ms" : "none";
      row.style.transform = `translate3d(${x}px,0,0)`;
      row.style.opacity = String(1 - Math.min(0.6, Math.abs(x) / (el.offsetWidth * 1.4)));
      el.style.setProperty("--swipe", String(Math.min(1, Math.abs(x) / (el.offsetWidth * 0.35))));
      el.dataset.dir = x < 0 ? "left" : "right";
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = "none"; active = true;
    };
    const move = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      const mx = t.clientX - x0, my = t.clientY - y0;
      if (mode === "none") {
        if (mx === 0 && my === 0) return;
        // Decide on the first movement: iOS only honours a scroll lock if the very first touchmove is cancelled.
        mode = Math.abs(mx) >= Math.abs(my) ? "h" : "v";
        if (mode === "h") { scroller = document.getElementById("fhq-scroll"); if (scroller) scroller.style.overflowY = "hidden"; }
      }
      if (mode !== "h") return;
      e.preventDefault(); // vertical scroll lock while swiping
      dx = mx;
      set(dx, false);
    };
    const end = () => {
      if (!active) return;
      active = false;
      if (scroller) { scroller.style.overflowY = ""; scroller = null; }
      if (mode !== "h") return;
      const w = el.offsetWidth;
      if (Math.abs(dx) > w * 0.35) {
        set(Math.sign(dx) * w * 1.1, true);
        el.style.transition = "grid-template-rows 220ms ease 180ms, opacity 200ms ease 180ms";
        el.style.gridTemplateRows = "0fr";
        el.style.opacity = "0";
        setTimeout(() => { setGone(true); removeRef.current(); }, 420);
      } else set(0, true);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={outer} className={cx("relative grid grid-rows-[1fr]", className)} style={{ touchAction: "pan-y" }}>
      <div className="relative min-h-0 overflow-hidden rounded-lg">
        <div className="fhq-swipe-back absolute inset-0 flex items-center rounded-lg bg-neg px-3 text-[11px] font-extrabold uppercase tracking-wide text-white" style={{ opacity: "calc(0.35 + 0.65 * var(--swipe, 0))" }} aria-hidden>
          <span className="fhq-swipe-label">Remove</span>
        </div>
        <div ref={inner} className="relative will-change-transform">{children}</div>
      </div>
    </div>
  );
}
