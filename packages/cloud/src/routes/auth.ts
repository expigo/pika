/**
 * Authentication Routes
 * Handles DJ registration, login, token management
 *
 * Extracted from index.ts for modularity and testability.
 */
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { slugify, LIMITS, logger } from "@pika/shared";
import { db } from "../db";
import * as schema from "../db/schema";

const auth = new Hono();

// Rate limiter for auth endpoints (5 requests per 15 minutes)
const authLimiter = rateLimiter({
  windowMs: LIMITS.AUTH_RATE_LIMIT_WINDOW,
  limit: LIMITS.AUTH_RATE_LIMIT_MAX,
  standardHeaders: "draft-6",
  keyGenerator: (c) =>
    c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
  handler: (c) => c.json({ error: "Too many requests, please try again later" }, 429),
});

// Email validation schema
const emailSchema = z.string().email();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate secure random token
 */
function generateToken(): string {
  return `pk_dj_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Hash password using Bun's built-in bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

/**
 * Hash token for storage (fast SHA-256 for API tokens)
 */
async function hashToken(token: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(token);
  return hash.digest("hex");
}

/**
 * Verify password against hash
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Validate token and return DJ user
 */
async function validateToken(
  token: string,
): Promise<{ id: number; displayName: string; email: string; slug: string } | null> {
  try {
    const tokenHash = await hashToken(token);

    const result = await db
      .select({
        id: schema.djUsers.id,
        displayName: schema.djUsers.displayName,
        email: schema.djUsers.email,
        slug: schema.djUsers.slug,
      })
      .from(schema.djTokens)
      .innerJoin(schema.djUsers, eq(schema.djTokens.djUserId, schema.djUsers.id))
      .where(eq(schema.djTokens.token, tokenHash))
      .limit(1);

    if (result.length === 0) return null;

    const user = result[0];
    if (!user) return null;

    // Update last used timestamp (fire-and-forget)
    db.update(schema.djTokens)
      .set({ lastUsed: new Date() })
      .where(eq(schema.djTokens.token, tokenHash))
      .catch(() => {});

    return user;
  } catch (e) {
    logger.error("Token validation error", e);
    return null;
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /register
 * Register a new DJ account
 */
auth.post("/register", authLimiter, async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, displayName } = body as {
      email?: string;
      password?: string;
      displayName?: string;
    };

    // Validation
    if (!email || !password || !displayName) {
      return c.json({ error: "Email, password, and display name are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    if (password.length > 128) {
      return c.json({ error: "Password must be at most 128 characters" }, 400);
    }

    // Proper email validation using Zod
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      return c.json({ error: "Invalid email format" }, 400);
    }

    const slug = slugify(displayName);
    if (slug.length < 2) {
      return c.json({ error: "Display name must be at least 2 characters" }, 400);
    }

    // Check if email already exists
    const existingEmail = await db
      .select({ id: schema.djUsers.id })
      .from(schema.djUsers)
      .where(eq(schema.djUsers.email, email.toLowerCase()))
      .limit(1);

    if (existingEmail.length > 0) {
      return c.json({ error: "Email already registered" }, 409);
    }

    // Check if slug already exists
    const existingSlug = await db
      .select({ id: schema.djUsers.id })
      .from(schema.djUsers)
      .where(eq(schema.djUsers.slug, slug))
      .limit(1);

    if (existingSlug.length > 0) {
      return c.json({ error: "Display name already taken" }, 409);
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(schema.djUsers)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        displayName,
        slug,
      })
      .returning({ id: schema.djUsers.id });

    if (!newUser) {
      return c.json({ error: "Failed to create account" }, 500);
    }

    // Generate token
    const token = generateToken();
    const tokenHash = await hashToken(token);

    await db.insert(schema.djTokens).values({
      djUserId: newUser.id,
      token: tokenHash,
      name: "Default",
    });

    logger.info("✅ DJ registered", { displayName, email });

    return c.json(
      {
        success: true,
        user: {
          id: newUser.id,
          email: email.toLowerCase(),
          displayName,
          slug,
        },
        token,
      },
      201,
    );
  } catch (e) {
    logger.error("Registration error", e);
    return c.json({ error: "Registration failed" }, 500);
  }
});

/**
 * POST /login
 * Login with email and password, returns token
 */
auth.post("/login", authLimiter, async (c) => {
  // 🔐 CSRF Protection: Require custom header
  const requestedWith = c.req.header("X-Requested-With");
  if (requestedWith !== "Pika") {
    return c.json({ error: "Invalid request" }, 403);
  }

  try {
    const body = await c.req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // Find user by email
    const users = await db
      .select({
        id: schema.djUsers.id,
        email: schema.djUsers.email,
        passwordHash: schema.djUsers.passwordHash,
        displayName: schema.djUsers.displayName,
        slug: schema.djUsers.slug,
      })
      .from(schema.djUsers)
      .where(eq(schema.djUsers.email, email.toLowerCase()))
      .limit(1);

    if (users.length === 0) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const user = users[0];
    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Generate NEW token
    const token = generateToken();
    const tokenHash = await hashToken(token);

    await db.insert(schema.djTokens).values({
      djUserId: user.id,
      token: tokenHash,
      name: "Default",
    });

    logger.info("✅ DJ logged in", { displayName: user.displayName, email: user.email });

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        slug: user.slug,
      },
      token,
    });
  } catch (e) {
    logger.error("Login error", e);
    return c.json({ error: "Login failed" }, 500);
  }
});

/**
 * GET /me
 * Validate token and return user info
 */
auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization token required" }, 401);
  }

  const token = authHeader.substring(7);
  const user = await validateToken(token);

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  return c.json({
    success: true,
    user,
  });
});

/**
 * POST /regenerate-token
 * Generate a new token (invalidates old one)
 */
auth.post("/regenerate-token", authLimiter, async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization token required" }, 401);
  }

  const oldToken = authHeader.substring(7);
  const user = await validateToken(oldToken);

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  try {
    // Delete old token
    const oldTokenHash = await hashToken(oldToken);
    await db.delete(schema.djTokens).where(eq(schema.djTokens.token, oldTokenHash));

    // Create new token
    const newToken = generateToken();
    const newTokenHash = await hashToken(newToken);

    await db.insert(schema.djTokens).values({
      djUserId: user.id,
      token: newTokenHash,
      name: "Default",
    });

    logger.info("🔄 Token regenerated", { displayName: user.displayName });

    return c.json({
      success: true,
      token: newToken,
    });
  } catch (e) {
    logger.error("Token regeneration error", e);
    return c.json({ error: "Failed to regenerate token" }, 500);
  }
});

// Export for use in main app and for testing
export { auth, validateToken, hashToken, generateToken };
