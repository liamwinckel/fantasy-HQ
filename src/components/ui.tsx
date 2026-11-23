"use client";

import { useState, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className, title, right, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-line bg-panel", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="h-display text-xl">{title}</h2>
          {right}
        </div>
      )}
      <div className={pad ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

export type SourceTag = "ACTUAL" | "SLEEPER" | "MODEL" | "ESTIMATE";
const TAG_STYLE: Record<SourceTag, string> = {
  ACTUAL: "bg-fg text-bg",
  SLEEPER: "border border-line text-fg",
  MODEL: "bg-acc-soft text-acc-ink",
  ESTIMATE: "border border-dashed border-muted text-muted",
};
const TAG_LABEL: Record<SourceTag, string> = { ACTUAL: "Actual", SLEEPER: "Sleeper", MODEL: "SHS model", ESTIMATE: "Estimate" };

/** Every number on screen says where it came from. */
export function Tag({ kind, className }: { kind: SourceTag; className?: string }) {
  return <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", TAG_STYLE[kind], className)}>{TAG_LABEL[kind]}</span>;
}

const CLASS_STYLE: Record<string, string> = {
  Contender: "bg-acc text-on-acc border border-acc",
  Pretender: "border border-acc-ink text-acc-ink",
  Rebuilder: "border border-fg text-fg",
  Tanking: "border border-dashed border-muted bg-panel2 text-muted",
};
export function ClassBadge({ cls, className }: { cls: string | null | undefined; className?: string }) {
  if (!cls) return null;
  return <span className={cx("inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", CLASS_STYLE[cls], className)}>{cls}</span>;
}

export function InjuryChip({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const short = { Questionable: "Q", Doubtful: "D", Out: "OUT", IR: "IR", PUP: "PUP", Sus: "SUS", NFI: "NFI" }[status] ?? status;
  const style = status === "Questionable" ? "bg-warn text-black" : status === "Doubtful" ? "bg-warn text-black" : status === "Out" ? "bg-neg text-white" : "bg-panel2 text-muted border border-line";
  return <span title={status} className={cx("rounded px-1.5 py-0.5 text-[10px] font-extrabold", style)}>{short}</span>;
}

export function Bar({ value, max = 100, className, color = "bg-acc" }: { value: number; max?: number; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(100, (100 * value) / max));
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-panel2", className)}>
      <div className={cx("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, tag, tone }: { label: string; value: ReactNode; sub?: ReactNode; tag?: SourceTag; tone?: "pos" | "neg" | "warn" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {tag && <Tag kind={tag} />}
      </div>
      <div className="num font-[family-name:var(--font-display)] text-3xl font-bold leading-none sm:text-4xl">{value}</div>
      {sub && <div className={cx("text-xs", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : "text-muted")}>{sub}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-widest text-acc-ink">{eyebrow}</div>}
        <h1 className="h-display mt-1 text-4xl sm:text-5xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={cx("rounded-lg px-3 py-2 text-sm", tone === "warn" ? "border border-warn/50 text-warn" : "bg-acc-soft")}>{children}</div>
  );
}

export const signed = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

/** Round logo with an initials fallback (Sleeper team/league avatars, NFL logos). */
export function Logo({ src, name, size = 28, square = false }: { src: string | null | undefined; name: string; size?: number; square?: boolean }) {
  const initials = name.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const shape = square ? "rounded-md" : "rounded-full";
  return (
    <span style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }} className={cx("relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-panel2 font-bold text-muted", shape)}>
      {initials}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
      )}
    </span>
  );
}

export const nflLogo = (team: string | null | undefined) => (team ? `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png` : null);
export const leagueAvatar = (avatar: string | null | undefined) => (avatar ? `https://sleepercdn.com/avatars/thumbs/${avatar}` : null);

export function NflLogo({ team, size = 18, textFallback = false }: { team: string | null | undefined; size?: number; textFallback?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!team) return null;
  if (failed && !textFallback) return null;
  if (failed) return <span style={{ minWidth: size, fontSize: Math.max(8, size * 0.5) }} className="inline-block shrink-0 text-center font-bold leading-none">{team}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={nflLogo(team)!} alt={team} title={team} width={size} height={size} loading="lazy" style={{ width: size, height: size }} className="inline-block shrink-0 object-contain"
      onError={() => setFailed(true)} />
  );
}
