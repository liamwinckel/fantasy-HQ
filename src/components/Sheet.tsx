"use client";

/**
 * Detail sheet: slides up from the bottom on phones (swipe down to close), centred panel on desktop.
 * `full` makes it fill the screen (charts and tables that need room).
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useSwipeDown } from "./swipe";
import { cx } from "./ui";

export function Sheet({ open, onClose, title, sub, children, full = false }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; full?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const swipe = useSwipeDown(onClose);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      <div className={cx("absolute inset-0 bg-black/55 transition-opacity duration-300", shown ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <aside ref={swipe.ref} {...swipe.handlers}
        className={cx("absolute inset-x-0 bottom-0 mx-auto flex w-full flex-col overflow-hidden border border-line bg-bg shadow-2xl transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          full ? "h-[100dvh] md:inset-6 md:h-auto md:max-w-6xl md:rounded-2xl" : "max-h-[90dvh] rounded-t-2xl md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[85dvh] md:w-[640px] md:-translate-x-1/2 md:rounded-2xl",
          shown ? "translate-y-0 opacity-100 md:-translate-y-1/2" : "translate-y-full opacity-0 md:translate-y-[-45%]",
          full && shown && "md:translate-y-0", full && !shown && "md:translate-y-4")}>
        <div className={cx("mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted/40 md:hidden", full && "mt-[max(env(safe-area-inset-top),0.5rem)]")} aria-hidden />
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-2 sm:px-6">
          <div className="min-w-0"><h2 className="h-display text-2xl">{title}</h2>{sub && <div className="text-xs text-muted">{sub}</div>}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel2"><X size={18} /></button>
        </header>
        <div ref={swipe.scrollRef} className="sheet-bottom-pad min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-6">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
