/**
 * Stage/Event route tests — REAL `stageRoutes` router (no-DB paths only).
 *
 * Exercises the branches that run BEFORE any DB call: zod body validation
 * (which runs ahead of auth) and the unauthenticated 401 path — `requireDjAuth`
 * rejects a missing/invalid session before the handler. DB-touching paths (create
 * success, conflict, public reads, FK behavior, scoped push) are covered
 * against real Postgres in ../__tests__/integration/stage-events.integration.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { stageRoutes } from "./stages";

interface ApiResponse {
  error?: string;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return stageRoutes.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("stage routes — event creation validation (real handler)", () => {
  test("rejects a missing name", async () => {
    const res = await post("/events", {});
    expect(res.status).toBe(400);
  });

  test("rejects an over-long name (>200)", async () => {
    const res = await post("/events", { name: "x".repeat(201) });
    expect(res.status).toBe(400);
  });

  test("rejects a non-URL-safe explicit id", async () => {
    const res = await post("/events", { name: "Valid", id: "bad id!" });
    expect(res.status).toBe(400);
  });

  test("rejects a valid body with no auth token (401, before any DB call)", async () => {
    const res = await post("/events", { name: "WCS Budapest 2026" });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiResponse).error).toBe("Authentication required");
  });

  test("rejects a malformed Authorization header (no Bearer) with 401", async () => {
    const res = await post("/events", { name: "Valid" }, { Authorization: "Token abc" });
    expect(res.status).toBe(401);
  });
});

describe("stage routes — stage creation validation (real handler)", () => {
  test("rejects a missing name", async () => {
    const res = await post("/stages", { eventId: "demo-event" });
    expect(res.status).toBe(400);
  });

  test("rejects a non-URL-safe eventId", async () => {
    const res = await post("/stages", { name: "Main Floor", eventId: "has spaces" });
    expect(res.status).toBe(400);
  });

  test("rejects a valid body with no auth token (401, before any DB call)", async () => {
    const res = await post("/stages", { name: "Main Floor" });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiResponse).error).toBe("Authentication required");
  });
});
