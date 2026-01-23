/**
 * Session Repository
 * Manages DJ sessions (Logbook) and track plays within them.
 */

import { eq, sql } from "drizzle-orm";
import { db, getSqlite } from "../index";
import { type PlayReaction, plays, sessions } from "../schema";

// ============================================================================
// Types
// ============================================================================

export interface Session {
  id: number;
  uuid: string;
  cloudSessionId: string | null;
  djIdentity: string;
  name: string | null;
  startedAt: number;
  endedAt: number | null;
}

export interface Play {
  id: number;
  sessionId: number;
  trackId: number;
  playedAt: number;
  duration: number | null;
  reaction: PlayReaction;
  notes: string | null;
  dancerLikes: number;
}

export interface PlayWithTrack extends Play {
  artist: string | null;
  title: string | null;
  bpm: number | null;
  key: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Generate a UUID v4 */
function generateUuid(): string {
  return crypto.randomUUID();
}

/** Get current Unix timestamp (seconds) */
function now(): number {
  return Math.floor(Date.now() / 1000);
}

// ============================================================================
// Session Repository
// ============================================================================

export const sessionRepository = {
  // ========================================================================
  // Session CRUD
  // ========================================================================

  /**
   * Create a new session (start a DJ set)
   */
  async createSession(name?: string, identity = "Default"): Promise<Session> {
    const uuid = generateUuid();
    const startedAt = now();
    const sessionName = name || `Session ${new Date().toLocaleDateString()}`;

    const sqlite = await getSqlite();

    // 🛡️ R3 Fix: Transaction to prevent race where session isn't found immediately after insert
    await sqlite.execute("BEGIN TRANSACTION");

    try {
      // Insert the new session
      await sqlite.execute(
        `INSERT INTO sessions (uuid, dj_identity, name, started_at, ended_at) VALUES (?, ?, ?, ?, NULL)`,
        [uuid, identity, sessionName, startedAt],
      );

      // Get the inserted session by UUID
      const result = await sqlite.select<Record<string, unknown>[]>(
        `SELECT * FROM sessions WHERE uuid = ? LIMIT 1`,
        [uuid],
      );

      await sqlite.execute("COMMIT");

      if (result.length === 0) {
        throw new Error("Failed to create session - not found after insert");
      }

      const row = result[0];
      return {
        id: row.id as number,
        uuid: row.uuid as string,
        cloudSessionId: row.cloud_session_id as string | null,
        djIdentity: row.dj_identity as string,
        name: row.name as string | null,
        startedAt: row.started_at as number,
        endedAt: row.ended_at as number | null,
      };
    } catch (e) {
      await sqlite.execute("ROLLBACK");
      throw e;
    }
  },

  /**
   * End a session (close the DJ set)
   */
  async endSession(sessionId: number): Promise<void> {
    await db.update(sessions).set({ endedAt: now() }).where(eq(sessions.id, sessionId));
  },

  /**
   * Set the cloud session ID for a session (for recap link)
   */
  async setCloudSessionId(sessionId: number, cloudSessionId: string): Promise<void> {
    await db.update(sessions).set({ cloudSessionId }).where(eq(sessions.id, sessionId));
  },

  /**
   * Get a session by ID
   */
  async getSession(sessionId: number): Promise<Session | null> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<Record<string, unknown>[]>(
      `SELECT * FROM sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    );

    if (result.length === 0) return null;

    const row = result[0];
    return {
      id: row.id as number,
      uuid: row.uuid as string,
      cloudSessionId: row.cloud_session_id as string | null,
      djIdentity: row.dj_identity as string,
      name: row.name as string | null,
      startedAt: row.started_at as number,
      endedAt: row.ended_at as number | null,
    };
  },

  /**
   * Get the currently active session (if any)
   */
  async getActiveSession(): Promise<Session | null> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<Record<string, unknown>[]>(
      "SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
    );

    if (result.length === 0) return null;

    // Map snake_case to camelCase
    const row = result[0];
    return {
      id: row.id as number,
      uuid: row.uuid as string,
      cloudSessionId: row.cloud_session_id as string | null,
      djIdentity: row.dj_identity as string,
      name: row.name as string | null,
      startedAt: row.started_at as number,
      endedAt: row.ended_at as number | null,
    };
  },

  /**
   * Get all sessions (for logbook view)
   */
  async getAllSessions(limit = 50): Promise<Session[]> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<Record<string, unknown>[]>(
      `SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?`,
      [limit],
    );

    return result.map((row) => ({
      id: row.id as number,
      uuid: row.uuid as string,
      cloudSessionId: row.cloud_session_id as string | null,
      djIdentity: row.dj_identity as string,
      name: row.name as string | null,
      startedAt: row.started_at as number,
      endedAt: row.ended_at as number | null,
    }));
  },

  // ========================================================================
  // Play CRUD
  // ========================================================================

  /**
   * Add a track play to a session
   */
  async addPlay(sessionId: number, trackId: number, playedAt?: number): Promise<Play> {
    const timestamp = playedAt ?? now();
    const sqlite = await getSqlite();

    // Insert the new play
    await sqlite.execute(
      `INSERT INTO plays (session_id, track_id, played_at, duration, reaction, notes, dancer_likes) 
             VALUES (?, ?, ?, NULL, 'neutral', NULL, 0)`,
      [sessionId, trackId, timestamp],
    );

    // Get the last inserted play
    const result = await sqlite.select<Record<string, unknown>[]>(
      `SELECT * FROM plays WHERE session_id = ? AND track_id = ? AND played_at = ? ORDER BY id DESC LIMIT 1`,
      [sessionId, trackId, timestamp],
    );

    if (result.length === 0) {
      throw new Error("Failed to create play - not found after insert");
    }

    const row = result[0];
    return {
      id: row.id as number,
      sessionId: row.session_id as number,
      trackId: row.track_id as number,
      playedAt: row.played_at as number,
      duration: row.duration as number | null,
      reaction: row.reaction as PlayReaction,
      notes: row.notes as string | null,
      dancerLikes: row.dancer_likes as number,
    };
  },

  /**
   * Update the reaction for a play
   */
  async updatePlayReaction(playId: number, reaction: PlayReaction): Promise<void> {
    await db.update(plays).set({ reaction }).where(eq(plays.id, playId));
  },

  /**
   * Update the notes for a play
   */
  async updatePlayNotes(playId: number, notes: string): Promise<void> {
    await db.update(plays).set({ notes }).where(eq(plays.id, playId));
  },

  /**
   * Update the duration for a play (when track ends)
   */
  async updatePlayDuration(playId: number, duration: number): Promise<void> {
    await db.update(plays).set({ duration }).where(eq(plays.id, playId));
  },

  /**
   * Increment dancer likes for a play
   */
  async incrementDancerLikes(playId: number): Promise<void> {
    await db
      .update(plays)
      .set({ dancerLikes: sql`${plays.dancerLikes} + 1` })
      .where(eq(plays.id, playId));
  },

  /**
   * Increment dancer likes for a play by a specific count (batch operation)
   */
  async incrementDancerLikesBy(playId: number, count: number): Promise<void> {
    if (count <= 0) return;
    await db
      .update(plays)
      .set({ dancerLikes: sql`${plays.dancerLikes} + ${count}` })
      .where(eq(plays.id, playId));
  },

  /**
   * Get all plays for a session (with track info)
   */
  async getSessionPlays(sessionId: number): Promise<PlayWithTrack[]> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<Record<string, unknown>[]>(
      `
            SELECT 
                p.id, p.session_id, p.track_id, p.played_at, p.duration,
                p.reaction, p.notes, p.dancer_likes,
                t.artist, t.title, t.bpm, t.key
            FROM plays p
            LEFT JOIN tracks t ON p.track_id = t.id
            WHERE p.session_id = ?
            ORDER BY p.played_at ASC
        `,
      [sessionId],
    );

    return result.map((row) => ({
      id: row.id as number,
      sessionId: row.session_id as number,
      trackId: row.track_id as number,
      playedAt: row.played_at as number,
      duration: row.duration as number | null,
      reaction: row.reaction as PlayReaction,
      notes: row.notes as string | null,
      dancerLikes: row.dancer_likes as number,
      artist: row.artist as string | null,
      title: row.title as string | null,
      bpm: row.bpm as number | null,
      key: row.key as string | null,
    }));
  },

  /**
   * Get play count for a session
   */
  async getSessionPlayCount(sessionId: number): Promise<number> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM plays WHERE session_id = ?`,
      [sessionId],
    );
    return result[0]?.count ?? 0;
  },

