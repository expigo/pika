/**
 * DB Persistence Tests
 *
 * @file db-persistence.test.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests database persistence logic for sessions, tracks, likes, and tempo votes.
 * Uses mocks since we can't hit the real database in unit tests.
 *
 * PRODUCTION LOCATION:
 * - ensureSessionPersisted (line 461)
 * - persistSession (line 485)
 * - persistTrack (line 518)
 * - persistLike (line 580)
 * - persistTempoVotes (line 640)
 * - endSessionInDb (line 670)
 */

import { beforeEach, describe, expect, test } from "bun:test";

// ============================================================================
// MOCK DB STATE
// ============================================================================

interface MockSession {
  id: string;
  djName: string;
  djUserId: number | null;
  endedAt: Date | null;
}

interface MockTrack {
  id: number;
  sessionId: string;
  artist: string;
  title: string;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  playedAt: Date;
}

interface MockLike {
  id: number;
  sessionId: string;
  clientId: string | null;
  playedTrackId: number;
}

interface MockTempoVote {
  id: number;
  sessionId: string;
  trackArtist: string;
  trackTitle: string;
  slowerCount: number;
  perfectCount: number;
  fasterCount: number;
}

let sessions: Map<string, MockSession>;
let tracks: MockTrack[];
let likes: MockLike[];
let tempoVotes: MockTempoVote[];
let persistedSessions: Set<string>;
let lastPersistedTrackKey: Map<string, string>;
let operationLog: string[];

// Auto-increment ID
let nextTrackId: number;
let nextLikeId: number;
let nextTempoVoteId: number;

// ============================================================================
// MOCK DB FUNCTIONS (mirrors production patterns)
// ============================================================================

async function ensureSessionPersisted(sessionId: string): Promise<boolean> {
  if (persistedSessions.has(sessionId)) return true;

  const session = sessions.get(sessionId);
  if (session) {
    persistedSessions.add(sessionId);
    return true;
  }
  return false;
}

async function persistSession(
  sessionId: string,
  djName: string,
  djUserId?: number | null,
): Promise<boolean> {
  try {
    // Check for conflict (onConflictDoNothing behavior)
    if (sessions.has(sessionId)) {
      operationLog.push(`session:${sessionId}:conflict`);
      return true;
    }

    sessions.set(sessionId, {
      id: sessionId,
      djName,
      djUserId: djUserId ?? null,
      endedAt: null,
    });
    persistedSessions.add(sessionId);
    operationLog.push(`session:${sessionId}:created`);
    return true;
  } catch (_e) {
    operationLog.push(`session:${sessionId}:error`);
    return false;
  }
}

async function persistTrack(
  sessionId: string,
  track: { artist: string; title: string; bpm?: number; key?: string; energy?: number },
): Promise<boolean> {
  const trackKey = `${track.artist}:${track.title}`;

  // Wait for session
  if (!persistedSessions.has(sessionId)) {
    operationLog.push(`track:${trackKey}:no_session`);
    return false;
  }

  // Deduplication
  if (lastPersistedTrackKey.get(sessionId) === trackKey) {
    operationLog.push(`track:${trackKey}:dedupe`);
    return false;
  }

  tracks.push({
    id: nextTrackId++,
    sessionId,
    artist: track.artist,
    title: track.title,
    bpm: track.bpm ? Math.round(track.bpm) : null,
    key: track.key ?? null,
    energy: track.energy ? Math.round(track.energy) : null,
    playedAt: new Date(),
  });

  lastPersistedTrackKey.set(sessionId, trackKey);
  operationLog.push(`track:${trackKey}:persisted`);
  return true;
}

async function persistLike(
  track: { artist: string; title: string },
  sessionId: string,
  clientId?: string,
  maxRetries = 3,
): Promise<{ success: boolean; attempts: number }> {
  const retryDelays = [100, 200, 400];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Find the played track
    const playedTrack = tracks.find(
      (t) => t.sessionId === sessionId && t.artist === track.artist && t.title === track.title,
    );

    if (playedTrack) {
      likes.push({
        id: nextLikeId++,
        sessionId,
        clientId: clientId ?? null,
        playedTrackId: playedTrack.id,
      });
      operationLog.push(`like:${track.title}:persisted:attempt${attempt + 1}`);
      return { success: true, attempts: attempt + 1 };
    }

    // Wait and retry
    if (attempt < maxRetries - 1) {
      operationLog.push(`like:${track.title}:waiting:attempt${attempt + 1}`);
      await new Promise((r) => setTimeout(r, retryDelays[attempt]));
    }
  }

  operationLog.push(`like:${track.title}:failed:all_retries`);
  return { success: false, attempts: maxRetries };
}

