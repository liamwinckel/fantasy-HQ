"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/**
 * Card. With `href` or `onOpen`, the whole card is tappable (taps on links/buttons inside still do their own thing),
 * and a chevron shows next to the title.
 */
export function Card({ children, className, title, right, pad = true, info, href, onOpen }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode; pad?: boolean; info?: ReactNode; href?: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const tappable = !!(href || onOpen);
  const go = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,[role=button],[data-no-open]")) return;
    if (onOpen) onOpen(); else if (href) router.push(href);
  };
  return (
    <section onClick={tappable ? go : undefined}
      className={cx("min-w-0 rounded-xl border border-line bg-panel", tappable && "cursor-pointer transition-[transform,border-color] duration-150 hover:border-acc/50 active:scale-[0.99]", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="h-display flex min-w-0 items-center gap-2 text-xl">{title}{info && <InfoButton open={open} onClick={() => setOpen(!open)} />}</h2>
          <div className="flex shrink-0 items-center gap-2">{right}{tappable && <ChevronRight size={18} className="text-muted" aria-hidden />}</div>
        </div>
      )}
      {info && open && <div className="fhq-in border-b border-line bg-panel2/60 px-4 py-3 text-xs leading-relaxed text-muted sm:px-5">{info}</div>}
      <div className={pad ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

/** Small ⓘ button that reveals explanatory text, so screens stay clean. */
export function InfoButton({ open, onClick, label = "About this" }: { open: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={label} title={label}
      className={cx("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-sans text-[11px] font-bold normal-case tracking-normal transition-colors",
        open ? "border-acc bg-acc text-on-acc" : "border-line text-muted hover:text-fg")}>i</button>
  );
}

/** Collapsed explanation: an ⓘ button plus text shown on tap. */
export function Info({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx("text-xs", className)}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-fg">
        <span className={cx("inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold", open ? "border-acc bg-acc text-on-acc" : "border-line")}>i</span>
        {label ?? (open ? "Hide" : "How this works")}
      </button>
      {open && <div className="fhq-in mt-2 rounded-lg bg-panel2/60 px-3 py-2.5 leading-relaxed text-muted">{children}</div>}
    </div>
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

const DOT_STYLE: Record<SourceTag, string> = {
  ACTUAL: "bg-fg",
  SLEEPER: "border-2 border-sky-400",
  MODEL: "bg-acc",
  ESTIMATE: "border border-dashed border-muted",
};
void TAG_STYLE;
/** Where a number came from, as a small coloured dot (hover/long-press for the label). */
/** Source markers used to be coloured dots in card corners; they read as noise, so they render nothing now. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Tag(_: { kind: SourceTag; className?: string }) {
  return null;
}

/** Legend for the source dots. */
export function SourceLegend() {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      {(Object.keys(TAG_LABEL) as SourceTag[]).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><Tag kind={k} />{TAG_LABEL[k]}</span>)}
    </span>
  );
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

export function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tag?: SourceTag; tone?: "pos" | "neg" | "warn"; onClick?: () => void }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {onClick && <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden />}
      </div>
      <div className="num font-[family-name:var(--font-display)] text-3xl font-bold leading-none sm:text-4xl">{value}</div>
      {sub && <div className={cx("text-xs", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : "text-muted")}>{sub}</div>}
    </>
  );
  const cls = "flex flex-col gap-1 rounded-xl border border-line bg-panel p-4 text-left";
  return onClick
    ? <button type="button" onClick={onClick} className={cx(cls, "transition-[transform,border-color] duration-150 hover:border-acc/50 active:scale-[0.97]")}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

export function PageHeader({ eyebrow, title, children, info }: { eyebrow?: string; title: string; children?: ReactNode; info?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex flex-col items-center">
        {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-widest text-acc-ink sm:text-xs">{eyebrow}</div>}
        <h1 className="h-display mt-1 flex items-center gap-2.5 text-4xl sm:text-5xl">{title}{info && <InfoButton open={open} onClick={() => setOpen(!open)} label={`About ${title}`} />}</h1>
      </div>
      {info && open && <div className="fhq-in max-w-2xl rounded-xl bg-panel px-4 py-3 text-left text-sm leading-relaxed text-muted">{info}</div>}
      {children}
    </div>
  );
}

/** Win chance: 0% = a red sliver at the left, 100% = all the way green; the fill shades from red to green. */
export function WinBar({ pct, className }: { pct: number; className?: string }) {
  const p = Math.max(1.5, Math.min(100, pct));
  return (
    <div className={cx("h-3 w-full overflow-hidden rounded-full bg-panel2", className)} role="img" aria-label={`${Math.round(pct)}% win chance`}>
      <div className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${p}%`, backgroundImage: "linear-gradient(90deg, var(--neg), #eab308 50%, var(--pos))", backgroundSize: `${(100 / p) * 100}% 100%` }} />
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
