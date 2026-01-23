/**
 * sessionRepository Unit Tests (Sprint 5)
 *
 * Critical path tests for:
 * - Transaction handling (deleteSession with ROLLBACK)
 * - Session lifecycle (create → plays → end)
 * - Play management (reactions, likes, durations)
 * - Cascade behavior on delete
 * - Session summaries and statistics
 *
 * @file packages/desktop/src/db/repositories/sessionRepository.test.ts
 * @package @pika/desktop
 * @created 2026-01-23
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Session, Play, PlayWithTrack, SessionDetails, AllSessionsSummary } from "./sessionRepository";

// ============================================================================
// Mock Setup
// ============================================================================

const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../index", () => ({
  getSqlite: vi.fn(() =>
    Promise.resolve({
      execute: mockExecute,
      select: mockSelect,
    })
  ),
  db: {
    update: () => ({
      set: () => ({
        where: mockUpdate,
      }),
    }),
  },
}));

// Mock crypto.randomUUID
const mockUUID = "550e8400-e29b-41d4-a716-446655440000";
vi.stubGlobal("crypto", {
  randomUUID: () => mockUUID,
});

// Import after mocking
import { sessionRepository } from "./sessionRepository";

describe("sessionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    mockSelect.mockResolvedValue([]);
    mockUpdate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Session Interface & Type Safety
  // ==========================================================================

  describe("Session interface", () => {
    it("should have all required fields", () => {
      const session: Session = {
        id: 1,
        uuid: mockUUID,
        cloudSessionId: "cloud_abc123",
        djIdentity: "DJ Test",
        name: "Saturday Night Session",
        startedAt: 1705968000,
        endedAt: 1705982400,
      };

      expect(session.id).toBe(1);
      expect(session.uuid).toBe(mockUUID);
      expect(session.cloudSessionId).toBe("cloud_abc123");
      expect(session.djIdentity).toBe("DJ Test");
    });

    it("should allow null for optional fields", () => {
      const session: Session = {
        id: 1,
        uuid: mockUUID,
        cloudSessionId: null,
        djIdentity: "Default",
        name: null,
        startedAt: 1705968000,
        endedAt: null,
      };

      expect(session.cloudSessionId).toBeNull();
      expect(session.name).toBeNull();
      expect(session.endedAt).toBeNull();
    });
  });

  describe("Play interface", () => {
    it("should track all play metadata", () => {
      const play: Play = {
        id: 1,
        sessionId: 1,
        trackId: 42,
        playedAt: 1705968000,
        duration: 210,
        reaction: "peak",
        notes: "Crowd went wild!",
        dancerLikes: 15,
      };

      expect(play.reaction).toBe("peak");
      expect(play.dancerLikes).toBe(15);
    });
  });

  // ==========================================================================
  // 2. Session Lifecycle
  // ==========================================================================

  describe("createSession", () => {
    it("should create a new session with UUID and timestamp", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          uuid: mockUUID,
          cloud_session_id: null,
          dj_identity: "Default",
          name: "Test Session",
          started_at: 1705968000,
          ended_at: null,
        },
      ]);

      const session = await sessionRepository.createSession("Test Session");

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO sessions"),
        expect.arrayContaining([mockUUID, "Default", "Test Session"])
      );
      expect(session.uuid).toBe(mockUUID);
      expect(session.name).toBe("Test Session");
    });

    it("should use default name if not provided", async () => {
      const today = new Date().toLocaleDateString();
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          uuid: mockUUID,
          cloud_session_id: null,
          dj_identity: "Default",
          name: `Session ${today}`,
          started_at: 1705968000,
          ended_at: null,
        },
      ]);

      const session = await sessionRepository.createSession();

      expect(session.name).toContain("Session");
    });

    it("should throw error if session not found after insert", async () => {
      mockSelect.mockResolvedValueOnce([]);

      await expect(sessionRepository.createSession("Test")).rejects.toThrow(
        "Failed to create session"
      );
    });

    it("should accept custom DJ identity", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          uuid: mockUUID,
          cloud_session_id: null,
          dj_identity: "DJ Pro",
          name: "Pro Session",
          started_at: 1705968000,
          ended_at: null,
        },
      ]);

      const session = await sessionRepository.createSession("Pro Session", "DJ Pro");

      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([mockUUID, "DJ Pro"])
      );
      expect(session.djIdentity).toBe("DJ Pro");
    });
  });

  describe("endSession", () => {
    it("should update endedAt timestamp", async () => {
      await sessionRepository.endSession(1);

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("setCloudSessionId", () => {
    it("should update cloud session ID", async () => {
      await sessionRepository.setCloudSessionId(1, "cloud_xyz789");

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. Session Queries
  // ==========================================================================

  describe("getSession", () => {
    it("should return session by ID", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          uuid: mockUUID,
          cloud_session_id: "cloud_abc",
          dj_identity: "DJ Test",
          name: "Test Session",
          started_at: 1705968000,
          ended_at: 1705982400,
        },
      ]);

      const session = await sessionRepository.getSession(1);

      expect(session).not.toBeNull();
      expect(session?.id).toBe(1);
      expect(session?.cloudSessionId).toBe("cloud_abc");
    });

    it("should return null for non-existent session", async () => {
      mockSelect.mockResolvedValueOnce([]);

      const session = await sessionRepository.getSession(999);

      expect(session).toBeNull();
    });
  });

  describe("getActiveSession", () => {
    it("should return session with null endedAt", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 2,
          uuid: mockUUID,
          cloud_session_id: null,
          dj_identity: "Default",
          name: "Live Session",
          started_at: 1705968000,
          ended_at: null,
        },
      ]);

      const session = await sessionRepository.getActiveSession();

      expect(session).not.toBeNull();
      expect(session?.endedAt).toBeNull();
      expect(mockSelect).toHaveBeenCalledWith(
        expect.stringContaining("WHERE ended_at IS NULL")
      );
    });

    it("should return null if no active session", async () => {
      mockSelect.mockResolvedValueOnce([]);

      const session = await sessionRepository.getActiveSession();

      expect(session).toBeNull();
    });
  });

  describe("getAllSessions", () => {
    it("should return sessions ordered by started_at DESC", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 2,
          uuid: "uuid-2",
          cloud_session_id: null,
          dj_identity: "Default",
          name: "Session 2",
          started_at: 1705982400,
          ended_at: null,
        },
        {
          id: 1,
          uuid: "uuid-1",
          cloud_session_id: null,
          dj_identity: "Default",
          name: "Session 1",
          started_at: 1705968000,
          ended_at: 1705975200,
        },
      ]);

      const sessions = await sessionRepository.getAllSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].startedAt).toBeGreaterThan(sessions[1].startedAt);
    });

    it("should respect limit parameter", async () => {
      mockSelect.mockResolvedValueOnce([]);

      await sessionRepository.getAllSessions(10);

      expect(mockSelect).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT ?"),
        [10]
      );
    });

    it("should use default limit of 50", async () => {
      mockSelect.mockResolvedValueOnce([]);

      await sessionRepository.getAllSessions();

      expect(mockSelect).toHaveBeenCalledWith(expect.any(String), [50]);
    });
  });

  // ==========================================================================
  // 4. Play Management
  // ==========================================================================

  describe("addPlay", () => {
    it("should insert a new play with default values", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          session_id: 1,
          track_id: 42,
          played_at: 1705968000,
          duration: null,
          reaction: "neutral",
          notes: null,
          dancer_likes: 0,
        },
      ]);

      const play = await sessionRepository.addPlay(1, 42);

      expect(play.sessionId).toBe(1);
      expect(play.trackId).toBe(42);
      expect(play.reaction).toBe("neutral");
      expect(play.dancerLikes).toBe(0);
    });

    it("should accept custom playedAt timestamp", async () => {
      const customTime = 1705900000;
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          session_id: 1,
          track_id: 42,
          played_at: customTime,
          duration: null,
          reaction: "neutral",
          notes: null,
          dancer_likes: 0,
        },
      ]);

      const play = await sessionRepository.addPlay(1, 42, customTime);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([1, 42, customTime])
      );
      expect(play.playedAt).toBe(customTime);
    });

    it("should throw error if play not found after insert", async () => {
      mockSelect.mockResolvedValueOnce([]);

      await expect(sessionRepository.addPlay(1, 42)).rejects.toThrow(
        "Failed to create play"
      );
    });
  });

  describe("updatePlayReaction", () => {
    it("should update reaction to peak", async () => {
      await sessionRepository.updatePlayReaction(1, "peak");

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should update reaction to brick", async () => {
      await sessionRepository.updatePlayReaction(1, "brick");

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should update reaction to neutral", async () => {
      await sessionRepository.updatePlayReaction(1, "neutral");

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("updatePlayNotes", () => {
    it("should update play notes", async () => {
      await sessionRepository.updatePlayNotes(1, "Great crowd reaction!");

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("updatePlayDuration", () => {
    it("should update play duration in seconds", async () => {
      await sessionRepository.updatePlayDuration(1, 210);

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("incrementDancerLikes", () => {
    it("should increment likes by 1", async () => {
      await sessionRepository.incrementDancerLikes(1);

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("incrementDancerLikesBy", () => {
    it("should increment likes by specified count", async () => {
      await sessionRepository.incrementDancerLikesBy(1, 5);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should not update when count is 0", async () => {
      await sessionRepository.incrementDancerLikesBy(1, 0);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should not update when count is negative", async () => {
      await sessionRepository.incrementDancerLikesBy(1, -5);

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe("getSessionPlays", () => {
    it("should return plays with track info ordered by played_at", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          session_id: 1,
          track_id: 42,
          played_at: 1705968000,
          duration: 180,
          reaction: "peak",
          notes: "Fire!",
          dancer_likes: 10,
          artist: "Artist A",
          title: "Song A",
          bpm: 120,
          key: "Am",
        },
        {
          id: 2,
          session_id: 1,
          track_id: 43,
          played_at: 1705968200,
          duration: 210,
          reaction: "neutral",
          notes: null,
          dancer_likes: 3,
          artist: "Artist B",
          title: "Song B",
          bpm: 128,
          key: "Cm",
        },
      ]);

      const plays = await sessionRepository.getSessionPlays(1);

      expect(plays).toHaveLength(2);
      expect(plays[0].artist).toBe("Artist A");
      expect(plays[1].trackId).toBe(43);
      expect(mockSelect).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY p.played_at ASC"),
        [1]
      );
    });

    it("should handle tracks with null metadata", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          session_id: 1,
          track_id: 42,
          played_at: 1705968000,
          duration: null,
          reaction: "neutral",
          notes: null,
          dancer_likes: 0,
          artist: null,
          title: null,
          bpm: null,
          key: null,
        },
      ]);

      const plays = await sessionRepository.getSessionPlays(1);

      expect(plays[0].artist).toBeNull();
      expect(plays[0].bpm).toBeNull();
    });
  });

  describe("getSessionPlayCount", () => {
    it("should return count of plays in session", async () => {
      mockSelect.mockResolvedValueOnce([{ count: 15 }]);

      const count = await sessionRepository.getSessionPlayCount(1);

      expect(count).toBe(15);
    });

    it("should return 0 for empty session", async () => {
      mockSelect.mockResolvedValueOnce([{ count: 0 }]);

      const count = await sessionRepository.getSessionPlayCount(1);

      expect(count).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Transaction Handling (deleteSession)
  // ==========================================================================

  describe("deleteSession - transaction handling", () => {
    it("should use transaction for atomic delete", async () => {
      await sessionRepository.deleteSession(1);

      // Verify transaction sequence
      const calls = mockExecute.mock.calls;
      expect(calls[0][0]).toBe("BEGIN TRANSACTION");
      expect(calls[1][0]).toContain("DELETE FROM plays");
      expect(calls[2][0]).toContain("DELETE FROM sessions");
      expect(calls[3][0]).toBe("COMMIT");
    });

    it("should delete plays before session (FK constraint)", async () => {
      await sessionRepository.deleteSession(1);

      const calls = mockExecute.mock.calls;
      const playsDeleteIndex = calls.findIndex((c) => c[0].includes("DELETE FROM plays"));
      const sessionDeleteIndex = calls.findIndex((c) => c[0].includes("DELETE FROM sessions"));

      expect(playsDeleteIndex).toBeLessThan(sessionDeleteIndex);
    });

    it("should rollback on plays delete error", async () => {
      mockExecute
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error("FK violation")) // DELETE plays
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(sessionRepository.deleteSession(1)).rejects.toThrow("FK violation");

      const calls = mockExecute.mock.calls;
      expect(calls[calls.length - 1][0]).toBe("ROLLBACK");
    });

    it("should rollback on session delete error", async () => {
      mockExecute
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // DELETE plays
        .mockRejectedValueOnce(new Error("Constraint error")) // DELETE session
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(sessionRepository.deleteSession(1)).rejects.toThrow("Constraint error");

      const calls = mockExecute.mock.calls;
      expect(calls[calls.length - 1][0]).toBe("ROLLBACK");
    });

    it("should pass correct session ID to both deletes", async () => {
      await sessionRepository.deleteSession(42);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM plays WHERE session_id = ?"),
        [42]
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM sessions WHERE id = ?"),
        [42]
      );
    });
  });

  // ==========================================================================
  // 6. Session Details
  // ==========================================================================

  describe("getSessionDetails", () => {
    it("should return null for non-existent session", async () => {
      mockSelect.mockResolvedValueOnce([]); // getSession returns null

      const details = await sessionRepository.getSessionDetails(999);

      expect(details).toBeNull();
    });

    it("should calculate stats from plays", async () => {
      // Mock getSession
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          uuid: mockUUID,
          cloud_session_id: null,
          dj_identity: "Default",
          name: "Test Session",
          started_at: 1705968000,
          ended_at: 1705982400,
        },
      ]);

      // Mock getSessionPlays
      mockSelect.mockResolvedValueOnce([
        { id: 1, session_id: 1, track_id: 1, played_at: 1705968100, duration: 180, reaction: "peak", notes: null, dancer_likes: 5, artist: "A", title: "1", bpm: 120, key: "Am" },
        { id: 2, session_id: 1, track_id: 2, played_at: 1705968300, duration: 200, reaction: "peak", notes: null, dancer_likes: 3, artist: "B", title: "2", bpm: 125, key: "Cm" },
        { id: 3, session_id: 1, track_id: 3, played_at: 1705968500, duration: 190, reaction: "brick", notes: null, dancer_likes: 0, artist: "C", title: "3", bpm: 118, key: "Dm" },
        { id: 4, session_id: 1, track_id: 4, played_at: 1705968700, duration: 210, reaction: "neutral", notes: null, dancer_likes: 1, artist: "D", title: "4", bpm: 122, key: "Em" },
      ]);

      const details = await sessionRepository.getSessionDetails(1);

      expect(details).not.toBeNull();
      expect(details?.stats.totalTracks).toBe(4);
      expect(details?.stats.peakCount).toBe(2);
      expect(details?.stats.brickCount).toBe(1);
    });

    it("should calculate duration from endedAt - startedAt", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          uuid: mockUUID,
          cloud_session_id: null,
          dj_identity: "Default",
          name: "Test Session",
          started_at: 1705968000,
          ended_at: 1705975200, // 2 hours later
        },
      ]);
      mockSelect.mockResolvedValueOnce([]);

      const details = await sessionRepository.getSessionDetails(1);

      expect(details?.stats.duration).toBe(7200); // 2 hours in seconds
    });
  });

  // ==========================================================================
  // 7. Session Summaries
  // ==========================================================================

  describe("getAllSessionsSummary", () => {
    it("should return aggregated stats across all sessions", async () => {
      // Session count
      mockSelect.mockResolvedValueOnce([{ count: 5 }]);
      // Play stats
      mockSelect.mockResolvedValueOnce([
        {
          total_plays: 75,
          total_peaks: 20,
          total_bricks: 5,
          total_duration: 15000,
          total_likes: 150,
        },
      ]);
      // Total duration from sessions
      mockSelect.mockResolvedValueOnce([{ total: 36000 }]);
      // Unique tracks
      mockSelect.mockResolvedValueOnce([{ count: 50 }]);
      // Top liked
      mockSelect.mockResolvedValueOnce([
        { track_id: 1, artist: "Artist A", title: "Hit Song", total_likes: 45 },
      ]);
      // Top peaked
      mockSelect.mockResolvedValueOnce([
        { track_id: 2, artist: "Artist B", title: "Peak Track", peak_count: 8 },
      ]);
      // Top sessions
      mockSelect.mockResolvedValueOnce([
        { session_id: 3, session_name: "Best Night", peak_count: 12, track_count: 20 },
      ]);

      const summary = await sessionRepository.getAllSessionsSummary();

      expect(summary.totalSessions).toBe(5);
      expect(summary.totalPlays).toBe(75);
      expect(summary.totalPeaks).toBe(20);
      expect(summary.totalBricks).toBe(5);
      expect(summary.uniqueTracks).toBe(50);
      expect(summary.totalLikes).toBe(150);
      expect(summary.topLikedTracks).toHaveLength(1);
      expect(summary.topLikedTracks[0].totalLikes).toBe(45);
      expect(summary.topPeakedTracks).toHaveLength(1);
      expect(summary.topSessions).toHaveLength(1);
    });

    it("should handle empty database gracefully", async () => {
      mockSelect.mockResolvedValue([{ count: 0 }]);
      mockSelect.mockResolvedValueOnce([{ count: 0 }]); // sessions
      mockSelect.mockResolvedValueOnce([
        {
          total_plays: 0,
          total_peaks: 0,
          total_bricks: 0,
          total_duration: 0,
          total_likes: 0,
        },
      ]);
      mockSelect.mockResolvedValueOnce([{ total: 0 }]); // duration
      mockSelect.mockResolvedValueOnce([{ count: 0 }]); // unique tracks
      mockSelect.mockResolvedValueOnce([]); // top liked
      mockSelect.mockResolvedValueOnce([]); // top peaked
      mockSelect.mockResolvedValueOnce([]); // top sessions

      const summary = await sessionRepository.getAllSessionsSummary();

      expect(summary.totalSessions).toBe(0);
      expect(summary.totalPlays).toBe(0);
      expect(summary.topLikedTracks).toEqual([]);
      expect(summary.topPeakedTracks).toEqual([]);
      expect(summary.topSessions).toEqual([]);
    });
  });

  // ==========================================================================
  // 8. Concurrent Operations
  // ==========================================================================

  describe("concurrent operations", () => {
    it("should handle concurrent play additions", async () => {
      mockSelect.mockResolvedValue([
        {
          id: 1,
          session_id: 1,
          track_id: 1,
          played_at: 1705968000,
          duration: null,
          reaction: "neutral",
          notes: null,
          dancer_likes: 0,
        },
      ]);

      const promises = [
        sessionRepository.addPlay(1, 1),
        sessionRepository.addPlay(1, 2),
        sessionRepository.addPlay(1, 3),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((play) => {
        expect(play).toHaveProperty("id");
        expect(play).toHaveProperty("sessionId");
      });
    });

    it("should handle concurrent reaction updates", async () => {
      const promises = [
        sessionRepository.updatePlayReaction(1, "peak"),
        sessionRepository.updatePlayReaction(2, "brick"),
        sessionRepository.updatePlayReaction(3, "neutral"),
      ];

      await Promise.all(promises);

      expect(mockUpdate).toHaveBeenCalledTimes(3);
    });

    it("should handle concurrent like increments", async () => {
      const promises = [
        sessionRepository.incrementDancerLikes(1),
        sessionRepository.incrementDancerLikes(1),
        sessionRepository.incrementDancerLikes(1),
      ];

      await Promise.all(promises);

      expect(mockUpdate).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // 9. Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle very long session names", async () => {
      const longName = "A".repeat(500);
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          uuid: mockUUID,
          cloud_session_id: null,
          dj_identity: "Default",
          name: longName,
          started_at: 1705968000,
          ended_at: null,
        },
      ]);

      const session = await sessionRepository.createSession(longName);

      expect(session.name).toBe(longName);
    });

    it("should handle special characters in notes", async () => {
      const specialNotes = "🔥 Peak moment! \"Crowd went crazy\" & <loud>";

      await sessionRepository.updatePlayNotes(1, specialNotes);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should handle session with zero duration", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          uuid: mockUUID,
          cloud_session_id: null,
          dj_identity: "Default",
          name: "Quick Session",
          started_at: 1705968000,
          ended_at: 1705968000, // Same time = 0 duration
        },
      ]);
      mockSelect.mockResolvedValueOnce([]);

      const details = await sessionRepository.getSessionDetails(1);

      expect(details?.stats.duration).toBe(0);
    });
  });
});
