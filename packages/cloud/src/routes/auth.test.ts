/**
 * Auth route tests — REAL `auth` router (validation paths).
 *
 * Exercises the actual handlers in auth.ts for every branch that runs BEFORE any
 * DB call (field/format/CSRF validation), so this is a no-DB unit test of the
 * shipped code. Each request carries a unique X-Forwarded-For so the per-IP
 * authLimiter (keyed CF-Connecting-IP || X-Forwarded-For || "unknown") gives each
 * request its own bucket and never 429s the suite.
 *
 * DB-touching paths (register/login success, duplicate email, the unknown-email
 * timing path, and the token cap) are covered against real Postgres in
 * db.integration.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { auth } from "./auth";

interface ApiResponse {
  error?: string;
  success?: boolean;
}

let ipSeq = 0;
function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return auth.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `test-ip-${ipSeq++}`, // unique → own rate-limit bucket
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("auth route — registration validation (real handler)", () => {
  test("rejects missing fields", async () => {
    const res = await post("/register", {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiResponse).error).toContain("required");
  });

  test("rejects password shorter than 8 characters", async () => {
    const res = await post("/register", {
      email: "a@b.co",
      password: "short",
      displayName: "Tester",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiResponse).error).toContain("8 characters");
  });

  test("rejects password longer than 128 characters", async () => {
    const res = await post("/register", {
      email: "a@b.co",
      password: "a".repeat(129),
      displayName: "Tester",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiResponse).error).toContain("128 characters");
  });

  test("rejects an invalid email format", async () => {
    const res = await post("/register", {
      email: "notanemail",
      password: "validpassword123",
      displayName: "Tester",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiResponse).error).toContain("email");
  });

  test("rejects a display name whose slug is too short", async () => {
    const res = await post("/register", {
      email: "valid@example.com",
      password: "validpassword123",
      displayName: "x",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiResponse).error).toContain("Display name");
  });
});

describe("auth route — login validation (real handler)", () => {
  test("rejects login without the X-Requested-With header (CSRF)", async () => {
    const res = await post("/login", { email: "a@b.co", password: "password123" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiResponse).error).toContain("Invalid request");
  });

  test("rejects login with a wrong X-Requested-With value", async () => {
    const res = await post(
      "/login",
      { email: "a@b.co", password: "password123" },
      { "X-Requested-With": "XMLHttpRequest" },
    );
    expect(res.status).toBe(403);
  });

  test("rejects login with a missing email", async () => {
    const res = await post("/login", { password: "password123" }, { "X-Requested-With": "Pika" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiResponse).error).toContain("required");
  });

  test("rejects login with a missing password", async () => {
    const res = await post("/login", { email: "a@b.co" }, { "X-Requested-With": "Pika" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiResponse).error).toContain("required");
  });
});
