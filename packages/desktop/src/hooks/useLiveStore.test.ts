/**
 * useLiveStore Unit Tests
 *
 * Tests the Zustand store for live session state.
 */

import { describe, it, expect, beforeEach } from "vitest";
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

  describe("reset", () => {
    it("should reset all state to defaults", () => {
      // Set some values
      useLiveStore.getState().setStatus("live");
      useLiveStore.getState().setListenerCount(100);
      useLiveStore.getState().setLiveLikes(50);
      useLiveStore.getState().addPlayedTrack("track1");

      // Reset
      useLiveStore.getState().reset();

      // Verify defaults
      const state = useLiveStore.getState();
      expect(state.status).toBe("offline");
      expect(state.listenerCount).toBe(0);
      expect(state.liveLikes).toBe(0);
      expect(state.playedTrackKeys.size).toBe(0);
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
  });
});