async function persistTempoVotes(
  sessionId: string,
  track: { artist: string; title: string },
  votes: { slower: number; perfect: number; faster: number },
): Promise<boolean> {
  // Skip if no votes
  if (votes.slower === 0 && votes.perfect === 0 && votes.faster === 0) {
    operationLog.push(`tempo:${track.title}:skipped:no_votes`);
    return false;
  }

  tempoVotes.push({
    id: nextTempoVoteId++,
    sessionId,
    trackArtist: track.artist,
    trackTitle: track.title,
    slowerCount: votes.slower,
    perfectCount: votes.perfect,
    fasterCount: votes.faster,
  });

  operationLog.push(`tempo:${track.title}:persisted`);
  return true;
}

async function endSessionInDb(sessionId: string): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (session) {
    session.endedAt = new Date();
    persistedSessions.delete(sessionId);
    operationLog.push(`session:${sessionId}:ended`);
    return true;
  }
  operationLog.push(`session:${sessionId}:not_found`);
  return false;
}

// ============================================================================
// TESTS: Session Persistence
// ============================================================================

describe("DB Persistence - Sessions", () => {
  beforeEach(() => {
    sessions = new Map();
    tracks = [];
    likes = [];
    tempoVotes = [];
    persistedSessions = new Set();
    lastPersistedTrackKey = new Map();
    operationLog = [];
    nextTrackId = 1;
    nextLikeId = 1;
    nextTempoVoteId = 1;
  });

  /**
   * TEST: Create new session
   *
   * RATIONALE:
   * Sessions must be persisted before tracks can be saved.
   */
  test("creates new session", async () => {
    const result = await persistSession("session-1", "DJ Test", 42);

    expect(result).toBe(true);
    expect(sessions.get("session-1")).toBeDefined();
    expect(sessions.get("session-1")?.djName).toBe("DJ Test");
    expect(sessions.get("session-1")?.djUserId).toBe(42);
  });

  /**
   * TEST: Session without userId
   */
  test("creates session without userId", async () => {
    const result = await persistSession("session-anon", "Anonymous DJ");

    expect(result).toBe(true);
    expect(sessions.get("session-anon")?.djUserId).toBeNull();
  });

  /**
   * TEST: Duplicate session does nothing (onConflictDoNothing)
   */
  test("handles duplicate session gracefully", async () => {
    await persistSession("session-1", "DJ First");
    const result = await persistSession("session-1", "DJ Second");

    expect(result).toBe(true);
    expect(sessions.get("session-1")?.djName).toBe("DJ First"); // Original preserved
    expect(operationLog).toContain("session:session-1:conflict");
  });

  /**
   * TEST: ensureSessionPersisted returns true for existing
   */
  test("ensureSessionPersisted finds existing session", async () => {
    await persistSession("session-1", "DJ Test");
    // Clear from memory set to simulate server restart
    persistedSessions.delete("session-1");

    const result = await ensureSessionPersisted("session-1");

    expect(result).toBe(true);
    expect(persistedSessions.has("session-1")).toBe(true);
  });

  /**
   * TEST: ensureSessionPersisted returns false for non-existent
   */
  test("ensureSessionPersisted returns false for missing session", async () => {
    const result = await ensureSessionPersisted("nonexistent");
    expect(result).toBe(false);
  });

  /**
   * TEST: End session
   */
  test("ends session and sets endedAt", async () => {
    await persistSession("session-1", "DJ Test");

    const result = await endSessionInDb("session-1");

    expect(result).toBe(true);
    expect(sessions.get("session-1")?.endedAt).not.toBeNull();
    expect(persistedSessions.has("session-1")).toBe(false);
  });

  /**
   * TEST: End non-existent session
   */
  test("end handles non-existent session", async () => {
    const result = await endSessionInDb("nonexistent");

    expect(result).toBe(false);
    expect(operationLog).toContain("session:nonexistent:not_found");
  });
});

