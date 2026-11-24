"use client";

/** Ask SHS: questions about your league, answered from its data. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LeaguePage, useAsync, type LeagueData } from "@/components/AppData";
import { PageHeader, cx } from "@/components/ui";
import { PlayerImg } from "@/components/client";
import { ArrowUp } from "lucide-react";
import { ask, EXAMPLES, type Answer } from "@/lib/services/ask";
import { loadNews } from "@/lib/news";

export default function AskPage() {
  return <LeaguePage>{(d) => <Body {...d} />}</LeaguePage>;
}

type Msg = { q: string; a: Answer };

function Body({ league, ctx }: LeagueData) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const news = useAsync(() => loadNews(), []);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  useEffect(() => { input.current?.focus(); }, []);
  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    let a: Answer;
    try { a = ask(ctx, t, news.data?.data.items ?? []); } catch { a = { text: "Something went wrong answering that. Try rephrasing it." }; }
    setMsgs((m) => [...m, { q: t, a }]);
    setQ("");
  };
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-28">
      <PageHeader eyebrow={league.name} title="Ask SHS" info={<>Ask about your league in plain words. Answers come from the same tools as the rest of the app (start/sit simulations, the trade analyzer, waiver assistant, rankings, playoff simulations, news), using this league&apos;s data. No AI service or account needed; nothing leaves your device.</>} />
      {!msgs.length && (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted">Try one of these, or name your own players.</p>
          <div className="flex flex-wrap justify-center gap-2">{EXAMPLES.map((e) => <button key={e} type="button" onClick={() => send(e)} className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold hover:border-acc">{e}</button>)}</div>
        </div>
      )}
      {msgs.map((m, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-acc px-4 py-2.5 text-sm font-semibold text-on-acc">{m.q}</div>
          <div className="max-w-[92%] self-start rounded-2xl rounded-bl-md border border-line bg-panel px-4 py-3 text-sm">
            {m.a.players && m.a.players.length > 0 && <div className="mb-2 flex -space-x-2">{m.a.players.slice(0, 5).map((id) => { const p = ctx.players.get(id); return p ? <PlayerImg key={id} id={id} name={p.name} pos={p.pos} size={34} /> : null; })}</div>}
            <p className="font-semibold leading-snug">{m.a.text}</p>
            {m.a.bullets && <ul className="mt-2 flex flex-col gap-1 text-[13px] text-muted">{m.a.bullets.map((b) => <li key={b} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-acc" />{m.a.text.startsWith("I can answer") ? <button type="button" onClick={() => send(b)} className="text-left underline decoration-line underline-offset-2">{b}</button> : <span>{b}</span>}</li>)}</ul>}
            {m.a.links && m.a.links.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{m.a.links.map((l) => <Link key={l.href} href={l.href} className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-bold text-acc-ink">{l.label} →</Link>)}</div>}
          </div>
        </div>
      ))}
      <div ref={end} />
      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),8px)+70px)] z-30 mx-auto flex w-full max-w-2xl gap-2 px-3 md:bottom-6">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your team…" enterKeyHint="send"
          className="h-12 min-w-0 flex-1 rounded-full border border-line bg-panel px-5 text-sm shadow-lg outline-none focus:border-acc" />
        <button type="submit" aria-label="Ask" disabled={!q.trim()} className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg", q.trim() ? "bg-acc text-on-acc" : "bg-panel2 text-muted")}><ArrowUp size={20} strokeWidth={2.5} /></button>
      </form>
    </div>
  );
}
