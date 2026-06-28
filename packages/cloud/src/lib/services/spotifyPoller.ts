/**
 * Server-side Spotify poller (Track D — the "virtual DJ").
 *
 * For each live web-DJ, a per-DJ loop polls `fetchNowPlaying` and pushes track changes through
 * the shared `applyNowPlaying` core (published via getBroadcaster, since there's no DJ socket).
 * Privacy is first-class: it auto-pauses when playback stops, supports a manual "pause sharing",
 * and auto-ends a session after a long idle. Refresh failures stop the poller cleanly.
 *
 * The poll loop's decision logic is the pure `evaluateTick` (unit-tested). The loop itself does
 * the I/O. A `live_pollers` row is persisted for observability + a future multi-instance lease;
 * on boot any stale rows are reconciled. (Cross-restart auto-resume is deferred — see README.)
 */

import { logger, type TrackInfo } from "@pika/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { livePollers } from "../../db/schema";
import { reapSession } from "../../handlers/lifecycle";
import { getBroadcaster } from "../broadcaster";
import { applyNowPlaying, createLiveSession, type PublishFn } from "../live-session";
import { getSessionBroadcastTopic } from "../sessions";
import { DISCOVERY_TOPIC } from "../topics";
import {
  fetchNowPlaying,
  type NowPlaying,
  SpotifyAuthError,
  SpotifyRateLimitError,
} from "./spotify";

const INSTANCE_ID = crypto.randomUUID();

export interface PollerConfig {
  pollMs: number;
  idleEndMs: number;
}
const DEFAULT_CONFIG: PollerConfig = {
  pollMs: 4000,
  idleEndMs: 30 * 60 * 1000, // auto-end after 30 min of nothing playing
};

interface PollerRuntime {
  sessionId: string;
  djUserId: string;
  djName: string;
  lastTrackId: string | null;
  paused: boolean; // currently broadcasting a "paused / between songs" state
  manualPaused: boolean; // DJ tapped "pause sharing"
  notPlayingSince: number | null; // when Spotify playback stopped (idle-end clock)
  timer: ReturnType<typeof setTimeout> | null;
}

const pollers = new Map<string, PollerRuntime>();

// ---------------------------------------------------------------------------
// Pure decision logic (unit-tested)
// ---------------------------------------------------------------------------

export type TickResult =
  | { kind: "now_playing"; np: NowPlaying }
  | { kind: "idle" } // nothing playing (204 / no item)
  | { kind: "auth_error" } // refresh failed → needs re-auth
  | { kind: "rate_limit"; retryAfterMs: number }
  | { kind: "error" }; // transient; skip this tick

export interface TickActions {
  emitTrack?: TrackInfo; // push a NOW_PLAYING
  emitPaused?: boolean; // broadcast paused / between-songs
  emitResumed?: boolean; // broadcast resumed
  endIdle?: boolean; // auto-end (idle timeout)
  stopReauth?: boolean; // stop (needs re-auth)
  nextDelayMs: number;
}

/**
 * Decide what a poll tick should do, given the runtime state and the fetch result.
 * Pure: returns the actions plus a patch to apply to the runtime. No I/O.
 */
