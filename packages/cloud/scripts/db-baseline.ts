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

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
}

const sql = postgres(DATABASE_URL);

// Migrations that correspond to schema already in production
// Add migration hashes here that should be marked as "applied"
const BASELINE_MIGRATIONS = [
    "0000_nervous_hannibal_king",  // Initial schema (sessions, tracks, likes)
];

async function baseline() {
    console.log("🔄 Baselining production database...\n");

    try {
        // Ensure the drizzle schema exists
        await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
        console.log("✓ Schema 'drizzle' exists");

        // Ensure the migrations table exists
        await sql`
            CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
                id SERIAL PRIMARY KEY,
                hash TEXT NOT NULL UNIQUE,
                created_at BIGINT NOT NULL
            )
        `;
        console.log("✓ Migrations table exists");

        // Insert baseline migrations
        for (const hash of BASELINE_MIGRATIONS) {
            const result = await sql`
                INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
                VALUES (${hash}, ${Date.now()})
                ON CONFLICT (hash) DO NOTHING
                RETURNING hash
            `;

            if (result.length > 0) {
                console.log(`✓ Marked as applied: ${hash}`);
            } else {
                console.log(`  Already marked: ${hash}`);
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
