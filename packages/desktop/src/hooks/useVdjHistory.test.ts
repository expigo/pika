import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { useVdjHistory, type VdjHistoryTrack } from "./useVdjHistory";
import { invoke } from "@tauri-apps/api/core";
import { findOrCreateTrack } from "../services/trackService";
import { sessionRepository } from "../db/repositories/sessionRepository";

// Mock dependencies
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("react", () => ({
  useCallback: (fn: unknown) => fn,
}));

vi.mock("../services/trackService", () => ({
  findOrCreateTrack: vi.fn(),
}));

vi.mock("../db/repositories/sessionRepository", () => ({
  sessionRepository: {
    addPlay: vi.fn(),
  },
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe("useVdjHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectSession", () => {
    /**
     * TEST: detectSession identifies session by 30min gap
     * RATIONALE: Core logic for splitting history into sets
     * FAILURE IMPACT: Overgrown sessions including tracks from hours ago
     */
    it("should detect a session boundary based on 30 minute gap", async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockTracks = [
        { artist: "Track 1", title: "T1", timestamp: now - 60 },
        { artist: "Track 2", title: "T2", timestamp: now - 120 },
        { artist: "Old Track", title: "Old", timestamp: now - 3600 }, // 1 hour gap
      ];

      (invoke as Mock).mockResolvedValue(mockTracks);

      const { detectSession } = useVdjHistory();
      const session = await detectSession();

      expect(session).not.toBeNull();
      expect(session?.tracks).toHaveLength(2); // Only T1 and T2
      expect(session?.tracks[0].title).toBe("T2"); // Chronological
      expect(session?.tracks[1].title).toBe("T1");
      expect(session?.sessionGap).toBe(3480 * 1000); // 1h - 2m = 58m gap (in ms)
    });

    /**
     * TEST: detectSession filters tracks older than 24h
     * RATIONALE: Performance and relevance - we only care about recent sets
     * FAILURE IMPACT: Processing stale history data
     */
    it("should ignore tracks older than 24 hours", async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockTracks = [
        { artist: "Track 1", title: "T1", timestamp: now - 3600 },
        { artist: "Ancient", title: "A", timestamp: now - 100000 }, // > 24h
      ];

      (invoke as Mock).mockResolvedValue(mockTracks);

      const { detectSession } = useVdjHistory();
      const session = await detectSession();

      expect(session?.tracks).toHaveLength(1);
    });
  });

  describe("importTracks", () => {
    /**
     * TEST: importTracks calls appropriate services
     * RATIONALE: Must persist tracks and plays to DB
     * FAILURE IMPACT: Missing tracks in cloud set history
     */
    it("should find/create tracks and add plays to DB", async () => {
      const mockTracks: VdjHistoryTrack[] = [
        { artist: "A1", title: "T1", timestamp: 1234567, file_path: "/p1" },
        { artist: "A2", title: "T2", timestamp: 1234568, file_path: "/p2" },
      ];

      (findOrCreateTrack as Mock).mockResolvedValue({ id: 1 });
      const onTrackImported = vi.fn();

      const { importTracks } = useVdjHistory();
      await importTracks(mockTracks, 999, 0, onTrackImported);

      expect(findOrCreateTrack).toHaveBeenCalledTimes(2);
      expect(sessionRepository.addPlay).toHaveBeenCalledTimes(2);
      expect(onTrackImported).toHaveBeenCalledTimes(2);
      expect(onTrackImported).toHaveBeenCalledWith("A1", "T1", 1234567);
    });

    /**
     * TEST: importTracks respects startIndex
     * RATIONALE: Avoid duplicate imports when user chooses a later starting point
     * FAILURE IMPACT: Re-importing tracks user already had in cloud
     */
    it("should respect startIndex for partial import", async () => {
      const mockTracks: VdjHistoryTrack[] = [
        { artist: "A1", title: "T1", timestamp: 1234567, file_path: "/p1" },
        { artist: "A2", title: "T2", timestamp: 1234568, file_path: "/p2" },
      ];

      (findOrCreateTrack as Mock).mockResolvedValue({ id: 1 });

      const { importTracks } = useVdjHistory();
      await importTracks(mockTracks, 999, 1);

      expect(findOrCreateTrack).toHaveBeenCalledTimes(1);
      expect(findOrCreateTrack).toHaveBeenCalledWith("A2", "T2", "/p2");
    });
  });
});
