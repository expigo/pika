-- Performance indexes for common query patterns
-- Migration: 0007_add_performance_indexes

-- Index for session lookups by DJ
CREATE INDEX IF NOT EXISTS idx_sessions_dj_user_id ON sessions(dj_user_id);

-- Composite index for track lookups in recap analytics
CREATE INDEX IF NOT EXISTS idx_played_tracks_artist_title ON played_tracks(artist, title);

-- Index for likes by played_track_id (foreign key optimization)
CREATE INDEX IF NOT EXISTS idx_likes_played_track_id ON likes(played_track_id);

-- Index for tempo votes by session
CREATE INDEX IF NOT EXISTS idx_tempo_votes_session_id ON tempo_votes(session_id);

-- Index for polls by session
CREATE INDEX IF NOT EXISTS idx_polls_session_id ON polls(session_id);
