"use client";

/**
 * Press-and-hold to drag items into a new order (touch and mouse). Hold ~0.35 s without moving to pick an item up:
 * it lifts, follows your finger, the others slide out of its way, and it settles into its new slot when you let go.
 * Moving before the hold completes scrolls the page as normal. Tapping still works (the tap after a drag is ignored).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { reducedMotion } from "./motion";

const HOLD = 350, SLOP = 8, GAP_FALLBACK = 12;
const EASE = "cubic-bezier(0.22,1,0.36,1)";

export function Reorder({ items, onReorder, className }: { items: { key: string; node: ReactNode }[]; onReorder: (keys: string[]) => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const keys = useRef(items.map((i) => i.key));
  keys.current = items.map((i) => i.key);
  const commit = useRef(onReorder);
  commit.current = onReorder;

  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const scroller = document.getElementById("fhq-scroll");
    type Drag = { i: number; el: HTMLElement; els: HTMLElement[]; tops: number[]; hs: number[]; gap: number; y0: number; s0: number; target: number };
    let timer = 0, sx = 0, sy = 0, pending: { i: number; el: HTMLElement } | null = null, drag: Drag | null = null, swallow = false;

    const itemOf = (t: EventTarget | null) => {
      const el = (t as HTMLElement | null)?.closest?.("[data-reorder]") as HTMLElement | null;
      if (!el || !root.contains(el)) return null;
      return { el, i: Number(el.dataset.reorder) };
    };
    const style = (el: HTMLElement, transform: string, anim: boolean) => {
      el.style.transition = anim && !reducedMotion() ? `transform 220ms ${EASE}, box-shadow 220ms ${EASE}` : "none";
      el.style.transform = transform;
    };
    const begin = () => {
      if (!pending) return;
      const els = [...root.querySelectorAll<HTMLElement>("[data-reorder]")];
      const rects = els.map((e) => e.getBoundingClientRect());
      const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : GAP_FALLBACK;
      drag = { i: pending.i, el: pending.el, els, tops: rects.map((r) => r.top), hs: rects.map((r) => r.height), gap, y0: sy, s0: scroller?.scrollTop ?? 0, target: pending.i };
      pending = null;
      drag.el.style.zIndex = "40";
      drag.el.style.boxShadow = "0 18px 40px rgba(0,0,0,.45)";
      style(drag.el, "scale(1.03)", true);
      (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(12);
    };
    const move = (y: number) => {
      if (!drag) return;
      // Auto-scroll near the top / bottom edge.
      if (scroller) { const r = scroller.getBoundingClientRect(); if (y < r.top + 70) scroller.scrollTop -= 10; else if (y > r.bottom - 90) scroller.scrollTop += 10; }
      const dy = y - drag.y0 + ((scroller?.scrollTop ?? 0) - drag.s0);
      style(drag.el, `translateY(${dy}px) scale(1.03)`, false);
      const mid = drag.tops[drag.i] + drag.hs[drag.i] / 2 + dy;
      let t = 0;
      drag.tops.forEach((top, j) => { if (j !== drag!.i && mid > top + drag!.hs[j] / 2) t++; });
      drag.target = t;
      const shift = drag.hs[drag.i] + drag.gap;
      drag.els.forEach((e, j) => {
        if (j === drag!.i) return;
        const by = drag!.i < j && j <= t ? -shift : t <= j && j < drag!.i ? shift : 0;
        style(e, by ? `translateY(${by}px)` : "", true);
      });
    };
    const end = () => {
      window.clearTimeout(timer);
      pending = null;
      if (!drag) return;
      const d = drag; drag = null;
      swallow = true; window.setTimeout(() => (swallow = false), 400);
      // Settle into the slot, then commit the new order and clear the transforms in the same frame.
      let off = 0;
      if (d.target > d.i) for (let j = d.i + 1; j <= d.target; j++) off += d.hs[j] + d.gap;
      else for (let j = d.target; j < d.i; j++) off -= d.hs[j] + d.gap;
      d.el.style.boxShadow = "";
      style(d.el, `translateY(${off}px)`, true);
      window.setTimeout(() => {
        for (const e of d.els) { e.style.transition = "none"; e.style.transform = ""; e.style.zIndex = ""; }
        if (d.target !== d.i) {
          const k = [...keys.current];
          const [m] = k.splice(d.i, 1);
          k.splice(d.target, 0, m);
          commit.current(k);
        }
      }, reducedMotion() ? 0 : 200);
    };
    const start = (x: number, y: number, t: EventTarget | null) => {
      const it = itemOf(t);
      if (!it) return;
      sx = x; sy = y; pending = it;
      timer = window.setTimeout(begin, HOLD);
    };
    const early = (x: number, y: number) => { if (pending && (Math.abs(x - sx) > SLOP || Math.abs(y - sy) > SLOP)) { window.clearTimeout(timer); pending = null; } };

    const ts = (e: TouchEvent) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY, e.target); };
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (drag) { e.preventDefault(); move(t.clientY); } else early(t.clientX, t.clientY); };
    const md = (e: MouseEvent) => { if (e.button === 0) start(e.clientX, e.clientY, e.target); };
    const mm = (e: MouseEvent) => { if (drag) { e.preventDefault(); move(e.clientY); } else early(e.clientX, e.clientY); };
    const click = (e: MouseEvent) => { if (swallow) { e.preventDefault(); e.stopPropagation(); } };
    const menu = (e: Event) => { if (drag || pending) e.preventDefault(); }; // no long-press callout / context menu

    root.addEventListener("touchstart", ts, { passive: true });
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    root.addEventListener("mousedown", md);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", end);
    root.addEventListener("click", click, true);
    root.addEventListener("contextmenu", menu);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("touchstart", ts);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      root.removeEventListener("mousedown", md);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", end);
      root.removeEventListener("click", click, true);
      root.removeEventListener("contextmenu", menu);
    };
  }, []);

  return (
    <div ref={box} className={className}>
      {items.map((it, i) => (
        <div key={it.key} data-reorder={i} className="relative select-none [-webkit-touch-callout:none] [-webkit-user-select:none]">{it.node}</div>
      ))}
    </div>
  );
}
