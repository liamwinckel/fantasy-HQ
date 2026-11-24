"use client";

/** Ask SHS: questions about your league, answered from its data. Remembers the conversation for follow-ups. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { cx } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { ArrowUp, RotateCcw, X } from "lucide-react";
import { ask, EXAMPLES, type Answer, type Memory } from "@/lib/services/ask";
import { loadNews } from "@/lib/news";

export default function AskPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

type Msg = { q: string; a: Answer };

function Body({ league, ctx }: LeagueData) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mem, setMem] = useState<Memory | null>(null);
  const [q, setQ] = useState("");
  const news = useAsync(() => loadNews(), []);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    let a: Answer;
    try { const r = ask(ctx, t, news.data?.data.items ?? [], mem); a = r.answer; setMem(r.memory); } catch { a = { text: "Something went wrong answering that. Try rephrasing it." }; }
    setMsgs((m) => [...m, { q: t, a }]);
    setQ("");
  };
  const reset = () => { setMsgs([]); setMem(null); setQ(""); };
  const chips = mem?.players.length ? ["What about rest of season?", "What about this week?", "For the playoffs?", "Any news?", ...EXAMPLES.slice(2)] : EXAMPLES;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-40">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={reset} disabled={!msgs.length} className="flex h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-bold disabled:opacity-30"><RotateCcw size={14} />New chat</button>
        <div className="text-center"><div className="text-[11px] font-bold uppercase tracking-widest text-acc-ink">{league.name}</div><div className="h-display text-2xl leading-none">Ask SHS</div></div>
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full border border-line"><X size={18} /></button>
      </div>
      {!msgs.length && <p className="text-center text-sm text-muted">Ask about your team in your own words: name players, a position, and a time frame (this week, rest of season, playoffs, dynasty). Follow-ups remember the last question.</p>}
      {msgs.map((m, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-acc px-4 py-2.5 text-sm font-semibold text-on-acc">{m.q}</div>
          <div className="max-w-[92%] self-start rounded-2xl rounded-bl-md border border-line bg-panel px-4 py-3 text-sm">
            <div className="mb-2 flex items-center gap-2">
              {m.a.players && m.a.players.length > 0 && <div className="flex -space-x-2">{m.a.players.slice(0, 5).map((id) => { const p = ctx.players.get(id); return p ? <PlayerImg key={id} id={id} name={p.name} pos={p.pos} size={34} /> : null; })}</div>}
              {m.a.scope && <span className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">{m.a.scope}</span>}
            </div>
            <p className="font-semibold leading-snug">{m.a.text}</p>
            {m.a.bullets && <ul className="mt-2 flex flex-col gap-1 text-[13px] text-muted">{m.a.bullets.map((b) => <li key={b} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-acc" />{m.a.text.startsWith("I can answer") ? <button type="button" onClick={() => send(b)} className="text-left underline decoration-line underline-offset-2">{b}</button> : <span>{b}</span>}</li>)}</ul>}
            {m.a.links && m.a.links.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{m.a.links.map((l) => l.href.startsWith("#ask:")
              ? <button key={l.href} type="button" onClick={() => send(l.href.slice(5))} className="rounded-lg border border-acc/50 bg-acc-soft px-3 py-1.5 text-xs font-bold text-acc-ink">{l.label}</button>
              : <Link key={l.href} href={l.href} className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-bold text-acc-ink">{l.label} →</Link>)}</div>}
          </div>
        </div>
      ))}
      <div ref={end} />
      <div className="kb-dock fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),8px)+70px)] z-30 mx-auto w-full max-w-2xl px-3 md:bottom-6">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-0.5" data-no-swipe>
          {chips.map((e) => <button key={e} type="button" onClick={() => send(e)} className="shrink-0 rounded-full border border-line bg-panel/95 px-3 py-1.5 text-xs font-semibold shadow backdrop-blur hover:border-acc">{e}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your team…" enterKeyHint="send" autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-panel px-5 text-base shadow-lg outline-none focus:border-acc" />
          <button type="submit" aria-label="Ask" disabled={!q.trim()} className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg", q.trim() ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}><ArrowUp size={20} strokeWidth={2.5} /></button>
        </form>
      </div>
    </div>
  );
}
