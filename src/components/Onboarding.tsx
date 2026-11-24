"use client";

import { useState } from "react";
import { connectUser } from "@/lib/services/portfolio";
import { BASE_PATH } from "@/lib/net";

export function Onboarding({ suggested = "" }: { suggested?: string }) {
  void suggested;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await connectUser(name); // saves to this device; the app reloads its leagues
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-panel p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BASE_PATH}/shs-mark.png?v=3`} alt="SHS" width={64} height={64} />
      <h1 className="h-display mt-3 text-4xl">Connect Sleeper</h1>
      <p className="mt-2 text-sm text-muted">Enter your Sleeper username. Fantasy HQ reads your leagues through Sleeper&apos;s public API. Nothing is posted back to Sleeper. Your settings are saved on this device.</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-muted">
          Username or user ID
          <input value={name} onChange={(e) => setName(e.target.value)} required autoCapitalize="none" autoCorrect="off"
            className="rounded-lg border border-line bg-panel2 px-3 py-3 text-base normal-case tracking-normal text-fg" placeholder="Sleeper username" />
        </label>
        <button disabled={busy} className="rounded-lg bg-acc px-4 py-3 font-bold text-on-acc disabled:opacity-60">{busy ? "Connecting…" : "Connect"}</button>
        {err && <p className="text-sm text-neg">{err}</p>}
      </form>
    </div>
  );
}
