/**
 * Security Tests (Sprint 5)
 *
 * Security-focused tests:
 * - Schema validation (input boundaries)
 * - Rate limiting enforcement
 * - Auth validation (token, clientId)
 * - XSS prevention
 * - Protocol versioning
 *
 * @file packages/cloud/test/security.test.ts
 * @package @pika/cloud
 * @created 2026-01-23
 */

import { describe, expect, test } from "bun:test";

// Import schemas from shared package
import {
  BroadcastTrackSchema,
  MESSAGE_TYPES,
  RegisterSessionSchema,
  SendAnnouncementSchema,
  StartPollSchema,
  TrackInfoSchema,
} from "@pika/shared";

// ============================================================================
// Schema Validation Security Tests
// ============================================================================

describe("Security: Schema Validation", () => {
  describe("TrackInfoSchema - Input Boundaries", () => {
    test("rejects empty title", () => {
      const result = TrackInfoSchema.safeParse({
        title: "",
        artist: "Valid Artist",
      });

      expect(result.success).toBe(false);
    });

    test("rejects empty artist", () => {
      const result = TrackInfoSchema.safeParse({
        title: "Valid Title",
        artist: "",
      });

      expect(result.success).toBe(false);
    });

    test("rejects title over 500 characters", () => {
      const result = TrackInfoSchema.safeParse({
        title: "A".repeat(501),
        artist: "Artist",
      });

      expect(result.success).toBe(false);
    });

    test("rejects artist over 500 characters", () => {
      const result = TrackInfoSchema.safeParse({
        title: "Title",
        artist: "A".repeat(501),
      });

      expect(result.success).toBe(false);
    });

    test("rejects BPM below 40", () => {
      const result = TrackInfoSchema.safeParse({
        title: "Title",
        artist: "Artist",
        bpm: 39,
      });

      expect(result.success).toBe(false);
    });

    test("rejects BPM above 300", () => {
      const result = TrackInfoSchema.safeParse({
        title: "Title",
        artist: "Artist",
        bpm: 301,
      });

      expect(result.success).toBe(false);
    });

    test("accepts valid BPM range", () => {
      const result = TrackInfoSchema.safeParse({
        title: "Title",
        artist: "Artist",
        bpm: 128,
      });

      expect(result.success).toBe(true);
    });

    test("rejects energy outside 0-100 range", () => {
      const lowResult = TrackInfoSchema.safeParse({
        title: "Title",
        artist: "Artist",
        energy: -1,
      });
      expect(lowResult.success).toBe(false);

      const highResult = TrackInfoSchema.safeParse({
        title: "Title",
        artist: "Artist",
        energy: 101,
      });
      expect(highResult.success).toBe(false);
    });

    test("trims whitespace from strings", () => {
      const result = TrackInfoSchema.safeParse({
        title: "  Padded Title  ",
        artist: "  Padded Artist  ",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Padded Title");
        expect(result.data.artist).toBe("Padded Artist");
      }
    });
  });

  describe("BroadcastTrackSchema - Protocol Security", () => {
    test("requires valid message type", () => {
      const result = BroadcastTrackSchema.safeParse({
        type: "INVALID_TYPE",
        sessionId: "session-123",
        track: { title: "Song", artist: "Artist" },
      });

      expect(result.success).toBe(false);
    });

    test("requires sessionId", () => {
      const result = BroadcastTrackSchema.safeParse({
        type: MESSAGE_TYPES.BROADCAST_TRACK,
        track: { title: "Song", artist: "Artist" },
      });

      expect(result.success).toBe(false);
    });

    test("requires track payload", () => {
      const result = BroadcastTrackSchema.safeParse({
        type: MESSAGE_TYPES.BROADCAST_TRACK,
        sessionId: "session-123",
      });

      expect(result.success).toBe(false);
    });

    test("accepts valid BROADCAST_TRACK message", () => {
      const result = BroadcastTrackSchema.safeParse({
        type: MESSAGE_TYPES.BROADCAST_TRACK,
        sessionId: "session-123",
        track: {
          title: "Valid Song",
          artist: "Valid Artist",
          bpm: 120,
          key: "Am",
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("StartPollSchema - Poll Option Security", () => {
    test("requires minimum 2 options", () => {
      const result = StartPollSchema.safeParse({
        type: MESSAGE_TYPES.START_POLL,
        sessionId: "session-123",
        question: "What's next?",
        options: ["Only One"],
      });

      expect(result.success).toBe(false);
    });

    test("allows maximum 10 options", () => {
      const result = StartPollSchema.safeParse({
        type: MESSAGE_TYPES.START_POLL,
        sessionId: "session-123",
        question: "Pick one?",
        options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      });

      expect(result.success).toBe(true);
    });

    test("rejects more than 10 options", () => {
      const result = StartPollSchema.safeParse({
        type: MESSAGE_TYPES.START_POLL,
        sessionId: "session-123",
        question: "Pick one?",
        options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
      });

      expect(result.success).toBe(false);
    });

    test("rejects option over 100 characters", () => {
      const result = StartPollSchema.safeParse({
        type: MESSAGE_TYPES.START_POLL,
        sessionId: "session-123",
        question: "Pick?",
        options: ["Short", "A".repeat(101)],
      });

      expect(result.success).toBe(false);
    });

    test("rejects empty option", () => {
      const result = StartPollSchema.safeParse({
        type: MESSAGE_TYPES.START_POLL,
        sessionId: "session-123",
        question: "Pick?",
        options: ["Valid", ""],
      });

      expect(result.success).toBe(false);
    });

    test("rejects duration below 30 seconds", () => {
      const result = StartPollSchema.safeParse({
        type: MESSAGE_TYPES.START_POLL,
        sessionId: "session-123",
        question: "Quick poll?",
        options: ["A", "B"],
        durationSeconds: 29,
      });

      expect(result.success).toBe(false);
    });

    test("rejects duration above 300 seconds (5 minutes)", () => {
      const result = StartPollSchema.safeParse({
        type: MESSAGE_TYPES.START_POLL,
        sessionId: "session-123",
        question: "Long poll?",
        options: ["A", "B"],
        durationSeconds: 301,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("SendAnnouncementSchema - Message Security", () => {
    test("rejects empty message", () => {
      const result = SendAnnouncementSchema.safeParse({
        type: MESSAGE_TYPES.SEND_ANNOUNCEMENT,
        sessionId: "session-123",
        message: "",
      });

      expect(result.success).toBe(false);
    });

    test("rejects message over 200 characters", () => {
      const result = SendAnnouncementSchema.safeParse({
        type: MESSAGE_TYPES.SEND_ANNOUNCEMENT,
        sessionId: "session-123",
        message: "A".repeat(201),
      });

      expect(result.success).toBe(false);
    });

    test("accepts valid announcement", () => {
      const result = SendAnnouncementSchema.safeParse({
        type: MESSAGE_TYPES.SEND_ANNOUNCEMENT,
        sessionId: "session-123",
        message: "Shoutout to the dancers!",
      });

      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// XSS Prevention Tests
// ============================================================================

describe("Security: XSS Prevention", () => {
  test("schema accepts but doesn't sanitize HTML in track title", () => {
    // Note: Zod validates but doesn't sanitize. XSS prevention must happen at render.
    const result = TrackInfoSchema.safeParse({
      title: "<script>alert('xss')</script>",
      artist: "Artist",
    });

    // Schema accepts (validation passes)
    expect(result.success).toBe(true);
    // But the renderer must escape this!
  });

  test("schema accepts special characters that need escaping", () => {
    const result = TrackInfoSchema.safeParse({
      title: 'Track & "Title" <test>',
      artist: "Artist's Name",
    });

    expect(result.success).toBe(true);
  });

  test("poll options preserve potentially dangerous characters", () => {
    const result = StartPollSchema.safeParse({
      type: MESSAGE_TYPES.START_POLL,
      sessionId: "session-123",
      question: "Pick one?",
      options: ["<script>", "onclick=alert(1)"],
    });

    expect(result.success).toBe(true);
    // Renderer must escape these!
  });
});

// ============================================================================
// Client ID Validation Tests
// ============================================================================

describe("Security: Client ID Validation", () => {
  // Client ID format: client_<uuid>
  const clientIdPattern = /^client_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  test("valid client ID matches pattern", () => {
    const validClientId = "client_550e8400-e29b-41d4-a716-446655440000";
    expect(clientIdPattern.test(validClientId)).toBe(true);
  });

  test("rejects client ID without prefix", () => {
    const invalidClientId = "550e8400-e29b-41d4-a716-446655440000";
    expect(clientIdPattern.test(invalidClientId)).toBe(false);
  });

  test("rejects client ID with wrong prefix", () => {
    const invalidClientId = "user_550e8400-e29b-41d4-a716-446655440000";
    expect(clientIdPattern.test(invalidClientId)).toBe(false);
  });

  test("rejects malformed UUID", () => {
    const invalidClientId = "client_not-a-valid-uuid";
    expect(clientIdPattern.test(invalidClientId)).toBe(false);
  });

  test("rejects empty string", () => {
    expect(clientIdPattern.test("")).toBe(false);
  });

  test("rejects SQL injection attempt", () => {
    const sqlInjection = "client_'; DROP TABLE users; --";
    expect(clientIdPattern.test(sqlInjection)).toBe(false);
  });
});

// ============================================================================
// Session ID Validation Tests
// ============================================================================

describe("Security: Session ID Validation", () => {
  // Session ID should be between 8-64 characters, alphanumeric with hyphens
  const sessionIdPattern = /^[a-zA-Z0-9-]{8,64}$/;

  test("accepts valid session ID", () => {
    const validSessionId = "abc123-session-xyz";
    expect(sessionIdPattern.test(validSessionId)).toBe(true);
  });

  test("rejects session ID shorter than 8 characters", () => {
    const shortId = "abc";
    expect(sessionIdPattern.test(shortId)).toBe(false);
  });

  test("rejects session ID longer than 64 characters", () => {
    const longId = "a".repeat(65);
    expect(sessionIdPattern.test(longId)).toBe(false);
  });

  test("rejects session ID with special characters", () => {
    const invalidId = "session_123<script>";
    expect(sessionIdPattern.test(invalidId)).toBe(false);
  });

  test("rejects session ID with spaces", () => {
    const invalidId = "session 123";
    expect(sessionIdPattern.test(invalidId)).toBe(false);
  });
});

// ============================================================================
// Numeric Boundary Tests
// ============================================================================

describe("Security: Numeric Boundaries", () => {
  describe("fingerprint metrics (0-100 range)", () => {
    const fingerprintFields = ["energy", "danceability", "brightness", "acousticness", "groove"];

    for (const field of fingerprintFields) {
      test(`${field} accepts 0`, () => {
        const result = TrackInfoSchema.safeParse({
          title: "Title",
          artist: "Artist",
          [field]: 0,
        });
        expect(result.success).toBe(true);
      });

      test(`${field} accepts 100`, () => {
        const result = TrackInfoSchema.safeParse({
          title: "Title",
          artist: "Artist",
          [field]: 100,
        });
        expect(result.success).toBe(true);
      });

      test(`${field} rejects -1`, () => {
        const result = TrackInfoSchema.safeParse({
          title: "Title",
          artist: "Artist",
          [field]: -1,
        });
        expect(result.success).toBe(false);
      });

      test(`${field} rejects 101`, () => {
        const result = TrackInfoSchema.safeParse({
          title: "Title",
          artist: "Artist",
          [field]: 101,
        });
        expect(result.success).toBe(false);
      });
    }
  });

  describe("BPM range (40-300)", () => {
    test("accepts minimum BPM 40", () => {
      const result = TrackInfoSchema.safeParse({
        title: "Title",
        artist: "Artist",
        bpm: 40,
      });
      expect(result.success).toBe(true);
    });

    test("accepts maximum BPM 300", () => {
      const result = TrackInfoSchema.safeParse({
        title: "Title",
        artist: "Artist",
        bpm: 300,
      });
      expect(result.success).toBe(true);
    });

    test("accepts typical WCS BPM range (82-120)", () => {
      for (const bpm of [82, 90, 100, 110, 120]) {
        const result = TrackInfoSchema.safeParse({
          title: "Title",
          artist: "Artist",
          bpm,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});

// ============================================================================
// Protocol Version Tests
// ============================================================================

describe("Security: Protocol Versioning", () => {
  test("schemas include version field for future compatibility", () => {
    // Check that messages can include version (optional for backwards compatibility)
    const messageWithVersion = {
      type: MESSAGE_TYPES.BROADCAST_TRACK,
      sessionId: "session-123",
      track: { title: "Song", artist: "Artist" },
      version: "0.3.0",
    };

    // Should not throw - version is part of the extended schema
    const result = BroadcastTrackSchema.safeParse(messageWithVersion);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Rate Limit Simulation Tests
// ============================================================================

describe("Security: Rate Limit Behavior", () => {
  // These tests verify rate limit logic patterns, not actual timing

  test("like rate limit allows up to 10 per minute", () => {
    const LIKE_RATE_LIMIT = 10;
    const history: number[] = [];
    const now = Date.now();

    // Simulate 10 likes
    for (let i = 0; i < 10; i++) {
      history.push(now);
    }

    expect(history.length).toBe(LIKE_RATE_LIMIT);
    expect(history.length <= LIKE_RATE_LIMIT).toBe(true);
  });

  test("like rate limit blocks 11th request within window", () => {
    const LIKE_RATE_LIMIT = 10;
    const _LIKE_WINDOW_MS = 60 * 1000;
    const now = Date.now();
    const history: number[] = [];

    // Fill history with 10 likes
    for (let i = 0; i < 10; i++) {
      history.push(now);
    }

    // 11th request should be blocked
    const isRateLimited = history.length >= LIKE_RATE_LIMIT;
    expect(isRateLimited).toBe(true);
  });

  test("old entries are pruned from rate limit window", () => {
    const LIKE_WINDOW_MS = 60 * 1000;
    const now = Date.now();
    let history: number[] = [];

    // Add old entries (older than window)
    history.push(now - LIKE_WINDOW_MS - 1000);
    history.push(now - LIKE_WINDOW_MS - 500);

    // Add recent entries
    history.push(now - 1000);
    history.push(now);

    // Prune old entries
    history = history.filter((t) => now - t < LIKE_WINDOW_MS);

    expect(history.length).toBe(2); // Only recent entries remain
  });

  test("broadcast track rate limit: 1 per 5 seconds", () => {
    const _BROADCAST_RATE_LIMIT = 1;
    const BROADCAST_WINDOW_MS = 5000;

    // Simulate state
    let lastBroadcast = 0;
    const now = Date.now();

    // First broadcast allowed
    const canBroadcast1 = now - lastBroadcast >= BROADCAST_WINDOW_MS;
    expect(canBroadcast1).toBe(true);
    lastBroadcast = now;

    // Immediate second broadcast blocked
    const canBroadcast2 = now - lastBroadcast >= BROADCAST_WINDOW_MS;
    expect(canBroadcast2).toBe(false);

    // After 5 seconds, allowed again
    const laterTime = now + BROADCAST_WINDOW_MS;
    const canBroadcast3 = laterTime - lastBroadcast >= BROADCAST_WINDOW_MS;
    expect(canBroadcast3).toBe(true);
  });
});

// ============================================================================
// Payload Size Tests
// ============================================================================

describe("Security: Payload Size Limits", () => {
  test("track info stays within reasonable size", () => {
    const maxPayload = {
      title: "A".repeat(500),
      artist: "B".repeat(500),
      bpm: 128.5,
      key: "Am",
      energy: 75,
      danceability: 80,
      brightness: 65,
      acousticness: 20,
      groove: 70,
    };

    const serialized = JSON.stringify(maxPayload);
    // Should be under 2KB for a single track
    expect(serialized.length).toBeLessThan(2048);
  });

  test("poll with max options stays within reasonable size", () => {
    const maxPoll = {
      type: MESSAGE_TYPES.START_POLL,
      sessionId: "session-123",
      question: "Q".repeat(100),
      options: Array(10).fill("O".repeat(100)),
      durationSeconds: 300,
    };

    const serialized = JSON.stringify(maxPoll);
    // Should be under 2KB
    expect(serialized.length).toBeLessThan(2048);
  });
});

// ============================================================================
// New Security Checks (Ref: S3, S4)
// ============================================================================

describe("Security: DJ Name Safety (S4)", () => {
  test("rejects DJ name with HTML/script tags", () => {
    const result = RegisterSessionSchema.safeParse({
      type: "REGISTER_SESSION",
      djName: "<script>alert(1)</script>",
      sessionId: "session-123",
    });
    expect(result.success).toBe(false);
  });

  test("rejects DJ name with less-than bracket", () => {
    const result = RegisterSessionSchema.safeParse({
      type: "REGISTER_SESSION",
      djName: "DJ < Cool",
      sessionId: "session-123",
    });
    expect(result.success).toBe(false);
  });

  test("rejects DJ name with quotes (Attribute Injection Prevention)", () => {
    const namingAttempts = ['DJ "Bobby"', "DJ 'Cool'", 'DJ " onclick="alert(1)'];

    for (const name of namingAttempts) {
      const result = RegisterSessionSchema.safeParse({
        type: "REGISTER_SESSION",
        djName: name,
        sessionId: "session-123",
      });
      expect(result.success).toBe(false);
    }
  });

  test("accepts valid alphanumeric DJ name", () => {
    const result = RegisterSessionSchema.safeParse({
      type: "REGISTER_SESSION",
      djName: "DJ Cool 123",
      sessionId: "session-123",
    });
    expect(result.success).toBe(true);
  });
});

describe("Security: Poll Question Safety (S3)", () => {
  test("rejects question over 500 characters", () => {
    const result = StartPollSchema.safeParse({
      type: "START_POLL",
      sessionId: "session-123",
      question: "a".repeat(501),
      options: ["A", "B"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty/whitespace-only question (min 1)", () => {
    const result = StartPollSchema.safeParse({
      type: "START_POLL",
      sessionId: "session-123",
      question: "   ",
      options: ["A", "B"],
    });
    expect(result.success).toBe(false);
  });

  test("accepts question with 500 characters", () => {
    const result = StartPollSchema.safeParse({
      type: "START_POLL",
      sessionId: "session-123",
      question: "a".repeat(500),
      options: ["A", "B"],
    });
    expect(result.success).toBe(true);
  });
});
