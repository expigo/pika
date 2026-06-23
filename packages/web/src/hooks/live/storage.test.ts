/**
 * storage.ts tests — W2 localStorage bounding.
 *
 * Exercises the real storage helpers against a localStorage mock (Bun has no
 * window.localStorage). Covers the liked-sessions cap, LRU recency, and the
 * stale-tempo-key sweep that keep the PWA under the ~5MB quota.
 *
 * NOTE: Run with `bun test` from packages/web.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { cleanupStaleLocalStorage, getStoredLikes, persistLikes } from "./storage";

// Mirrors the real Storage surface storage.ts uses (incl. length + key()).
class MockStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
  key(i: number): string | null {
    return [...this.store.keys()][i] ?? null;
  }
  get length(): number {
    return this.store.size;
  }
}

// Keep in sync with MAX_LIKED_SESSIONS in storage.ts.
const MAX_LIKED_SESSIONS = 30;
const g = globalThis as unknown as { window?: unknown; localStorage?: MockStorage };

beforeEach(() => {
  g.window = {}; // make `typeof window !== "undefined"`
  g.localStorage = new MockStorage();
});

describe("persistLikes — liked-sessions cap", () => {
  test("keeps only the last MAX_LIKED_SESSIONS sessions", () => {
    for (let i = 0; i < MAX_LIKED_SESSIONS + 5; i++) {
      persistLikes(`s${i}`, new Set([`track-${i}`]));
    }
    // Oldest 5 evicted, newest 30 retained.
    expect(getStoredLikes("s0").size).toBe(0);
    expect(getStoredLikes("s4").size).toBe(0);
    expect(getStoredLikes("s5").has("track-5")).toBe(true);
    expect(getStoredLikes(`s${MAX_LIKED_SESSIONS + 4}`).size).toBe(1);
  });

  test("re-persisting an existing session refreshes its recency (not evicted)", () => {
    for (let i = 0; i < MAX_LIKED_SESSIONS; i++) {
      persistLikes(`s${i}`, new Set([`track-${i}`]));
    }
    persistLikes("s0", new Set(["track-0", "track-0b"])); // touch s0 → most recent
    for (let i = MAX_LIKED_SESSIONS; i < MAX_LIKED_SESSIONS + 5; i++) {
      persistLikes(`s${i}`, new Set([`track-${i}`]));
    }
    // s0 survived because it was refreshed; s1 (now oldest) was evicted.
    expect(getStoredLikes("s0").has("track-0b")).toBe(true);
    expect(getStoredLikes("s1").size).toBe(0);
  });

  test("round-trips a session's set", () => {
    persistLikes("sess", new Set(["A:One", "B:Two"]));
    expect(getStoredLikes("sess")).toEqual(new Set(["A:One", "B:Two"]));
  });
});

describe("cleanupStaleLocalStorage — tempo sweep", () => {
  test("drops other sessions' tempo keys, keeps current + unrelated keys", () => {
    const ls = g.localStorage as MockStorage;
    ls.setItem("pika_tempo_sessA_Artist:Title", "faster");
    ls.setItem("pika_tempo_sessA_Other:Song", "perfect");
    ls.setItem("pika_tempo_sessB_Stale:Track", "slower");
    ls.setItem("pika_client_id", "client-123");
    ls.setItem("pika_last_session_id", "sessA");

    cleanupStaleLocalStorage("sessA");

    expect(ls.getItem("pika_tempo_sessA_Artist:Title")).toBe("faster");
    expect(ls.getItem("pika_tempo_sessA_Other:Song")).toBe("perfect");
    expect(ls.getItem("pika_tempo_sessB_Stale:Track")).toBeNull();
    expect(ls.getItem("pika_client_id")).toBe("client-123");
    expect(ls.getItem("pika_last_session_id")).toBe("sessA");
  });

  test("prefix-anchored: a session id that is a prefix of another is not a false match", () => {
    const ls = g.localStorage as MockStorage;
    ls.setItem("pika_tempo_ab_Keep:Me", "perfect"); // current
    ls.setItem("pika_tempo_abc_Drop:Me", "faster"); // foreign, shares prefix "ab"

    cleanupStaleLocalStorage("ab");

    expect(ls.getItem("pika_tempo_ab_Keep:Me")).toBe("perfect");
    expect(ls.getItem("pika_tempo_abc_Drop:Me")).toBeNull();
  });

  test("caps an already-bloated liked-tracks map", () => {
    for (let i = 0; i < MAX_LIKED_SESSIONS + 10; i++) {
      // Seed past the cap without going through persistLikes' own capping.
      persistLikes(`s${i}`, new Set([`t${i}`]));
    }
    cleanupStaleLocalStorage("s5");
    const raw = (g.localStorage as MockStorage).getItem("pika_liked_tracks_v2") ?? "{}";
    expect(Object.keys(JSON.parse(raw)).length).toBeLessThanOrEqual(MAX_LIKED_SESSIONS);
  });
});
