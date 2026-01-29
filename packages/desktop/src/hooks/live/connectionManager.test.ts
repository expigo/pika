import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import {
  prepareInitialTrackState,
  createDatabaseSession,
  detectInitialTrack,
  startVirtualDJWatcher,
} from "./connectionManager";
import { sessionRepository } from "../../db/repositories/sessionRepository";
import {
  clearProcessedTrackKeys,
  setLastBroadcastedTrackKey,
  setSkipInitialTrackBroadcast,
  addProcessedTrackKey,
} from "./stateHelpers";
import { virtualDjWatcher, type NowPlayingTrack } from "../../services/virtualDjWatcher";

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

vi.mock("../../services/virtualDjWatcher", () => ({
  virtualDjWatcher: {
    readLatestTrack: vi.fn(),
    startWatching: vi.fn(),
    getCurrentTrack: vi.fn(),
  },
}));

vi.mock("../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe("connectionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectInitialTrack", () => {
    it("should call virtualDjWatcher.readLatestTrack", async () => {
      await detectInitialTrack();
      expect(virtualDjWatcher.readLatestTrack).toHaveBeenCalled();
    });
  });

  describe("startVirtualDJWatcher", () => {
    it("should call virtualDjWatcher.startWatching", async () => {
      await startVirtualDJWatcher();
      expect(virtualDjWatcher.startWatching).toHaveBeenCalled();
    });
  });

  describe("createDatabaseSession", () => {
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

    it("should prepare state to include current track but prevent double-count", () => {
      prepareInitialTrackState(mockTrack as unknown as NowPlayingTrack, true);

      expect(clearProcessedTrackKeys).toHaveBeenCalled();
      expect(setLastBroadcastedTrackKey).toHaveBeenCalledWith(null);
      expect(setSkipInitialTrackBroadcast).toHaveBeenCalledWith(false);
      expect(addProcessedTrackKey).toHaveBeenCalledWith(
        expect.stringContaining("Test Artist-Test Track"),
      );
      expect(setLastBroadcastedTrackKey).toHaveBeenCalledWith("Test Artist:Test Track");
    });

    it("should prepare state to skip initial track", () => {
      prepareInitialTrackState(mockTrack as unknown as NowPlayingTrack, false);

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