export function evaluateTick(
  rt: Pick<PollerRuntime, "lastTrackId" | "paused" | "manualPaused" | "notPlayingSince">,
  result: TickResult,
  now: number,
  config: PollerConfig = DEFAULT_CONFIG,
): { actions: TickActions; patch: Partial<PollerRuntime> } {
  const actions: TickActions = { nextDelayMs: config.pollMs };
  const patch: Partial<PollerRuntime> = {};

  if (result.kind === "auth_error") {
    actions.stopReauth = true;
    return { actions, patch };
  }
  if (result.kind === "rate_limit") {
    actions.nextDelayMs = result.retryAfterMs;
    return { actions, patch };
  }
  if (result.kind === "error") {
    return { actions, patch }; // skip, retry next tick
  }

  const isPlaying = result.kind === "now_playing" && result.np.isPlaying && !rt.manualPaused;

  if (!isPlaying) {
    // Not sharing: idle, Spotify-paused, or manually paused. Always reflect a paused state.
    if (!rt.paused) {
      actions.emitPaused = true;
      patch.paused = true;
    }
    if (rt.manualPaused) {
      patch.notPlayingSince = null; // don't auto-end a deliberately-paused session
      return { actions, patch };
    }
    const since = rt.notPlayingSince ?? now;
    patch.notPlayingSince = since;
    if (now - since >= config.idleEndMs) actions.endIdle = true;
    return { actions, patch };
  }

  // Playing (and sharing).
  patch.notPlayingSince = null;
  if (rt.paused) {
    actions.emitResumed = true;
    patch.paused = false;
  }
  const np = (result as { kind: "now_playing"; np: NowPlaying }).np;
  if (np.trackId !== rt.lastTrackId) {
    actions.emitTrack = np.track;
    patch.lastTrackId = np.trackId;
  }
  return { actions, patch };
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

const pollerPublish: PublishFn = (topic, data) => {
  getBroadcaster()?.publish(topic, data);
};

function publishSessionState(sessionId: string, type: "SESSION_PAUSED" | "SESSION_RESUMED"): void {
  getBroadcaster()?.publish(
    getSessionBroadcastTopic(sessionId),
    JSON.stringify({ type, sessionId }),
  );
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Start polling a DJ's Spotify now-playing. Idempotent per DJ. Returns the session id. */
export async function startPoller(
  djUserId: string,
  djName: string,
): Promise<{ sessionId: string }> {
  const existing = pollers.get(djUserId);
  if (existing) return { sessionId: existing.sessionId };

  const sessionId = `session_${Date.now()}`;
  const { session } = await createLiveSession({ sessionId, djName, djUserId });

  await db.insert(livePollers).values({
    djUserId,
    sessionId,
    status: "running",
    leaseOwner: INSTANCE_ID,
    heartbeatAt: new Date(),
  });

  // Announce on the discovery topic so lobby/dancers see the session appear.
  getBroadcaster()?.publish(
    DISCOVERY_TOPIC,
    JSON.stringify({ type: "SESSION_STARTED", sessionId, djName, startTime: session.startedAt }),
  );

  const rt: PollerRuntime = {
    sessionId,
    djUserId,
    djName,
    lastTrackId: null,
    paused: false,
    manualPaused: false,
    notPlayingSince: null,
    timer: null,
  };
  pollers.set(djUserId, rt);
  logger.info("🎧 Spotify poller started", { djUserId, sessionId });
  scheduleNext(rt, 0); // first tick immediately
  return { sessionId };
}

/** Stop a DJ's poller and end the session. */
export async function stopPoller(djUserId: string, reason = "stopped"): Promise<void> {
  const rt = pollers.get(djUserId);
  if (!rt) return;
  if (rt.timer) clearTimeout(rt.timer);
  pollers.delete(djUserId);
  await db
    .delete(livePollers)
    .where(eq(livePollers.djUserId, djUserId))
    .catch((e) => {
      logger.error("Failed to delete live_pollers row", e);
    });
  reapSession(rt.sessionId);
  logger.info("🛑 Spotify poller stopped", { djUserId, reason });
}

/** Toggle the DJ's manual "pause sharing". Returns false if no poller is running. */
export function setManualPause(djUserId: string, paused: boolean): boolean {
  const rt = pollers.get(djUserId);
  if (!rt) return false;
  rt.manualPaused = paused;
  return true;
}

export function getPollerStatus(djUserId: string): {
  live: boolean;
  sessionId?: string;
  paused?: boolean;
  betweenSongs?: boolean;
} {
  const rt = pollers.get(djUserId);
  if (!rt) return { live: false };
  // `paused` = the DJ deliberately paused sharing. A transient Spotify `is_playing:false`
  // between tracks must NOT flip the top "LIVE/PAUSED" banner (it briefly toggles `rt.paused`);
  // surface that separately as `betweenSongs` — the embedded player already shows "Between songs".
  return {
    live: true,
    sessionId: rt.sessionId,
    paused: rt.manualPaused,
    betweenSongs: rt.paused && !rt.manualPaused,
  };
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

function scheduleNext(rt: PollerRuntime, delayMs: number): void {
  rt.timer = setTimeout(() => {
    void runTick(rt);
  }, delayMs);
  rt.timer.unref?.();
}

async function runTick(rt: PollerRuntime): Promise<void> {
  if (!pollers.has(rt.djUserId)) return; // stopped while scheduled

  let result: TickResult;
  try {
    const np = await fetchNowPlaying(rt.djUserId);
    result = np ? { kind: "now_playing", np } : { kind: "idle" };
  } catch (e) {
    if (e instanceof SpotifyAuthError) result = { kind: "auth_error" };
    else if (e instanceof SpotifyRateLimitError)
      result = { kind: "rate_limit", retryAfterMs: e.retryAfterMs };
    else {
      logger.error("Spotify poll tick failed", e);
      result = { kind: "error" };
    }
  }

  const { actions, patch } = evaluateTick(rt, result, Date.now());
  Object.assign(rt, patch);

  if (actions.emitPaused) publishSessionState(rt.sessionId, "SESSION_PAUSED");
  if (actions.emitResumed) publishSessionState(rt.sessionId, "SESSION_RESUMED");
  if (actions.emitTrack) applyNowPlaying(rt.sessionId, actions.emitTrack, pollerPublish);

  if (actions.stopReauth) return void stopPoller(rt.djUserId, "needs_reauth");
  if (actions.endIdle) return void stopPoller(rt.djUserId, "idle-timeout");

  // Heartbeat (fire-and-forget) for liveness / future multi-instance lease.
  db.update(livePollers)
    .set({ heartbeatAt: new Date(), status: rt.paused ? "paused" : "running" })
    .where(eq(livePollers.djUserId, rt.djUserId))
    .catch(() => {});

  scheduleNext(rt, actions.nextDelayMs);
}

// ---------------------------------------------------------------------------
// Boot reconcile + graceful shutdown
// ---------------------------------------------------------------------------

/**
 * On boot, clear leftover poller rows from a previous run. (Auto-resume of in-flight sessions
 * is deferred — sessions are ended by graceful shutdown, so leftovers are stale.)
 */
export async function reconcilePollersOnBoot(): Promise<void> {
  try {
    const deleted = await db.delete(livePollers).returning({ id: livePollers.id });
    if (deleted.length > 0) logger.info(`🧹 Cleared ${deleted.length} stale live_pollers row(s)`);
  } catch (e) {
    logger.error("Failed to reconcile live_pollers on boot", e);
  }
}

/** Stop all poll timers (graceful shutdown). Sessions are ended by the global shutdown sweep. */
export function shutdownAllPollers(): void {
  for (const rt of pollers.values()) {
    if (rt.timer) clearTimeout(rt.timer);
  }
  pollers.clear();
}
