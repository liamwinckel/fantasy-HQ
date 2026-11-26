"use client";

/**
 * Press-and-hold to drag items into a new order (touch and mouse). Hold ~0.35 s without moving to pick an item up:
 * it lifts, follows your finger, the others slide out of its way, and it settles into its new slot when you let go.
 * Moving before the hold completes scrolls the page as normal. Tapping still works (the tap after a drag is ignored).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { reducedMotion } from "./motion";

const HOLD = 350, SLOP = 8;
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
    // Works for a single column or a grid: each item's slot is its rectangle at drag start; the dragged card lands in
    // the slot nearest its centre and the others slide into the slots they move to.
    type Drag = { i: number; el: HTMLElement; els: HTMLElement[]; rects: DOMRect[]; x0: number; y0: number; s0: number; target: number };
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
      drag = { i: pending.i, el: pending.el, els, rects: els.map((e) => e.getBoundingClientRect()), x0: sx, y0: sy, s0: scroller?.scrollTop ?? 0, target: pending.i };
      pending = null;
      drag.el.style.zIndex = "40";
      drag.el.style.boxShadow = "0 18px 40px rgba(0,0,0,.45)";
      style(drag.el, "scale(1.03)", true);
      (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(12);
    };
    const slotOf = (j: number, i: number, t: number) => (i < j && j <= t ? j - 1 : t <= j && j < i ? j + 1 : j);
    const offset = (from: DOMRect, to: DOMRect) => [to.left - from.left, to.top - from.top] as const;
    const move = (x: number, y: number) => {
      if (!drag) return;
      // Auto-scroll near the top / bottom edge.
      if (scroller) { const r = scroller.getBoundingClientRect(); if (y < r.top + 70) scroller.scrollTop -= 10; else if (y > r.bottom - 90) scroller.scrollTop += 10; }
      const dx = x - drag.x0, dy = y - drag.y0 + ((scroller?.scrollTop ?? 0) - drag.s0);
      style(drag.el, `translate(${dx}px, ${dy}px) scale(1.03)`, false);
      const me = drag.rects[drag.i];
      const cx = me.left + me.width / 2 + dx, cy = me.top + me.height / 2 + dy;
      let t = drag.i, best = Infinity;
      drag.rects.forEach((r, j) => { const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); if (d < best) { best = d; t = j; } });
      drag.target = t;
      drag.els.forEach((e, j) => {
        if (j === drag!.i) return;
        const k = slotOf(j, drag!.i, t);
        const [ox, oy] = offset(drag!.rects[j], drag!.rects[k]);
        style(e, k !== j ? `translate(${ox}px, ${oy}px)` : "", true);
      });
    };
    const end = () => {
      window.clearTimeout(timer);
      pending = null;
      if (!drag) return;
      const d = drag; drag = null;
      swallow = true; window.setTimeout(() => (swallow = false), 400);
      // Settle into the slot, then commit the new order and clear the transforms in the same frame.
      const [ox, oy] = offset(d.rects[d.i], d.rects[d.target]);
      d.el.style.boxShadow = "";
      style(d.el, `translate(${ox}px, ${oy}px)`, true);
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
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (drag) { e.preventDefault(); move(t.clientX, t.clientY); } else early(t.clientX, t.clientY); };
    const md = (e: MouseEvent) => { if (e.button === 0) start(e.clientX, e.clientY, e.target); };
    const mm = (e: MouseEvent) => { if (drag) { e.preventDefault(); move(e.clientX, e.clientY); } else early(e.clientX, e.clientY); };
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
