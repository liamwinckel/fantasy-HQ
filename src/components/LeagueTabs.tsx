"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cx } from "./ui";

/** Back to all leagues, plus the Matchup / Overview switch inside one league. */
export function LeagueTabs({ view }: { view: "matchup" | "overview" }) {
  const tab = (v: "matchup" | "overview", label: string, href: string) => (
    <Link href={href} role="tab" aria-selected={view === v}
      className={cx("flex-1 rounded-full px-4 py-2 text-center text-sm font-bold transition-colors", view === v ? "bg-acc text-on-acc" : "text-muted hover:text-fg")}>
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-muted hover:text-fg"><ChevronLeft size={18} aria-hidden />All leagues</Link>
      <div role="tablist" aria-label="League view" className="ml-auto flex w-full max-w-[260px] rounded-full border border-line bg-panel p-1">
        {tab("matchup", "Matchup", "/matchup/")}
        {tab("overview", "Overview", "/matchup/?view=overview")}
      </div>
    </div>
  );
}
