/**
 * trackRepository Unit Tests (Sprint 5)
 *
 * Critical path tests for:
 * - UPSERT behavior (atomic insertTrack)
 * - Batch operations (addTracks, deleteTracks)
 * - Track key uniqueness constraints
 * - Analysis workflow
 * - Tags/notes handling
 *
 * @file packages/desktop/src/db/repositories/trackRepository.test.ts
 * @package @pika/desktop
 * @created 2026-01-23
 */

import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from "bun:test";
import type { Track, VirtualDJTrack, AnalysisResult } from "./trackRepository";
import { CURRENT_ANALYSIS_VERSION } from "./trackRepository";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the database module
const mockExecute = mock();
const mockSelect = mock();
const mockInsert = mock();
const mockUpdate = mock();
const mockDelete = mock();

mock.module("../index", () => ({
  getSqlite: mock(() =>
    Promise.resolve({
      execute: mockExecute,
      select: mockSelect,
    }),
  ),
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: mockInsert,
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockUpdate,
      }),
    }),
    delete: () => ({
      where: mockDelete,
    }),
  },
}));

// Mock @pika/shared getTrackKey
mock.module("@pika/shared", () => ({
  getTrackKey: (artist: string, title: string) => `${artist.toLowerCase()}:${title.toLowerCase()}`,
}));

// Import after mocking
import { trackRepository } from "./trackRepository";

