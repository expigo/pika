import { describe, expect, test } from "bun:test";
import type { NowPlaying } from "./spotify";
import { evaluateTick, type PollerConfig, type TickResult } from "./spotifyPoller";

const CONFIG: PollerConfig = { pollMs: 4000, idleEndMs: 1000 };

type RtState = {
  lastTrackId: string | null;
  paused: boolean;
  manualPaused: boolean;
  notPlayingSince: number | null;
};
const fresh = (over: Partial<RtState> = {}): RtState => ({
  lastTrackId: null,
  paused: false,
  manualPaused: false,
  notPlayingSince: null,
  ...over,
});

const playing = (trackId: string, isPlaying = true): TickResult => ({
  kind: "now_playing",
  np: {
    isPlaying,
    trackId,
    // Album art + Spotify link ride on the track and must survive into emitTrack.
    track: {
      title: `T-${trackId}`,
      artist: "A",
      albumArtUrl: `https://i.scdn.co/${trackId}.jpg`,
      spotifyUrl: `https://open.spotify.com/track/${trackId}`,
    },
    progressMs: 0,
    durationMs: 1000,
  } satisfies NowPlaying,
});

describe("evaluateTick", () => {
  test("auth_error → stopReauth", () => {
    const { actions } = evaluateTick(fresh(), { kind: "auth_error" }, 0, CONFIG);
    expect(actions.stopReauth).toBe(true);
  });

  test("rate_limit → next delay honours Retry-After", () => {
    const { actions } = evaluateTick(
      fresh(),
      { kind: "rate_limit", retryAfterMs: 9000 },
      0,
      CONFIG,
    );
    expect(actions.nextDelayMs).toBe(9000);
    expect(actions.emitTrack).toBeUndefined();
  });

  test("transient error → no actions, default delay", () => {
    const { actions } = evaluateTick(fresh(), { kind: "error" }, 0, CONFIG);
    expect(actions.emitTrack).toBeUndefined();
    expect(actions.emitPaused).toBeUndefined();
    expect(actions.nextDelayMs).toBe(4000);
  });

  test("playing a new track → emit + record id", () => {
    const { actions, patch } = evaluateTick(fresh(), playing("t1"), 0, CONFIG);
    expect(actions.emitTrack).toEqual({
      title: "T-t1",
      artist: "A",
      albumArtUrl: "https://i.scdn.co/t1.jpg",
      spotifyUrl: "https://open.spotify.com/track/t1",
    });
    expect(patch.lastTrackId).toBe("t1");
  });

  test("same track again → no emit", () => {
    const { actions } = evaluateTick(fresh({ lastTrackId: "t1" }), playing("t1"), 0, CONFIG);
    expect(actions.emitTrack).toBeUndefined();
  });

  test("Spotify paused → emit paused + start idle clock", () => {
    const { actions, patch } = evaluateTick(fresh(), playing("t1", false), 5000, CONFIG);
    expect(actions.emitPaused).toBe(true);
    expect(patch.paused).toBe(true);
    expect(patch.notPlayingSince).toBe(5000);
  });

  test("idle (nothing playing) while already paused → no duplicate paused emit", () => {
    const { actions } = evaluateTick(
      fresh({ paused: true, notPlayingSince: 1000 }),
      { kind: "idle" },
      1500,
      CONFIG,
    );
    expect(actions.emitPaused).toBeUndefined();
  });

  test("idle past the idle window → auto-end", () => {
    const { actions } = evaluateTick(
      fresh({ paused: true, notPlayingSince: 1000 }),
      { kind: "idle" },
      1000 + CONFIG.idleEndMs,
      CONFIG,
    );
    expect(actions.endIdle).toBe(true);
  });

  test("manual pause while playing → paused, never auto-ends", () => {
    const { actions, patch } = evaluateTick(
      fresh({ manualPaused: true }),
      playing("t1"),
      9_999_999,
      CONFIG,
    );
    expect(actions.emitTrack).toBeUndefined();
    expect(actions.emitPaused).toBe(true);
    expect(actions.endIdle).toBeUndefined();
    expect(patch.notPlayingSince).toBeNull();
  });

  test("resuming from paused → emit resumed + the current track", () => {
    const { actions, patch } = evaluateTick(fresh({ paused: true }), playing("t2"), 0, CONFIG);
    expect(actions.emitResumed).toBe(true);
    expect(patch.paused).toBe(false);
    expect(actions.emitTrack?.title).toBe("T-t2"); // URL passthrough covered above
    expect(actions.emitTrack?.artist).toBe("A");
  });
});
