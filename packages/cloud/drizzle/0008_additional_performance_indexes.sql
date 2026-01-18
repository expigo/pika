-- Additional performance indexes based on query pattern analysis
-- Migration: 0008_additional_performance_indexes

-- ============================================================================
-- LIKES TABLE
-- ============================================================================

-- Index for session-based like queries (used in recap analytics)
-- Query: SELECT * FROM likes WHERE session_id = ?
CREATE INDEX IF NOT EXISTS idx_likes_session_id ON likes(session_id);

-- Index for "My Likes" feature - dancer viewing their own likes
-- Query: SELECT * FROM likes WHERE client_id = ?
CREATE INDEX IF NOT EXISTS idx_likes_client_id ON likes(client_id);

-- ============================================================================
-- POLL_VOTES TABLE
-- ============================================================================

-- Index for vote aggregation per poll
-- Query: SELECT * FROM poll_votes WHERE poll_id = ?
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id);

-- ============================================================================
-- SESSION_EVENTS TABLE (Telemetry)
-- ============================================================================

-- Index for session telemetry lookups
-- Query: SELECT * FROM session_events WHERE session_id = ?
CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);

-- ============================================================================
-- PLAYED_TRACKS TABLE - Additional indexes
-- ============================================================================

-- Index for time-based queries (recent tracks, analytics)
-- Query: SELECT * FROM played_tracks WHERE session_id = ? ORDER BY played_at DESC
CREATE INDEX IF NOT EXISTS idx_played_tracks_session_played_at ON played_tracks(session_id, played_at DESC);

-- ============================================================================
-- SESSIONS TABLE - Additional indexes  
-- ============================================================================

-- Index for active sessions (where ended_at IS NULL)
-- Query: SELECT * FROM sessions WHERE ended_at IS NULL
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(ended_at) WHERE ended_at IS NULL;

-- Index for DJ history sorted by time
-- Query: SELECT * FROM sessions WHERE dj_user_id = ? ORDER BY started_at DESC
CREATE INDEX IF NOT EXISTS idx_sessions_dj_history ON sessions(dj_user_id, started_at DESC);