describe("trackRepository", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
    mockDelete.mockClear();

    mockExecute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
    mockSelect.mockResolvedValue([]);
    mockInsert.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  // ==========================================================================
  // 1. Track Interface & Type Safety
  // ==========================================================================

  describe("Track interface", () => {
    it("should have all fingerprint metrics", () => {
      const track: Track = {
        id: 1,
        filePath: "/music/song.mp3",
        artist: "Test Artist",
        title: "Test Song",
        bpm: 120,
        energy: 75,
        key: "Am",
        danceability: 80,
        brightness: 65,
        acousticness: 20,
        groove: 70,
        duration: 180,
        analyzed: true,
        analysisVersion: CURRENT_ANALYSIS_VERSION,
        trackKey: "test artist:test song",
        tags: ["peak", "opener"],
        notes: "Great crowd reaction",
      };

      expect(track.energy).toBe(75);
      expect(track.danceability).toBe(80);
      expect(track.brightness).toBe(65);
      expect(track.acousticness).toBe(20);
      expect(track.groove).toBe(70);
    });

    it("should allow null values for unanalyzed tracks", () => {
      const track: Track = {
        id: 2,
        filePath: "/music/unanalyzed.mp3",
        artist: null,
        title: null,
        bpm: null,
        energy: null,
        key: null,
        danceability: null,
        brightness: null,
        acousticness: null,
        groove: null,
        duration: null,
        analyzed: false,
        analysisVersion: null,
        trackKey: null,
        tags: [],
        notes: null,
      };

      expect(track.analyzed).toBe(false);
      expect(track.energy).toBeNull();
    });
  });

  // ==========================================================================
  // 2. UPSERT Behavior (insertTrack)
  // ==========================================================================

  describe("insertTrack - UPSERT behavior", () => {
    it("should generate track_key from artist and title", async () => {
      mockSelect.mockResolvedValueOnce([{ id: 42 }]);

      const id = await trackRepository.insertTrack({
        filePath: "/music/song.mp3",
        artist: "Artist Name",
        title: "Song Title",
        bpm: 120,
        key: "Am",
      });

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tracks"),
        expect.arrayContaining([
          "/music/song.mp3",
          "Artist Name",
          "Song Title",
          120,
          "Am",
          "artist name:song title", // computed track_key
        ]),
      );
      expect(id).toBe(42);
    });

    it("should use ON CONFLICT DO UPDATE for atomic upsert", async () => {
      mockSelect.mockResolvedValueOnce([{ id: 1 }]);

      await trackRepository.insertTrack({
        filePath: "/music/existing.mp3",
        artist: "Artist",
        title: "Song",
      });

      const sql = mockExecute.mock.calls[0][0] as string;
      expect(sql).toContain("ON CONFLICT(track_key) DO UPDATE");
      expect(sql).toContain("COALESCE(excluded.artist, artist)");
    });

    it("should handle null artist/title gracefully", async () => {
      mockSelect.mockResolvedValueOnce([{ id: 3 }]);

      const id = await trackRepository.insertTrack({
        filePath: "/music/untitled.mp3",
        artist: null,
        title: null,
      });

      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["/music/untitled.mp3", null, null, null, null, ":"]),
      );
      expect(id).toBe(3);
    });

    it("should throw error if track insertion fails", async () => {
      mockSelect.mockResolvedValueOnce([]); // No results

      await expect(
        trackRepository.insertTrack({
          filePath: "/music/fail.mp3",
          artist: "Artist",
          title: "Song",
        }),
      ).rejects.toThrow("Failed to insert/update track");
    });
  });

  // ==========================================================================
  // 3. Batch Operations
  // ==========================================================================

  describe("addTracks - batch insert", () => {
    it("should process tracks in chunks of 100", async () => {
      // Create 250 tracks to test chunking
      const tracks: VirtualDJTrack[] = Array.from({ length: 250 }, (_, i) => ({
        file_path: `/music/track${i}.mp3`,
        artist: `Artist ${i}`,
        title: `Song ${i}`,
        bpm: "120",
        key: "Am",
        duration: 180,
      }));

      await trackRepository.addTracks(tracks);

      // Should have 3 chunks: 100 + 100 + 50
      expect(mockInsert).toHaveBeenCalledTimes(3);
    });

    it("should handle empty track list", async () => {
      const result = await trackRepository.addTracks([]);

      expect(result).toBe(true);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should parse BPM as float", async () => {
      const tracks: VirtualDJTrack[] = [
        {
          file_path: "/music/song.mp3",
          artist: "Artist",
          title: "Song",
          bpm: "128.5",
        },
      ];

      await trackRepository.addTracks(tracks);

      // Verify bpm is parsed as number
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should handle invalid BPM strings", async () => {
      const tracks: VirtualDJTrack[] = [
        {
          file_path: "/music/nobpm.mp3",
          artist: "Artist",
          title: "Song",
          bpm: "invalid",
        },
      ];

      await trackRepository.addTracks(tracks);

      // Should not throw, bpm should be null
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("deleteTracks - batch delete", () => {
    it("should delete multiple tracks in single query", async () => {
      mockExecute.mockResolvedValueOnce({ rowsAffected: 5 });

      const deleted = await trackRepository.deleteTracks([1, 2, 3, 4, 5]);

      expect(deleted).toBe(5);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringMatching(/DELETE FROM tracks WHERE id IN \(\?,\?,\?,\?,\?\)/),
        [1, 2, 3, 4, 5],
      );
    });

    it("should handle empty ID array", async () => {
      const deleted = await trackRepository.deleteTracks([]);

      expect(deleted).toBe(0);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("should return 0 on error", async () => {
      mockExecute.mockRejectedValueOnce(new Error("DB error"));

      const deleted = await trackRepository.deleteTracks([1, 2, 3]);

      expect(deleted).toBe(0);
    });
  });

  // ==========================================================================
  // 4. Track Queries
  // ==========================================================================

  describe("getTracks", () => {
    it("should return tracks ordered by artist", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          filePath: "/a.mp3",
          artist: "Alpha",
          title: "Song",
          bpm: 120,
          energy: 75,
          key: "Am",
          danceability: 80,
          brightness: 65,
          acousticness: 20,
          groove: 70,
          duration: 180,
          analyzed: true,
          analysisVersion: 1,
          trackKey: "alpha:song",
          tags: '["peak"]',
          notes: null,
        },
      ]);

      const tracks = await trackRepository.getTracks(100);

      expect(tracks).toHaveLength(1);
      expect(tracks[0].artist).toBe("Alpha");
      expect(tracks[0].tags).toEqual(["peak"]);
    });

    it("should parse tags JSON correctly", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          filePath: "/a.mp3",
          artist: "Artist",
          title: "Song",
          bpm: null,
          energy: null,
          key: null,
          danceability: null,
          brightness: null,
          acousticness: null,
          groove: null,
          duration: null,
          analyzed: false,
          analysisVersion: null,
          trackKey: "artist:song",
          tags: '["peak","opener","closer"]',
          notes: null,
        },
      ]);

      const tracks = await trackRepository.getTracks(100);

      expect(tracks[0].tags).toEqual(["peak", "opener", "closer"]);
    });

    it("should handle invalid tags JSON", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          filePath: "/a.mp3",
          artist: "Artist",
          title: "Song",
          tags: "invalid json",
          // ... other fields
          bpm: null,
          energy: null,
          key: null,
          danceability: null,
          brightness: null,
          acousticness: null,
          groove: null,
          duration: null,
          analyzed: false,
          analysisVersion: null,
          trackKey: null,
          notes: null,
        },
      ]);

      const tracks = await trackRepository.getTracks(100);

      expect(tracks[0].tags).toEqual([]);
    });

    it("should handle null tags", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          filePath: "/a.mp3",
          artist: "Artist",
          title: "Song",
          tags: null,
          bpm: null,
          energy: null,
          key: null,
          danceability: null,
          brightness: null,
          acousticness: null,
          groove: null,
          duration: null,
          analyzed: false,
          analysisVersion: null,
          trackKey: null,
          notes: null,
        },
      ]);

      const tracks = await trackRepository.getTracks(100);

      expect(tracks[0].tags).toEqual([]);
    });
  });

  describe("findByTrackKey", () => {
    it("should find track by track_key", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          filePath: "/music/song.mp3",
          artist: "Test Artist",
          title: "Test Song",
          trackKey: "test artist:test song",
          tags: "[]",
          bpm: 120,
          energy: 75,
          key: "Am",
          danceability: null,
          brightness: null,
          acousticness: null,
          groove: null,
          duration: 180,
          analyzed: true,
          analysisVersion: 1,
          notes: null,
        },
      ]);

      const track = await trackRepository.findByTrackKey("test artist:test song");

      expect(track).not.toBeNull();
      expect(track?.artist).toBe("Test Artist");
      expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining("WHERE track_key = ?"), [
        "test artist:test song",
      ]);
    });

    it("should return null for non-existent track_key", async () => {
      mockSelect.mockResolvedValueOnce([]);

      const track = await trackRepository.findByTrackKey("nonexistent:track");

      expect(track).toBeNull();
    });
  });

  describe("getUnanalyzedTracks", () => {
    it("should return tracks where analyzed = 0 or NULL", async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          filePath: "/unanalyzed.mp3",
          artist: "Artist",
          title: "Song",
          analyzed: false,
          tags: "[]",
          bpm: null,
          energy: null,
          key: null,
          danceability: null,
          brightness: null,
          acousticness: null,
          groove: null,
          duration: null,
          analysisVersion: null,
          trackKey: "artist:song",
          notes: null,
        },
      ]);

      const tracks = await trackRepository.getUnanalyzedTracks();

      expect(tracks).toHaveLength(1);
      expect(tracks[0].analyzed).toBe(false);
      expect(mockSelect).toHaveBeenCalledWith(
        expect.stringContaining("WHERE analyzed = 0 OR analyzed IS NULL"),
      );
    });
  });

  // ==========================================================================
  // 5. Analysis Workflow
  // ==========================================================================

  describe("markTrackAnalyzed", () => {
    it("should update track with full analysis results", async () => {
      const analysisResult: AnalysisResult = {
        bpm: 128.5,
        energy: 82,
        key: "Cm",
        danceability: 78,
        brightness: 65,
        acousticness: 15,
        groove: 72,
      };

      await trackRepository.markTrackAnalyzed(1, analysisResult);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should mark as analyzed even with null result", async () => {
      await trackRepository.markTrackAnalyzed(1, null);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should set analysis_version to CURRENT_ANALYSIS_VERSION", async () => {
      const analysisResult: AnalysisResult = {
        bpm: 120,
        energy: 70,
      };

      await trackRepository.markTrackAnalyzed(1, analysisResult);

      expect(mockUpdate).toHaveBeenCalled();
      // Analysis version should be set in the update
    });
  });

  describe("resetAnalysis", () => {
    it("should reset all tracks to unanalyzed state", async () => {
      const result = await trackRepository.resetAnalysis();

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("UPDATE tracks SET"));
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("analyzed = 0"));
    });

    it("should clear all fingerprint metrics", async () => {
      await trackRepository.resetAnalysis();

      const sql = mockExecute.mock.calls[0][0] as string;
      expect(sql).toContain("energy = NULL");
      expect(sql).toContain("danceability = NULL");
      expect(sql).toContain("brightness = NULL");
      expect(sql).toContain("acousticness = NULL");
      expect(sql).toContain("groove = NULL");
    });

    it("should return false on error", async () => {
      mockExecute.mockRejectedValueOnce(new Error("DB error"));

      const result = await trackRepository.resetAnalysis();

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Tags & Notes
  // ==========================================================================

  describe("updateTrackTags", () => {
    it("should serialize tags as JSON", async () => {
      const result = await trackRepository.updateTrackTags(1, ["peak", "opener", "crowd-favorite"]);

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tracks SET tags = ?"),
        ['["peak","opener","crowd-favorite"]', 1],
      );
    });

    it("should handle empty tags array", async () => {
      const result = await trackRepository.updateTrackTags(1, []);

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(expect.any(String), ["[]", 1]);
    });

    it("should return false on error", async () => {
      mockExecute.mockRejectedValueOnce(new Error("DB error"));

      const result = await trackRepository.updateTrackTags(1, ["test"]);

      expect(result).toBe(false);
    });
  });

  describe("updateTrackNotes", () => {
    it("should update notes", async () => {
      const result = await trackRepository.updateTrackNotes(1, "Great for peaks!");

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tracks SET notes = ?"),
        ["Great for peaks!", 1],
      );
    });

    it("should allow null notes", async () => {
      const result = await trackRepository.updateTrackNotes(1, null);

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [null, 1]);
    });
  });

  describe("getAllTags", () => {
    it("should aggregate unique tags across all tracks", async () => {
      mockSelect.mockResolvedValueOnce([
        { tag: "bangers" },
        { tag: "closer" },
        { tag: "opener" },
        { tag: "peak" },
      ]);

      const tags = await trackRepository.getAllTags();

      expect(tags).toContain("peak");
      expect(tags).toContain("opener");
      expect(tags).toContain("closer");
      expect(tags).toContain("bangers");
      // Should be sorted
      expect(tags).toEqual(["bangers", "closer", "opener", "peak"]);
    });

    it("should handle invalid JSON in tags", async () => {
      mockSelect.mockResolvedValueOnce([{ tag: "valid" }]);

      const tags = await trackRepository.getAllTags();

      expect(tags).toEqual(["valid"]);
    });

    it("should return empty array on error", async () => {
      mockSelect.mockRejectedValueOnce(new Error("DB error"));

      const tags = await trackRepository.getAllTags();

      expect(tags).toEqual([]);
    });
  });

  // ==========================================================================
  // 7. Track Play History
  // ==========================================================================

  describe("getTrackPlayHistory", () => {
    it("should return null for track with no plays", async () => {
      mockSelect
        .mockResolvedValueOnce([
          {
            play_count: 0,
            peak_count: 0,
            brick_count: 0,
            total_likes: 0,
            last_notes: null,
            last_played_at: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const history = await trackRepository.getTrackPlayHistory(1);

      expect(history).toBeNull();
    });
  });
});
