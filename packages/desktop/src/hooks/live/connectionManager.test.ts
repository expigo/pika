import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { prepareInitialTrackState, createDatabaseSession } from "./connectionManager";
import { sessionRepository } from "../../db/repositories/sessionRepository";
import {
  clearProcessedTrackKeys,
  setLastBroadcastedTrackKey,
  setSkipInitialTrackBroadcast,
  addProcessedTrackKey,
} from "./stateHelpers";

// Mock dependencies
vi.mock("../../db/repositories/sessionRepository", () => ({
  sessionRepository: {
    createSession: vi.fn(),
    setCloudSessionId: vi.fn(),
  },
}));

vi.mock("./stateHelpers", () => ({
  clearProcessedTrackKeys: vi.fn(),
  setLastBroadcastedTrackKey: vi.fn(),
  setSkipInitialTrackBroadcast: vi.fn(),
  addProcessedTrackKey: vi.fn(),
}));

describe("connectionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createDatabaseSession", () => {
    /**
     * TEST: createDatabaseSession creates and links DB session
     * RATIONALE: Must ensure DB records are created for local persistence
     * FAILURE IMPACT: Session history lost if DB creation fails
     */
    it("should create a session and set its cloud ID", async () => {
      const mockSession = { id: 123, name: "Test Set" };
      (sessionRepository.createSession as Mock).mockResolvedValue(mockSession);

      const result = await createDatabaseSession("Test Set", "cloud-123");

      expect(sessionRepository.createSession).toHaveBeenCalledWith("Test Set");
      expect(sessionRepository.setCloudSessionId).toHaveBeenCalledWith(123, "cloud-123");
      expect(result).toBe(123);
    });

    it("should use a default name if none provided", async () => {
      (sessionRepository.createSession as Mock).mockResolvedValue({ id: 456 });

      await createDatabaseSession(undefined, "cloud-456");

      expect(sessionRepository.createSession).toHaveBeenCalledWith(
        expect.stringContaining("Live Set"),
      );
    });
  });

  describe("prepareInitialTrackState", () => {
    const mockTrack = {
      artist: "Test Artist",
      title: "Test Track",
      filePath: "/path/to/test",
      timestamp: new Date(),
    };

    /**
     * TEST: includeCurrentTrack=true marks track as processed
     * RATIONALE: Even if including, we mark as processed for recordPlay to prevent double-counting
     * FAILURE IMPACT: Duplicate track entries in history
     */
    it("should prepare state to include current track but prevent double-count", () => {
      prepareInitialTrackState(mockTrack as unknown as any, true);

      expect(clearProcessedTrackKeys).toHaveBeenCalled();
      expect(setLastBroadcastedTrackKey).toHaveBeenCalledWith(null);
      expect(setSkipInitialTrackBroadcast).toHaveBeenCalledWith(false);
      expect(addProcessedTrackKey).toHaveBeenCalledWith(
        expect.stringContaining("Test Artist-Test Track"),
      );
      expect(setLastBroadcastedTrackKey).toHaveBeenCalledWith("Test Artist:Test Track");
    });

    /**
     * TEST: includeCurrentTrack=false skips broadcast
     * RATIONALE: Respect user choice to start fresh
     * FAILURE IMPACT: Immediate broadcast of track user wanted to skip
     */
    it("should prepare state to skip initial track", () => {
      prepareInitialTrackState(mockTrack as unknown as any, false);

      expect(setSkipInitialTrackBroadcast).toHaveBeenCalledWith(true);
      expect(addProcessedTrackKey).toHaveBeenCalledWith(
        expect.stringContaining("Test Artist-Test Track"),
      );
    });

    it("should do nothing if no initial track provided", () => {
      prepareInitialTrackState(null, true);

      expect(clearProcessedTrackKeys).toHaveBeenCalled();
      expect(addProcessedTrackKey).not.toHaveBeenCalled();
    });
  });
});