describe("DB Persistence - Tracks", () => {
  beforeEach(() => {
    sessions = new Map();
    tracks = [];
    likes = [];
    tempoVotes = [];
    persistedSessions = new Set();
    lastPersistedTrackKey = new Map();
    operationLog = [];
    nextTrackId = 1;
    nextLikeId = 1;
    nextTempoVoteId = 1;
  });

  /**
   * TEST: Persist track with session
   */
  test("persists track when session exists", async () => {
    await persistSession("session-1", "DJ Test");

    const result = await persistTrack("session-1", {
      artist: "Artist",
      title: "Song",
      bpm: 120.5,
      key: "Am",
    });

    expect(result).toBe(true);
    expect(tracks.length).toBe(1);
    expect(tracks[0].bpm).toBe(121); // Rounded
    expect(tracks[0].key).toBe("Am");
  });

  /**
   * TEST: Track without session fails
   */
  test("fails to persist track without session", async () => {
    const result = await persistTrack("invalid-session", {
      artist: "Artist",
      title: "Song",
    });

    expect(result).toBe(false);
    expect(tracks.length).toBe(0);
  });

  /**
   * TEST: Duplicate track is deduplicated
   */
  test("deduplicates same track", async () => {
    await persistSession("session-1", "DJ Test");

    await persistTrack("session-1", { artist: "Artist", title: "Song" });
    const result = await persistTrack("session-1", { artist: "Artist", title: "Song" });

    expect(result).toBe(false);
    expect(tracks.length).toBe(1);
    expect(operationLog).toContain("track:Artist:Song:dedupe");
  });

  /**
   * TEST: Different tracks are both persisted
   */
  test("persists different tracks", async () => {
    await persistSession("session-1", "DJ Test");

    await persistTrack("session-1", { artist: "Artist", title: "Song 1" });
    await persistTrack("session-1", { artist: "Artist", title: "Song 2" });

    expect(tracks.length).toBe(2);
  });

  /**
   * TEST: Track metrics are optional
   */
  test("handles missing metrics gracefully", async () => {
    await persistSession("session-1", "DJ Test");

    await persistTrack("session-1", { artist: "Artist", title: "Song" });

    expect(tracks[0].bpm).toBeNull();
    expect(tracks[0].key).toBeNull();
    expect(tracks[0].energy).toBeNull();
  });
});