  /**
   * Get full session details including all plays
   */
  async getSessionDetails(sessionId: number): Promise<SessionDetails | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const plays = await this.getSessionPlays(sessionId);

    // Calculate stats
    const totalTracks = plays.length;
    const peakCount = plays.filter((p) => p.reaction === "peak").length;
    const brickCount = plays.filter((p) => p.reaction === "brick").length;

    // Calculate duration
    const duration = session.endedAt
      ? session.endedAt - session.startedAt
      : Math.floor(Date.now() / 1000) - session.startedAt;

    return {
      session,
      plays,
      stats: {
        totalTracks,
        peakCount,
        brickCount,
        duration,
      },
    };
  },

  /**
   * Delete a session and all its plays
   */
  async deleteSession(sessionId: number): Promise<void> {
    const sqlite = await getSqlite();
    try {
      await sqlite.execute("BEGIN TRANSACTION");
      // Delete plays first (foreign key constraint)
      await sqlite.execute(`DELETE FROM plays WHERE session_id = ?`, [sessionId]);
      // Delete the session
      await sqlite.execute(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
      await sqlite.execute("COMMIT");
    } catch (e) {
      console.error(`Failed to delete session ${sessionId}, rolling back:`, e);
      await sqlite.execute("ROLLBACK");
      throw e;
    }
  },

  /**
   * Get summary of all sessions (aggregated stats)
   */
  async getAllSessionsSummary(): Promise<AllSessionsSummary> {
    const sqlite = await getSqlite();

    // Get session count
    const sessionCountResult = await sqlite.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM sessions`,
    );
    const totalSessions = sessionCountResult[0]?.count || 0;

    // Get play stats
    const playStatsResult = await sqlite.select<
      {
        total_plays: number;
        total_peaks: number;
        total_bricks: number;
        total_duration: number;
        total_likes: number;
      }[]
    >(`
            SELECT 
                COUNT(*) as total_plays,
                SUM(CASE WHEN reaction = 'peak' THEN 1 ELSE 0 END) as total_peaks,
                SUM(CASE WHEN reaction = 'brick' THEN 1 ELSE 0 END) as total_bricks,
                COALESCE(SUM(duration), 0) as total_duration,
                COALESCE(SUM(dancer_likes), 0) as total_likes
            FROM plays
        `);

    const stats = playStatsResult[0];

    // Get total duration from sessions (more accurate)
    const durationResult = await sqlite.select<{ total: number }[]>(`
            SELECT COALESCE(SUM(ended_at - started_at), 0) as total
            FROM sessions
            WHERE ended_at IS NOT NULL
        `);
    const totalDuration = durationResult[0]?.total || 0;

    // Get unique tracks count
    const uniqueTracksResult = await sqlite.select<{ count: number }[]>(`
            SELECT COUNT(DISTINCT track_id) as count FROM plays
        `);
    const uniqueTracks = uniqueTracksResult[0]?.count || 0;

    // Get top liked tracks (aggregated across all sessions)
    const topLikedResult = await sqlite.select<
      {
        track_id: number;
        artist: string | null;
        title: string | null;
        total_likes: number;
      }[]
    >(`
            SELECT 
                p.track_id,
                t.artist,
                t.title,
                SUM(p.dancer_likes) as total_likes
            FROM plays p
            JOIN tracks t ON p.track_id = t.id
            WHERE p.dancer_likes > 0
            GROUP BY p.track_id
            ORDER BY total_likes DESC
            LIMIT 5
        `);

    // Get most peaked tracks
    const topPeakedResult = await sqlite.select<
      {
        track_id: number;
        artist: string | null;
        title: string | null;
        peak_count: number;
      }[]
    >(`
            SELECT 
                p.track_id,
                t.artist,
                t.title,
                COUNT(*) as peak_count
            FROM plays p
            JOIN tracks t ON p.track_id = t.id
            WHERE p.reaction = 'peak'
            GROUP BY p.track_id
            ORDER BY peak_count DESC
            LIMIT 5
        `);

    // Get best sessions by peak ratio
    const topSessionsResult = await sqlite.select<
      {
        session_id: number;
        session_name: string | null;
        peak_count: number;
        track_count: number;
      }[]
    >(`
            SELECT 
                s.id as session_id,
                s.name as session_name,
                SUM(CASE WHEN p.reaction = 'peak' THEN 1 ELSE 0 END) as peak_count,
                COUNT(*) as track_count
            FROM sessions s
            JOIN plays p ON s.id = p.session_id
            GROUP BY s.id
            ORDER BY peak_count DESC
            LIMIT 5
        `);

    return {
      totalSessions,
      totalPlays: stats?.total_plays || 0,
      uniqueTracks,
      totalPeaks: stats?.total_peaks || 0,
      totalBricks: stats?.total_bricks || 0,
      totalDuration,
      totalLikes: stats?.total_likes || 0,
      topLikedTracks: topLikedResult.map((t) => ({
        trackId: t.track_id,
        artist: t.artist,
        title: t.title,
        totalLikes: t.total_likes,
      })),
      topPeakedTracks: topPeakedResult.map((t) => ({
        trackId: t.track_id,
        artist: t.artist,
        title: t.title,
        peakCount: t.peak_count,
      })),
      topSessions: topSessionsResult.map((s) => ({
        sessionId: s.session_id,
        sessionName: s.session_name,
        peakCount: s.peak_count,
        trackCount: s.track_count,
      })),
    };
  },
};

// Session details type for logbook
export interface SessionDetails {
  session: Session;
  plays: PlayWithTrack[];
  stats: {
    totalTracks: number;
    peakCount: number;
    brickCount: number;
    duration: number;
  };
}

// Track summary for rankings
export interface TrackSummary {
  trackId: number;
  artist: string | null;
  title: string | null;
}

// All sessions summary
export interface AllSessionsSummary {
  totalSessions: number;
  totalPlays: number;
  uniqueTracks: number;
  totalPeaks: number;
  totalBricks: number;
  totalDuration: number;
  totalLikes: number;
  topLikedTracks: (TrackSummary & { totalLikes: number })[];
  topPeakedTracks: (TrackSummary & { peakCount: number })[];
  topSessions: {
    sessionId: number;
    sessionName: string | null;
    peakCount: number;
    trackCount: number;
  }[];
}
