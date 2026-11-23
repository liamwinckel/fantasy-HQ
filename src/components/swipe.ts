"use client";

import { useRef, type TouchEvent } from "react";

/**
 * Swipe a bottom sheet down to dismiss it (phones). Attach the returned handlers and ref to the sheet,
 * and `scrollRef` to its scrolling body: the drag only starts when that body is scrolled to the top.
 */
export function useSwipeDown(onClose: () => void) {
  const sheet = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ y: number; t: number; ok: boolean } | null>(null);
  const dy = useRef(0);
  const set = (y: number, animate: boolean) => {
    const el = sheet.current;
    if (!el) return;
    el.style.transition = animate ? "transform 220ms ease-out" : "none";
    el.style.transform = y ? `translateY(${y}px)` : "";
  };
  return {
    ref: sheet,
    scrollRef,
    handlers: {
      onTouchStart: (e: TouchEvent) => {
        if (window.innerWidth >= 768) return; // desktop drawer slides from the side
        start.current = { y: e.touches[0].clientY, t: Date.now(), ok: (scrollRef.current?.scrollTop ?? 0) <= 0 };
        dy.current = 0;
      },
      onTouchMove: (e: TouchEvent) => {
        const s = start.current;
        if (!s?.ok) return;
        const d = e.touches[0].clientY - s.y;
        if (d <= 0) { dy.current = 0; set(0, false); return; }
        dy.current = d;
        set(d, false);
      },
      onTouchEnd: () => {
        const s = start.current;
        start.current = null;
        if (!s?.ok) return;
        const fast = dy.current > 40 && Date.now() - s.t < 250;
        if (dy.current > 110 || fast) {
          set(window.innerHeight, true);
          setTimeout(() => { onClose(); set(0, false); if (sheet.current) sheet.current.style.transition = ""; }, 200);
        } else {
          set(0, true);
          setTimeout(() => { if (sheet.current) sheet.current.style.transition = ""; }, 230);
        }
      },
    },
  };
}