describe("DB Persistence - Likes", () => {
  beforeEach(() => {
    sessions = new Map();
    tracks = [];
    likes = [];
    tempoVotes = [];
    persistedSessions = new Set();
    lastPersistedTrackKey = new Map();
    operationLog = [];
    nextTrackId = 1;
    nextLikeId = 1;
    nextTempoVoteId = 1;
  });

  /**
   * TEST: Persist like when track exists
   */
  test("persists like when track exists", async () => {
    await persistSession("session-1", "DJ Test");
    await persistTrack("session-1", { artist: "Artist", title: "Song" });

    const result = await persistLike({ artist: "Artist", title: "Song" }, "session-1", "client-1");

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(likes.length).toBe(1);
    expect(likes[0].clientId).toBe("client-1");
  });

  /**
   * TEST: Like retries when track not yet persisted
   */
  test("retries when track not immediately available", async () => {
    await persistSession("session-1", "DJ Test");

    // Start like before track exists
    const likePromise = persistLike(
      { artist: "Artist", title: "Delayed Song" },
      "session-1",
      "client-1",
    );

    // Simulate delayed track persistence
    setTimeout(async () => {
      await persistTrack("session-1", { artist: "Artist", title: "Delayed Song" });
    }, 50);

    const result = await likePromise;

    // Should succeed after retry
    expect(result.success).toBe(true);
    expect(result.attempts).toBeGreaterThan(1);
  });

  /**
   * TEST: Like fails after max retries
   */
  test("fails after max retries if track never appears", async () => {
    await persistSession("session-1", "DJ Test");

    const result = await persistLike(
      { artist: "Artist", title: "Missing Song" },
      "session-1",
      "client-1",
      2, // Only 2 retries for faster test
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
    expect(operationLog).toContain("like:Missing Song:failed:all_retries");
  });

  /**
   * TEST: Like without clientId
   */
  test("persists like without clientId", async () => {
    await persistSession("session-1", "DJ Test");
    await persistTrack("session-1", { artist: "Artist", title: "Song" });

    const result = await persistLike({ artist: "Artist", title: "Song" }, "session-1");

    expect(result.success).toBe(true);
    expect(likes[0].clientId).toBeNull();
  });

  /**
   * TEST: Multiple likes for same track
   */
  test("persists multiple likes from different clients", async () => {
    await persistSession("session-1", "DJ Test");
    await persistTrack("session-1", { artist: "Artist", title: "Song" });

    await persistLike({ artist: "Artist", title: "Song" }, "session-1", "client-1");
    await persistLike({ artist: "Artist", title: "Song" }, "session-1", "client-2");
    await persistLike({ artist: "Artist", title: "Song" }, "session-1", "client-3");

    expect(likes.length).toBe(3);
  });
});

describe("DB Persistence - Tempo Votes", () => {
  beforeEach(() => {
    sessions = new Map();
    tracks = [];
    likes = [];
    tempoVotes = [];
    persistedSessions = new Set();
    lastPersistedTrackKey = new Map();
    operationLog = [];
    nextTrackId = 1;
    nextLikeId = 1;
    nextTempoVoteId = 1;
  });

  /**
   * TEST: Persist tempo votes
   */
  test("persists tempo votes", async () => {
    await persistSession("session-1", "DJ Test");

    const result = await persistTempoVotes(
      "session-1",
      { artist: "Artist", title: "Song" },
      { slower: 3, perfect: 10, faster: 5 },
    );

    expect(result).toBe(true);
    expect(tempoVotes.length).toBe(1);
    expect(tempoVotes[0].slowerCount).toBe(3);
    expect(tempoVotes[0].perfectCount).toBe(10);
    expect(tempoVotes[0].fasterCount).toBe(5);
  });

  /**
   * TEST: Skip persistence when no votes
   */
  test("skips when all votes are zero", async () => {
    const result = await persistTempoVotes(
      "session-1",
      { artist: "Artist", title: "Song" },
      { slower: 0, perfect: 0, faster: 0 },
    );

    expect(result).toBe(false);
    expect(tempoVotes.length).toBe(0);
    expect(operationLog).toContain("tempo:Song:skipped:no_votes");
  });

  /**
   * TEST: Persist even with single vote category
   */
  test("persists with single vote category", async () => {
    const result = await persistTempoVotes(
      "session-1",
      { artist: "Artist", title: "Song" },
      { slower: 0, perfect: 1, faster: 0 },
    );

    expect(result).toBe(true);
    expect(tempoVotes[0].perfectCount).toBe(1);
  });

  /**
   * TEST: Multiple tempo votes for different tracks
   */
  test("persists tempo votes for multiple tracks", async () => {
    await persistTempoVotes(
      "s1",
      { artist: "A", title: "T1" },
      { slower: 1, perfect: 2, faster: 3 },
    );
    await persistTempoVotes(
      "s1",
      { artist: "A", title: "T2" },
      { slower: 4, perfect: 5, faster: 6 },
    );

    expect(tempoVotes.length).toBe(2);
    expect(tempoVotes[0].trackTitle).toBe("T1");
    expect(tempoVotes[1].trackTitle).toBe("T2");
  });
});

describe("DB Persistence - Integration Scenarios", () => {
  beforeEach(() => {
    sessions = new Map();
    tracks = [];
    likes = [];
    tempoVotes = [];
    persistedSessions = new Set();
    lastPersistedTrackKey = new Map();
    operationLog = [];
    nextTrackId = 1;
    nextLikeId = 1;
    nextTempoVoteId = 1;
  });

  /**
   * TEST: Full session lifecycle
   */
  test("handles full session lifecycle", async () => {
    // 1. Start session
    await persistSession("session-1", "DJ Integration", 1);

    // 2. Play tracks
    await persistTrack("session-1", { artist: "A1", title: "T1", bpm: 120 });
    await persistTrack("session-1", { artist: "A2", title: "T2", bpm: 128 });

    // 3. Receive likes
    await persistLike({ artist: "A1", title: "T1" }, "session-1", "c1");
    await persistLike({ artist: "A2", title: "T2" }, "session-1", "c2");

    // 4. Tempo votes
    await persistTempoVotes(
      "session-1",
      { artist: "A1", title: "T1" },
      { slower: 0, perfect: 5, faster: 2 },
    );

    // 5. End session
    await endSessionInDb("session-1");

    // Verify final state
    expect(sessions.get("session-1")?.endedAt).not.toBeNull();
    expect(tracks.length).toBe(2);
    expect(likes.length).toBe(2);
    expect(tempoVotes.length).toBe(1);
  });

  /**
   * TEST: Multiple concurrent sessions
   */
  test("handles multiple concurrent sessions", async () => {
    await persistSession("session-A", "DJ Alpha");
    await persistSession("session-B", "DJ Beta");

    await persistTrack("session-A", { artist: "Artist", title: "Song A" });
    await persistTrack("session-B", { artist: "Artist", title: "Song B" });

    await persistLike({ artist: "Artist", title: "Song A" }, "session-A");
    await persistLike({ artist: "Artist", title: "Song B" }, "session-B");

    expect(sessions.size).toBe(2);
    expect(tracks.length).toBe(2);
    expect(likes.length).toBe(2);

    // Likes are correctly associated
    expect(likes.find((l) => l.sessionId === "session-A")).toBeDefined();
    expect(likes.find((l) => l.sessionId === "session-B")).toBeDefined();
  });

  /**
   * TEST: Operations after session ends fail gracefully
   */
  test("track persistence fails after session ends", async () => {
    await persistSession("session-1", "DJ Test");
    await endSessionInDb("session-1");

    // Try to persist track after session ended
    const result = await persistTrack("session-1", { artist: "Artist", title: "Late Song" });

    expect(result).toBe(false);
  });
});
