"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DjLiveControls } from "@/components/DjLiveControls";
import { LivePlayer } from "@/components/LivePlayer";
import { LogoutButton } from "@/components/LogoutButton";
import {
  DjApiError,
  type DjUser,
  getLiveStatus,
  getMe,
  type LiveStatus,
  setShare,
  spotifyAuthorizeUrl,
  startLive,
  stopLive,
} from "@/lib/djLive";

type Phase = "loading" | "anon" | "pending" | "ready";

const shell =
  "min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center px-6 py-10 gap-6";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${shell} justify-center text-center`}>
      <div className="max-w-md">{children}</div>
    </main>
  );
}

export default function DjLivePage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<DjUser | null>(null);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getLiveStatus());
    } catch {
      /* status is best-effort; ignore transient errors */
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const me = await getMe().catch(() => null);
      if (!active) return;
      if (!me) return setPhase("anon");
      setUser(me);
      if (me.status === "pending") return setPhase("pending");
      await refreshStatus();
      if (active) setPhase("ready");
    })();
    return () => {
      active = false;
    };
  }, [refreshStatus]);

  // Reflect the OAuth callback result (?spotify=connected|denied|error|invalid).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("spotify");
    if (p === "denied") setError("Spotify connection was cancelled.");
    else if (p === "error" || p === "invalid")
      setError("Spotify connection failed — please try again.");
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refreshStatus();
      } catch (e) {
        setError(e instanceof DjApiError ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [refreshStatus],
  );

  if (phase === "loading") return <Centered>Loading…</Centered>;

  if (phase === "anon") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold mb-3">Sign in to go live</h1>
        <p className="text-slate-400 mb-6">Log in to broadcast your Spotify set to dancers.</p>
        <Link href="/dj/login" className="text-purple-400 underline">
          Go to DJ login →
        </Link>
      </Centered>
    );
  }

  if (phase === "pending") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold mb-3">Account awaiting approval</h1>
        <p className="text-slate-400">
          Thanks for registering{user ? `, ${user.displayName}` : ""}. An organizer needs to approve
          your account before you can go live.
        </p>
      </Centered>
    );
  }

  const spotify = status?.spotify;
  const needsReauth = spotify?.status === "needs_reauth";
  const connected = !!spotify?.connected && !needsReauth;
  const live = status?.live ?? false;
  const paused = status?.paused ?? false;

  return (
    <main className={shell}>
      <header className="w-full max-w-lg flex items-center justify-between">
        <h1 className="text-lg font-semibold">Live Dashboard</h1>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-slate-400">{user.displayName}</span>}
          <LogoutButton />
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="w-full max-w-lg rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {!connected ? (
        <section className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 text-center">
          <h2 className="text-base font-medium mb-2">
            {needsReauth ? "Reconnect Spotify" : "Connect Spotify"}
          </h2>
          <p className="text-sm text-slate-400 mb-5">
            Pika reads <strong>only</strong> what you're currently playing, and only while you're
            live. Your Spotify password is never shared with Pika.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = spotifyAuthorizeUrl();
            }}
            className="rounded-full bg-[#1DB954] px-6 py-2.5 font-semibold text-black"
          >
            {needsReauth ? "Reconnect Spotify" : "Connect Spotify"}
          </button>
        </section>
      ) : !live ? (
        <section className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 text-center">
          <h2 className="text-base font-medium mb-2">Ready to go live</h2>
          <p className="text-sm text-slate-400 mb-5">
            When you go live, dancers see the track you're playing on Spotify in real time. You can
            stop anytime, and sharing pauses automatically whenever your music is paused.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(startLive)}
            className="rounded-full bg-purple-600 px-8 py-2.5 font-semibold disabled:opacity-50"
          >
            {busy ? "Starting…" : "Go Live"}
          </button>
        </section>
      ) : (
        <>
          <section className="w-full max-w-lg rounded-2xl bg-slate-900 p-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-block h-3 w-3 rounded-full ${paused ? "bg-amber-400" : "animate-pulse bg-red-500"}`}
              />
              <span className="font-semibold tracking-wide">{paused ? "PAUSED" : "LIVE"}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setShare(!paused))}
                className="rounded-full border border-slate-600 px-4 py-2 text-sm disabled:opacity-50"
              >
                {paused ? "Resume sharing" : "Pause sharing"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(stopLive)}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Stop
              </button>
            </div>
          </section>

          {status && <DjLiveControls status={status} busy={busy} run={run} />}

          <section className="w-full max-w-lg">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">What dancers see</p>
            {status?.sessionId && <LivePlayer targetSessionId={status.sessionId} />}
          </section>
        </>
      )}
    </main>
  );
}
