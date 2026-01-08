-- Recovery Migration: Ensure all schema elements exist
-- This migration is idempotent and safe to run on any database state.
-- It fixes databases that were partially migrated or set up with db:push.

-- ============================================================================
-- DJ Users & Tokens (from 0001, but with IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "dj_users" (
    "id" SERIAL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dj_tokens" (
    "id" SERIAL PRIMARY KEY,
    "dj_user_id" INTEGER NOT NULL REFERENCES "dj_users"("id") ON DELETE CASCADE,
    "token" TEXT NOT NULL UNIQUE,
    "name" TEXT DEFAULT 'Default',
    "last_used" TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- Sessions: Add dj_user_id if missing
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sessions' AND column_name = 'dj_user_id'
    ) THEN
        ALTER TABLE "sessions" ADD COLUMN "dj_user_id" INTEGER REFERENCES "dj_users"("id");
    END IF;
END $$;

-- ============================================================================
-- Polls (from 0001, but with IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "polls" (
    "id" SERIAL PRIMARY KEY,
    "session_id" TEXT NOT NULL REFERENCES "sessions"("id"),
    "question" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "status" TEXT DEFAULT 'active' NOT NULL,
    "current_track_artist" TEXT,
    "current_track_title" TEXT,
    "started_at" TIMESTAMP DEFAULT NOW() NOT NULL,
    "ended_at" TIMESTAMP
);

-- ============================================================================
-- Poll Votes (from 0001, but with IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "poll_votes" (
    "id" SERIAL PRIMARY KEY,
    "poll_id" INTEGER NOT NULL REFERENCES "polls"("id"),
    "client_id" TEXT NOT NULL,
    "option_index" INTEGER NOT NULL,
    "voted_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Add unique constraint if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'poll_votes_poll_id_client_id_unique'
    ) THEN
        ALTER TABLE "poll_votes" 
        ADD CONSTRAINT "poll_votes_poll_id_client_id_unique" 
        UNIQUE ("poll_id", "client_id");
    END IF;
END $$;

-- ============================================================================
-- Tempo Votes (from 0001, but with IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "tempo_votes" (
    "id" SERIAL PRIMARY KEY,
    "session_id" TEXT NOT NULL REFERENCES "sessions"("id"),
    "track_artist" TEXT NOT NULL,
    "track_title" TEXT NOT NULL,
    "slower_count" INTEGER DEFAULT 0 NOT NULL,
    "perfect_count" INTEGER DEFAULT 0 NOT NULL,
    "faster_count" INTEGER DEFAULT 0 NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- Played Tracks: Add fingerprint columns if missing (from 0001)
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'played_tracks' AND column_name = 'bpm') THEN
        ALTER TABLE "played_tracks" ADD COLUMN "bpm" INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'played_tracks' AND column_name = 'key') THEN
        ALTER TABLE "played_tracks" ADD COLUMN "key" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'played_tracks' AND column_name = 'energy') THEN
        ALTER TABLE "played_tracks" ADD COLUMN "energy" INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'played_tracks' AND column_name = 'danceability') THEN
        ALTER TABLE "played_tracks" ADD COLUMN "danceability" INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'played_tracks' AND column_name = 'brightness') THEN
        ALTER TABLE "played_tracks" ADD COLUMN "brightness" INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'played_tracks' AND column_name = 'acousticness') THEN
        ALTER TABLE "played_tracks" ADD COLUMN "acousticness" INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'played_tracks' AND column_name = 'groove') THEN
        ALTER TABLE "played_tracks" ADD COLUMN "groove" INTEGER;
    END IF;
END $$;
