/**
 * useLiveStore Unit Tests
 *
 * Tests the Zustand store for live session state.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useLiveStore } from "./useLiveStore";

describe("useLiveStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useLiveStore.getState().reset();
  });

  describe("initial state", () => {
    it("should have correct default values", () => {
      const state = useLiveStore.getState();

      expect(state.status).toBe("offline");
      expect(state.nowPlaying).toBeNull();
      expect(state.error).toBeNull();
      expect(state.sessionId).toBeNull();
      expect(state.dbSessionId).toBeNull();
      expect(state.currentPlayId).toBeNull();
      expect(state.listenerCount).toBe(0);
      expect(state.tempoFeedback).toBeNull();
      expect(state.activePoll).toBeNull();
      expect(state.endedPoll).toBeNull();
      expect(state.liveLikes).toBe(0);
      expect(state.playedTrackKeys.size).toBe(0);
    });
  });

  describe("setStatus", () => {
    it("should update status", () => {
      useLiveStore.getState().setStatus("connecting");
      expect(useLiveStore.getState().status).toBe("connecting");

      useLiveStore.getState().setStatus("live");
      expect(useLiveStore.getState().status).toBe("live");
    });
  });

  describe("setListenerCount", () => {
    it("should update listener count", () => {
      useLiveStore.getState().setListenerCount(42);
      expect(useLiveStore.getState().listenerCount).toBe(42);
    });
  });

  describe("liveLikes", () => {
    it("should set likes count", () => {
      useLiveStore.getState().setLiveLikes(10);
      expect(useLiveStore.getState().liveLikes).toBe(10);
    });

    it("should increment likes", () => {
      useLiveStore.getState().setLiveLikes(5);
      useLiveStore.getState().incrementLiveLikes();
      expect(useLiveStore.getState().liveLikes).toBe(6);
    });

    it("should decrement likes", () => {
      useLiveStore.getState().setLiveLikes(5);
      useLiveStore.getState().decrementLiveLikes();
      expect(useLiveStore.getState().liveLikes).toBe(4);
    });

    it("should not decrement below zero", () => {
      useLiveStore.getState().setLiveLikes(0);
      useLiveStore.getState().decrementLiveLikes();
      expect(useLiveStore.getState().liveLikes).toBe(0);
    });
  });

  describe("playedTrackKeys", () => {
    it("should add track keys", () => {
      useLiveStore.getState().addPlayedTrack("artist::title");
      expect(useLiveStore.getState().playedTrackKeys.has("artist::title")).toBe(true);
    });

    it("should clear track keys", () => {
      useLiveStore.getState().addPlayedTrack("artist::title");
      useLiveStore.getState().clearPlayedTracks();
      expect(useLiveStore.getState().playedTrackKeys.size).toBe(0);
    });

    it("should handle multiple tracks", () => {
      useLiveStore.getState().addPlayedTrack("artist1::title1");
      useLiveStore.getState().addPlayedTrack("artist2::title2");
      useLiveStore.getState().addPlayedTrack("artist1::title1"); // Duplicate

      expect(useLiveStore.getState().playedTrackKeys.size).toBe(2);
    });
  });

  describe("currentStage", () => {
    it("defaults to null id/name", () => {
      const state = useLiveStore.getState();
      expect(state.currentStageId).toBeNull();
      expect(state.currentStageName).toBeNull();
    });

    it("setCurrentStage stores id + name (staged go-live)", () => {
      useLiveStore.getState().setCurrentStage("main-floor-ab12", "Main Floor");
      const state = useLiveStore.getState();
      expect(state.currentStageId).toBe("main-floor-ab12");
      expect(state.currentStageName).toBe("Main Floor");
    });

    it("setCurrentStage(null, null) clears it (standalone go-live)", () => {
      useLiveStore.getState().setCurrentStage("x", "X");
      useLiveStore.getState().setCurrentStage(null, null);
      const state = useLiveStore.getState();
      expect(state.currentStageId).toBeNull();
      expect(state.currentStageName).toBeNull();
    });
  });

  describe("reset", () => {
    it("should reset all state to defaults", () => {
      // Set some values
      useLiveStore.getState().setStatus("live");
      useLiveStore.getState().setListenerCount(100);
      useLiveStore.getState().setLiveLikes(50);
      useLiveStore.getState().addPlayedTrack("track1");
      useLiveStore.getState().setCurrentStage("main-floor", "Main Floor");

      // Reset
      useLiveStore.getState().reset();

      // Verify defaults
      const state = useLiveStore.getState();
      expect(state.status).toBe("offline");
      expect(state.listenerCount).toBe(0);
      expect(state.liveLikes).toBe(0);
      expect(state.playedTrackKeys.size).toBe(0);
      expect(state.currentStageId).toBeNull(); // cleared on session end
      expect(state.currentStageName).toBeNull();
    });
  });

  describe("polls", () => {
    it("should set active poll", () => {
      const poll = {
        id: 1,
        question: "Faster or slower?",
        options: ["Faster", "Slower", "Perfect"],
        votes: [3, 2, 5],
        totalVotes: 10,
      };

      useLiveStore.getState().setActivePoll(poll);
      expect(useLiveStore.getState().activePoll).toEqual(poll);
    });

    it("should set ended poll", () => {
      const endedPoll = {
        id: 1,
        question: "Faster or slower?",
        options: ["Faster", "Slower", "Perfect"],
        votes: [3, 2, 5],
        totalVotes: 10,
        winner: "Perfect",
        winnerPercent: 50,
      };

      useLiveStore.getState().setEndedPoll(endedPoll);
      expect(useLiveStore.getState().endedPoll).toEqual(endedPoll);
    });

    it("should clear ended poll", () => {
      useLiveStore.getState().setEndedPoll({
        id: 1,
        question: "Test",
        options: [],
        votes: [],
        totalVotes: 0,
        winner: "",
        winnerPercent: 0,
      });
      useLiveStore.getState().clearEndedPoll();
      expect(useLiveStore.getState().endedPoll).toBeNull();
    });

    it("should handle poll with endsAt timer", () => {
      const poll = {
        id: 2,
        question: "Continue set?",
        options: ["Yes", "No"],
        votes: [0, 0],
        totalVotes: 0,
        endsAt: new Date(Date.now() + 60000).toISOString(),
      };

      useLiveStore.getState().setActivePoll(poll);
      expect(useLiveStore.getState().activePoll?.endsAt).toBeDefined();
    });
  });

  describe("session management", () => {
    it("should set and get sessionId", () => {
      useLiveStore.getState().setSessionId("abc-123");
      expect(useLiveStore.getState().sessionId).toBe("abc-123");
    });

    it("should set and get dbSessionId", () => {
      useLiveStore.getState().setDbSessionId(42);
      expect(useLiveStore.getState().dbSessionId).toBe(42);
    });

    it("should set and get currentPlayId", () => {
      useLiveStore.getState().setCurrentPlayId(100);
      expect(useLiveStore.getState().currentPlayId).toBe(100);
    });

    it("should clear session IDs and pending sync on reset", () => {
      useLiveStore.getState().setSessionId("test");
      useLiveStore.getState().setDbSessionId(1);
      useLiveStore.getState().setCurrentPlayId(10);
      useLiveStore.getState().setPendingHistorySync([{ artist: "A", title: "T" }]);
      useLiveStore.getState().reset();

      expect(useLiveStore.getState().sessionId).toBeNull();
      expect(useLiveStore.getState().dbSessionId).toBeNull();
      expect(useLiveStore.getState().currentPlayId).toBeNull();
      expect(useLiveStore.getState().pendingHistorySync).toEqual([]);
    });
  });

  describe("history sync management", () => {
    it("should set and get pending history sync tracks", () => {
      const tracks = [{ artist: "Artist 1", title: "Track 1" }];
      useLiveStore.getState().setPendingHistorySync(tracks);
      expect(useLiveStore.getState().pendingHistorySync).toEqual(tracks);
    });

    it("should clear pending history sync tracks", () => {
      useLiveStore.getState().setPendingHistorySync([{ artist: "A", title: "T" }]);
      useLiveStore.getState().setPendingHistorySync([]);
      expect(useLiveStore.getState().pendingHistorySync).toEqual([]);
    });
  });

  describe("nowPlaying", () => {
    it("should set nowPlaying track", () => {
      const track = {
        artist: "Test Artist",
        title: "Test Song",
        bpm: 120,
        key: "Am",
        elapsed: 30,
        remaining: 180,
      };

      useLiveStore.getState().setNowPlaying(track as any);
      expect(useLiveStore.getState().nowPlaying?.artist).toBe("Test Artist");
    });

    it("should clear nowPlaying with null", () => {
      useLiveStore.getState().setNowPlaying({ artist: "Test", title: "Test" } as any);
      useLiveStore.getState().setNowPlaying(null);
      expect(useLiveStore.getState().nowPlaying).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error message", () => {
      useLiveStore.getState().setError("Connection failed");
      expect(useLiveStore.getState().error).toBe("Connection failed");
    });

    it("should clear error with null", () => {
      useLiveStore.getState().setError("Some error");
      useLiveStore.getState().setError(null);
      expect(useLiveStore.getState().error).toBeNull();
    });

    it("should set status to error on failure", () => {
      useLiveStore.getState().setStatus("error");
      useLiveStore.getState().setError("Network timeout");
      expect(useLiveStore.getState().status).toBe("error");
      expect(useLiveStore.getState().error).toBe("Network timeout");
    });
  });

  describe("tempoFeedback", () => {
    it("should set tempo feedback", () => {
      const feedback = { faster: 5, slower: 3, perfect: 10, total: 18 };
      useLiveStore.getState().setTempoFeedback(feedback);
      expect(useLiveStore.getState().tempoFeedback).toEqual(feedback);
    });

    it("should clear tempo feedback with null", () => {
      useLiveStore.getState().setTempoFeedback({ faster: 1, slower: 0, perfect: 0, total: 1 });
      useLiveStore.getState().setTempoFeedback(null);
      expect(useLiveStore.getState().tempoFeedback).toBeNull();
    });
  });

  describe("announcements", () => {
    it("should set active announcement", () => {
      const announcement = { message: "Break in 5 minutes!", endsAt: new Date().toISOString() };
      useLiveStore.getState().setActiveAnnouncement(announcement);
      expect(useLiveStore.getState().activeAnnouncement?.message).toBe("Break in 5 minutes!");
    });

    it("should clear announcement with null", () => {
      useLiveStore.getState().setActiveAnnouncement({ message: "Test" });
      useLiveStore.getState().setActiveAnnouncement(null);
      expect(useLiveStore.getState().activeAnnouncement).toBeNull();
    });
  });
});
