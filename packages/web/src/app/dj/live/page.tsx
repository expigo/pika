"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DjLiveControls } from "@/components/DjLiveControls";
import { DjWorkspaceNav } from "@/components/DjWorkspaceNav";
import { LivePlayer } from "@/components/LivePlayer";
import { LogoutButton } from "@/components/LogoutButton";
import {
  DjApiError,
  getLiveStatus,
  type LiveStatus,
  setShare,
  spotifyAuthorizeUrl,
  startLive,
  stopLive,
} from "@/lib/djLive";
import { useDjMe } from "@/lib/useDjMe";

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

  // Shared workspace gate (D.1); the first status poll runs before "ready" so the page never
  // flashes "Connect Spotify" at a DJ who is already live.
  const { phase, user } = useDjMe(refreshStatus);

  // Live-poll the status while broadcasting so the DJ sees poll tallies, tempo, and the active
  // announcement update in near-real-time. Visibility-aware (pauses when backgrounded) per the
  // battery guidelines; the embedded LivePlayer keeps its own WS listener for the dancer preview.
  const live = status?.live ?? false;
  useEffect(() => {
    if (phase !== "ready" || !live) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer || document.hidden) return;
      timer = setInterval(refreshStatus, 4000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, live, refreshStatus]);

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

      <div className="w-full max-w-lg">
        <DjWorkspaceNav slug={user?.slug} />
      </div>

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
        // D.1 desktop: controls beside the dancer mirror at lg (laptop-in-the-booth); the grid
        // stacks in today's order on mobile.
        <div className="grid w-full max-w-lg gap-6 lg:max-w-4xl lg:grid-cols-2 lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="w-full rounded-2xl bg-slate-900 p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`inline-block h-3 w-3 rounded-full ${paused ? "bg-amber-400" : "animate-pulse bg-red-500"}`}
                />
                <span className="font-semibold tracking-wide">{paused ? "PAUSED" : "LIVE"}</span>
                {!paused && status?.betweenSongs && (
                  <span className="text-xs text-slate-500">· between songs</span>
                )}
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
          </div>

          <section className="w-full min-w-0">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">What dancers see</p>
            {status?.sessionId && <LivePlayer targetSessionId={status.sessionId} />}
          </section>
        </div>
      )}

      {/* Management moved to /dj/booth (D.1 split) — Broadcast stays a focused live surface,
          and the natural post-set next tap is the booth. */}
      <Link
        href="/dj/booth"
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4 text-sm text-slate-300 hover:border-purple-500/30 hover:text-white transition-colors"
      >
        Manage your Booth — profile, playlists, gigs →
      </Link>
    </main>
  );
}
