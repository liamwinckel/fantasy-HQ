"use client";

/**
 * Motion helpers. One easing curve everywhere (fast out, gentle settle), 200–900 ms, and only when something first
 * scrolls into view or a number changes, never on every refresh. iOS "Reduce Motion" turns all of it off: numbers
 * and bars appear at their final values straight away.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

export const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** True once the element has been on screen (and stays true). */
export function useInView<T extends Element>(ref: RefObject<T | null>, margin = "0px 0px -8% 0px") {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (reducedMotion() || typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, margin]);
  return seen;
}

/** Things that already played their entrance this session (by id): coming back to a screen shows them settled. */
const played = new Map<string, string | number>();

/**
 * Counts every number inside `text` up from 0 the first time it's on screen, then rolls from the old value to the
 * new one whenever it changes ("8–3", "#6", "124.6", "72%" all work; decimals are kept as written).
 */
export function Roll({ text, ms = 700, className, id, from: start }: { text: string; ms?: number; className?: string; id?: string; from?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref);
  const prev = id ? (played.get(id) as string | undefined) ?? start : start;
  const [shown, setShown] = useState(() => (reducedMotion() ? text : prev ?? zeroed(text)));
  const from = useRef<string>(prev ?? zeroed(text));
  useEffect(() => { if (id) played.set(id, text); }, [id, text]);
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) { setShown(text); from.current = text; return; }
    const a = nums(from.current), b = nums(text);
    if (a.length !== b.length) { setShown(text); from.current = text; return; }
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => {
      const k = easeOut(Math.min(1, (now - t0) / ms));
      setShown(fill(text, b.map((n, i) => ({ ...n, v: a[i].v + (n.v - a[i].v) * k }))));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = text;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = text; };
  }, [text, seen, ms]);
  return <span ref={ref} className={className}>{shown}</span>;
}

type Num = { v: number; dp: number; start: number; end: number };
function nums(s: string): Num[] {
  const out: Num[] = [];
  for (const m of s.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,/g, "");
    out.push({ v: Number(raw), dp: raw.includes(".") ? raw.split(".")[1].length : 0, start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}
function fill(template: string, ns: Num[]) {
  let out = "", at = 0;
  for (const n of ns) {
    const comma = template.slice(n.start, n.end).includes(",");
    const v = n.v.toFixed(n.dp);
    out += template.slice(at, n.start) + (comma ? Number(v).toLocaleString(undefined, { minimumFractionDigits: n.dp, maximumFractionDigits: n.dp }) : v);
    at = n.end;
  }
  return out + template.slice(at);
}
const zeroed = (s: string) => fill(s, nums(s).map((n) => ({ ...n, v: 0 })));

/** 0 until the element is on screen, then `target`: pair with a CSS transition to make bars and gauges fill in. */
export function useGrow<T extends Element>(target: number, id?: string): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const seen = useInView(ref);
  const before = id !== undefined && played.has(id);
  useEffect(() => { if (id && seen) played.set(id, target); }, [id, seen, target]);
  return [ref, seen || before ? target : 0];
}

/** Has this id already played its entrance this session? (Marks it as played.) */
export function firstTime(id: string) {
  if (played.has(id)) return false;
  played.set(id, 1);
  return true;
}
