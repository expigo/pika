#!/usr/bin/env bun
/**
 * Database Baseline Script
 *
 * Run this ONCE on a production database that was set up with db:push
 * to mark existing migrations as "already applied".
 *
 * Usage: bun run scripts/db-baseline.ts
 */

import postgres from "postgres";

// biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

// Migrations that correspond to schema already in production
// Add migration hashes here that should be marked as "applied"
const BASELINE_MIGRATIONS = [
  "0000_nervous_hannibal_king", // Initial schema (sessions, tracks, likes)
  "0001_brief_inhumans", // DJ auth (dj_users, dj_tokens, polls, tempo_votes)
  "0002_schema_recovery", // Recover schema drift
];

async function baseline() {
  console.log("🔄 Baselining production database...\n");

  try {
    // Ensure the drizzle schema exists
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    console.log("✓ Schema 'drizzle' exists");

    // Check if migrations table exists and what columns it has
    const tableCheck = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'drizzle' 
            AND table_name = '__drizzle_migrations'
        `;

    if (tableCheck.length === 0) {
      // Create with proper schema
      await sql`
                CREATE TABLE drizzle.__drizzle_migrations (
                    id SERIAL PRIMARY KEY,
                    hash TEXT NOT NULL UNIQUE,
                    created_at BIGINT NOT NULL
                )
            `;
      console.log("✓ Created migrations table");
    } else {
      console.log("✓ Migrations table exists");

      // Try to add unique constraint if missing
      try {
        await sql`
                    ALTER TABLE drizzle.__drizzle_migrations 
                    ADD CONSTRAINT __drizzle_migrations_hash_unique UNIQUE (hash)
                `;
        console.log("✓ Added unique constraint on hash");
      } catch {
        // Constraint might already exist or there are duplicates
        console.log("  (unique constraint already exists or skipped)");
      }
    }

    // Insert baseline migrations (check first, then insert)
    for (const hash of BASELINE_MIGRATIONS) {
      // Check if already exists
      const existing = await sql`
                SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
            `;

      if (existing.length > 0) {
        console.log(`  Already marked: ${hash}`);
      } else {
        await sql`
                    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
                    VALUES (${hash}, ${Date.now()})
                `;
        console.log(`✓ Marked as applied: ${hash}`);
      }
    }

    console.log("\n✅ Baseline complete!");
    console.log("\nYou can now run: bun run db:migrate");
    console.log("Only new migrations will be applied.");
  } catch (error) {
    console.error("❌ Baseline failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

baseline();
