/**
 * C3 — plays buffered before the session row exists are never silently dropped.
 *
 * Exercises the buffer-and-flush control flow in lib/persistence/tracks.ts against the
 * REAL module. Under `bun test` (NODE_ENV=test) the DB insert is mocked, so these assert
 * the buffering/flush/teardown logic (the new code), not the write itself — the insert
 * path is covered by integration/schema-persistence.integration.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { persistedSessions, persistSession } from "../lib/persistence/sessions";
import {
  clearLastPersistedTrackKey,
  discardPendingTracks,
  flushPendingTracks,
  getPendingTrackCount,
  persistTrack,
  persistTracksBulk,
} from "../lib/persistence/tracks";

const MAX_PENDING_TRACKS = 200; // keep in sync with tracks.ts

let sid: string;

beforeEach(() => {
  sid = `c3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  persistedSessions.delete(sid); // ensure "not ready"
});

afterEach(() => {
  clearLastPersistedTrackKey(sid);
  persistedSessions.delete(sid);
});

describe("C3: plays buffered before session-ready are never dropped", () => {
  test("buffers a play that arrives before the session row exists", async () => {
    await persistTrack(sid, { artist: "A", title: "T1" });
    expect(getPendingTrackCount(sid)).toBe(1);
  });

  test("buffers a bulk import that races the session row", async () => {
    await persistTracksBulk(sid, [
      { artist: "A", title: "T1" },
      { artist: "B", title: "T2" },
      { artist: "C", title: "T3" },
    ]);
    expect(getPendingTrackCount(sid)).toBe(3);
  });

  test("flushes buffered plays once the session is persisted", async () => {
    await persistTrack(sid, { artist: "A", title: "T1" });
    await persistTrack(sid, { artist: "B", title: "T2" });
    expect(getPendingTrackCount(sid)).toBe(2);

    await persistSession(sid, "DJ Test"); // test mode → marks session ready
    await flushPendingTracks(sid);
    expect(getPendingTrackCount(sid)).toBe(0);
  });

  test("discardPendingTracks clears the buffer (session persist failed)", async () => {
    await persistTrack(sid, { artist: "A", title: "T1" });
    expect(getPendingTrackCount(sid)).toBe(1);
    discardPendingTracks(sid);
    expect(getPendingTrackCount(sid)).toBe(0);
  });

  test("session teardown (clearLastPersistedTrackKey) clears the buffer", async () => {
    await persistTrack(sid, { artist: "A", title: "T1" });
    expect(getPendingTrackCount(sid)).toBe(1);
    clearLastPersistedTrackKey(sid);
    expect(getPendingTrackCount(sid)).toBe(0);
  });

  test("buffer is capped, dropping oldest instead of growing unbounded", async () => {
    for (let i = 0; i < MAX_PENDING_TRACKS + 5; i++) {
      await persistTrack(sid, { artist: "A", title: `T${i}` });
    }
    expect(getPendingTrackCount(sid)).toBe(MAX_PENDING_TRACKS);
  });
});
