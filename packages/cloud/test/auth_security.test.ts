import { describe, expect, it, mock, spyOn } from "bun:test";
import { handleRegisterSession } from "../src/handlers/dj";
import * as authLib from "../src/lib/auth";
import { client } from "../src/routes/client";
import { sessions } from "../src/routes/sessions";

// Recursive mock for DB chaining
const _mockDbChain = () => {
  const handler = {
    get: (_target: any, prop: string) => {
      if (prop === "then") return undefined; // Promise safety
      // Return promise handling for limits (end of chain)
      if (["limit", "returning", "execute"].includes(prop)) {
        return () => Promise.resolve([]);
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

// More specific mock for DB to control return values
const mockDb = {
  select: () => mockDb,
  from: () => mockDb,
  where: () => mockDb,
  orderBy: () => mockDb,
  innerJoin: () => mockDb,
  limit: async () => [], // Default empty array
  groupBy: () => mockDb,
  insert: () => mockDb,
  values: () => mockDb,
  onConflictDoNothing: async () => ({}),
  update: () => mockDb,
  set: () => mockDb,
  // Allow awaiting the chain at any point
  // biome-ignore lint/suspicious/noThenProperty: mock thenable
  // biome-ignore lint/complexity/noBannedTypes: mock
  then: (resolve: Function) => resolve([]),
};

// Mock database
mock.module("../src/db", () => ({
  db: mockDb,
  schema: {
    sessions: { id: "id" },
    likes: { id: "id", sessionId: "sid", playedTrackId: "pid", createdAt: "date", clientId: "cid" },
    playedTracks: { id: "id", artist: "a", title: "t" },
    tempoVotes: { sessionId: "sid" },
    polls: { sessionId: "sid" },
    pollVotes: { pollId: "pid" },
  },
  // biome-ignore lint/suspicious/noExplicitAny: mock
  eq: (a: any, b: any) => ({ key: "eq", a, b }),
}));

// Mock WS Context
const mockWs = {
  send: mock(),
  publish: mock(),
  getBufferedAmount: () => 0,
  // biome-ignore lint/suspicious/noExplicitAny: mock
} as any;

describe("Security Audit Tests (Sprint 0.1)", () => {
  describe("S0.1.1: Auth Bypass Removal", () => {
    it("should reject registration without token even in test environment", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";

      const ctx = {
        message: { type: "REGISTER_SESSION", djName: "Hacker" },
        ws: mockWs,
        rawWs: mockWs,
        state: {},
        messageId: "123",
      } as any;

      // Mock validateToken
      spyOn(authLib, "validateToken").mockResolvedValue(null);

      await handleRegisterSession(ctx);

      const callArgs = mockWs.send.mock.calls[0];
      if (callArgs) {
        const response = JSON.parse(callArgs[0]);
        // EXPECT FAILURE (Authenticated=false)
        // Current code passes this as true in "test" mode
        expect(response.authenticated).toBe(false);
      }

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("S0.1.5: Client ID Validation", () => {
    it("should reject invalid client IDs", async () => {
      // This ID contains invalid character '$' (Regex allows a-z, 0-9, -, _)
      const invalidId = "client_Invalid$ID";
      const req = new Request(`http://localhost/${invalidId}/likes`);
      const res = await client.fetch(req);
      // Should return 400 Bad Request if validation is strict
      expect(res.status).toBe(400);
    });
  });

  describe("S0.1.4: Recap Conditional Auth", () => {
    it("should return public data (no polls) for unauthenticated request", async () => {
      // Force DB to return a session so we don't get 404
      const spy = spyOn(mockDb, "limit")
        .mockResolvedValueOnce([
          {
            id: "session_123",
            djName: "Test DJ",
            startedAt: new Date(),
            endedAt: null,
          },
        ])
        .mockResolvedValue([]); // For tracks

      const req = new Request("http://localhost/session_123/recap");
      const res = await sessions.fetch(req);

      expect(res.status).toBe(200);

      const data = await res.json();
      // Current behavior: Returns everything if session exists
      // Desired behavior: Returns "polls" field ONLY if authenticated
      // Since we are unauthenticated here, "polls" should be missing
      expect(data).toHaveProperty("totalLikes"); // Confirm we got data
      expect(data).not.toHaveProperty("polls"); // Confirm protection

      spy.mockRestore();
    });

    it("should return polls if authenticated as owner", async () => {
      const spy = spyOn(mockDb, "limit")
        .mockResolvedValueOnce([
          {
            id: "session_123",
            djName: "Test DJ",
            startedAt: new Date(),
            endedAt: null,
            djUserId: 100, // Owner ID
          },
        ])
        .mockResolvedValue([]); // For tracks

      const authSpy = spyOn(authLib, "validateToken").mockResolvedValue({ id: 100 } as any);

      const req = new Request("http://localhost/session_123/recap", {
        headers: { Authorization: "Bearer valid_token" },
      });
      const res = await sessions.fetch(req);
      const data = await res.json();

      expect(data).toHaveProperty("polls");

      spy.mockRestore();
      authSpy.mockRestore();
    });

    it("should NOT return polls if authenticated as WRONG user", async () => {
      const spy = spyOn(mockDb, "limit")
        .mockResolvedValueOnce([
          {
            id: "session_123",
            djName: "Test DJ",
            startedAt: new Date(),
            endedAt: null,
            djUserId: 100, // Owner ID
          },
        ])
        .mockResolvedValue([]);

      const authSpy = spyOn(authLib, "validateToken").mockResolvedValue({ id: 200 } as any); // Wrong ID

      const req = new Request("http://localhost/session_123/recap", {
        headers: { Authorization: "Bearer other_user_token" },
      });
      const res = await sessions.fetch(req);
      const data = await res.json();

      expect(data).not.toHaveProperty("polls");

      spy.mockRestore();
      authSpy.mockRestore();
    });

    it("should treat malformed auth header as unauthenticated", async () => {
      const spy = spyOn(mockDb, "limit")
        .mockResolvedValueOnce([
          {
            id: "session_123",
            djName: "Test DJ",
            startedAt: new Date(),
            endedAt: null,
            djUserId: 100,
          },
        ])
        .mockResolvedValue([]);

      const req = new Request("http://localhost/session_123/recap", {
        headers: { Authorization: "InvalidHeaderFormat" },
      });
      const res = await sessions.fetch(req);
      const data = await res.json();

      expect(data).not.toHaveProperty("polls");
      spy.mockRestore();
    });

    it("should treat empty token as unauthenticated", async () => {
      const spy = spyOn(mockDb, "limit")
        .mockResolvedValueOnce([
          {
            id: "session_123",
            djName: "Test DJ",
            startedAt: new Date(),
            endedAt: null,
            djUserId: 100,
          },
        ])
        .mockResolvedValue([]);

      const req = new Request("http://localhost/session_123/recap", {
        headers: { Authorization: "Bearer " },
      });
      const res = await sessions.fetch(req);
      const data = await res.json();

      expect(data).not.toHaveProperty("polls");
      spy.mockRestore();
    });
  });
});
