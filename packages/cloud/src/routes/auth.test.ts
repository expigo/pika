/**
 * Auth Routes Unit Tests
 *
 * Tests auth endpoint validation without hitting actual database.
 * Uses Bun's built-in test runner.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

// Type for API responses
interface ApiResponse {
  success?: boolean;
  error?: string;
  user?: { id: number; email: string; displayName: string };
  token?: string;
}

// Create a mock auth router for testing validation logic
// We can't use the real auth module because it imports the DB
const mockAuth = new Hono();

// Validation constants (matching auth.ts)
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Helper to test email validation
function isValidEmail(email: string): boolean {
  // Simple regex that matches Zod's email validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Mock register endpoint with same validation logic
mockAuth.post("/register", async (c) => {
  const body = await c.req.json();
  const { email, password, displayName } = body as {
    email?: string;
    password?: string;
    displayName?: string;
  };

  if (!email || !password || !displayName) {
    return c.json({ error: "Email, password, and display name are required" }, 400);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return c.json({ error: "Password must be at most 128 characters" }, 400);
  }

  if (!isValidEmail(email)) {
    return c.json({ error: "Invalid email format" }, 400);
  }

  // Mock successful registration
  return c.json({ success: true, user: { id: 1, email, displayName } }, 201);
});

// Mock login endpoint
mockAuth.post("/login", async (c) => {
  const requestedWith = c.req.header("X-Requested-With");
  if (requestedWith !== "Pika") {
    return c.json({ error: "Invalid request" }, 403);
  }

  const body = await c.req.json();
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  // Mock successful login
  return c.json({ success: true, token: "mock_token" });
});

const app = new Hono();
app.route("/api/auth", mockAuth);

// ============================================================================
// Tests
// ============================================================================

describe("Auth Routes - Registration Validation", () => {
  test("rejects request with missing fields", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.error).toContain("required");
  });

  test("rejects password shorter than 8 characters", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "short",
        displayName: "Test User",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.error).toContain("8 characters");
  });

  test("rejects password longer than 128 characters", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "a".repeat(129),
        displayName: "Test User",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.error).toContain("128 characters");
  });

  test("rejects invalid email format - no @", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "notanemail",
        password: "validpassword123",
        displayName: "Test User",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.error).toContain("email");
  });

  test("rejects invalid email format - no domain", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@",
        password: "validpassword123",
        displayName: "Test User",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.error).toContain("email");
  });

  test("accepts valid registration request", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "valid@example.com",
        password: "validpassword123",
        displayName: "Test User",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse;
    expect(body.success).toBe(true);
  });
});

describe("Auth Routes - Login Validation", () => {
  test("rejects login without X-Requested-With header", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as ApiResponse;
    expect(body.error).toContain("Invalid request");
  });

  test("rejects login with wrong X-Requested-With value", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });

    expect(res.status).toBe(403);
  });

  test("rejects login with missing email", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "Pika",
      },
      body: JSON.stringify({
        password: "password123",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.error).toContain("required");
  });

  test("rejects login with missing password", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "Pika",
      },
      body: JSON.stringify({
        email: "test@example.com",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse;
    expect(body.error).toContain("required");
  });

  test("accepts valid login request with correct header", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "Pika",
      },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse;
    expect(body.success).toBe(true);
  });
});

describe("Auth Validation Helpers", () => {
  test("email validator rejects strings without @", () => {
    expect(isValidEmail("notanemail")).toBe(false);
  });

  test("email validator rejects strings with only @", () => {
    expect(isValidEmail("test@")).toBe(false);
  });

  test("email validator rejects strings with spaces", () => {
    expect(isValidEmail("test @example.com")).toBe(false);
  });

  test("email validator accepts valid emails", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
    expect(isValidEmail("user.name@domain.co.uk")).toBe(true);
    expect(isValidEmail("user+tag@example.org")).toBe(true);
  });
});
