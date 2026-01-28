-- Schema Optimizations
-- Migration: 0009_schema_optimizations

-- ============================================================================
-- LIKES TABLE - Add NOT NULL and CASCADE
-- ============================================================================

-- Make session_id NOT NULL (likes should always belong to a session)
-- First, delete any orphan likes that have NULL session_id
DELETE FROM likes WHERE session_id IS NULL;

-- Add NOT NULL constraint
ALTER TABLE likes ALTER COLUMN session_id SET NOT NULL;

-- Add ON DELETE CASCADE for session_id (clean up likes when session deleted)
-- Drop existing FK and recreate with CASCADE
ALTER TABLE likes DROP CONSTRAINT IF EXISTS likes_session_id_sessions_id_fk;
ALTER TABLE likes ADD CONSTRAINT likes_session_id_sessions_id_fk 
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- ============================================================================
-- PLAYED_TRACKS TABLE - Ensure proper cascades
-- ============================================================================

-- Already has session_id NOT NULL and FK, but ensure CASCADE
ALTER TABLE played_tracks DROP CONSTRAINT IF EXISTS played_tracks_session_id_sessions_id_fk;
ALTER TABLE played_tracks ADD CONSTRAINT played_tracks_session_id_sessions_id_fk 
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- ============================================================================
-- TEMPO_VOTES TABLE - Add CASCADE
-- ============================================================================

ALTER TABLE tempo_votes DROP CONSTRAINT IF EXISTS tempo_votes_session_id_sessions_id_fk;
ALTER TABLE tempo_votes ADD CONSTRAINT tempo_votes_session_id_sessions_id_fk 
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- ============================================================================
-- POLLS TABLE - Add CASCADE
-- ============================================================================

ALTER TABLE polls DROP CONSTRAINT IF EXISTS polls_session_id_sessions_id_fk;
ALTER TABLE polls ADD CONSTRAINT polls_session_id_sessions_id_fk 
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- ============================================================================
-- POLL_VOTES TABLE - Already has CASCADE on poll_id, verify it exists
-- ============================================================================

-- poll_votes already has CASCADE on poll_id (good!)

-- ============================================================================
-- SESSION_EVENTS TABLE - Add CASCADE
-- ============================================================================

ALTER TABLE session_events DROP CONSTRAINT IF EXISTS session_events_session_id_sessions_id_fk;
ALTER TABLE session_events ADD CONSTRAINT session_events_session_id_sessions_id_fk 
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- ============================================================================
-- ANALYTICS: Add check constraints for valid ranges
-- ============================================================================

-- Energy, danceability, brightness, acousticness, groove should be 0-100
ALTER TABLE played_tracks ADD CONSTRAINT chk_energy_range 
  CHECK (energy IS NULL OR (energy >= 0 AND energy <= 100));
  
ALTER TABLE played_tracks ADD CONSTRAINT chk_danceability_range 
  CHECK (danceability IS NULL OR (danceability >= 0 AND danceability <= 100));
  
ALTER TABLE played_tracks ADD CONSTRAINT chk_brightness_range 
  CHECK (brightness IS NULL OR (brightness >= 0 AND brightness <= 100));
  
ALTER TABLE played_tracks ADD CONSTRAINT chk_acousticness_range 
  CHECK (acousticness IS NULL OR (acousticness >= 0 AND acousticness <= 100));
  
ALTER TABLE played_tracks ADD CONSTRAINT chk_groove_range 
  CHECK (groove IS NULL OR (groove >= 0 AND groove <= 100));

-- BPM should be reasonable (20-300)
ALTER TABLE played_tracks ADD CONSTRAINT chk_bpm_range 
  CHECK (bpm IS NULL OR (bpm >= 20 AND bpm <= 300));

-- ============================================================================
-- TEMPO_VOTES: Ensure counts are non-negative
-- ============================================================================

ALTER TABLE tempo_votes ADD CONSTRAINT chk_slower_count_positive 
  CHECK (slower_count >= 0);
  
ALTER TABLE tempo_votes ADD CONSTRAINT chk_perfect_count_positive 
  CHECK (perfect_count >= 0);
  
ALTER TABLE tempo_votes ADD CONSTRAINT chk_faster_count_positive 
  CHECK (faster_count >= 0);

-- ============================================================================
-- POLL_VOTES: Ensure option_index is non-negative
-- ============================================================================

ALTER TABLE poll_votes ADD CONSTRAINT chk_option_index_positive 
  CHECK (option_index >= 0);
