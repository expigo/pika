/**
 * Record a track play to the local DB (the LIVE path). Applies the hybrid dedup (60s key window +
 * 2-min absolute interval), then find-or-creates the library track and appends a play. Returns the
 * play id + the track's fingerprint/identity for broadcasting, or `null` when deduped/failed.
 *
 * Extracted verbatim from `useLiveSession.ts` (2026-07 de-accretion); the dedup state lives in
 * `./playDedup` (its single owner) so this module and the hook's reset/import paths share it.
 */

import { sessionRepository } from "../../db/repositories/sessionRepository";
import type { NowPlayingTrack } from "../../services/virtualDjWatcher";
import { logger } from "../../utils/logger";
import { TRACK_DEDUP_WINDOW_MS } from "./constants";
import { getTrackLastPlay, MIN_REPLAY_INTERVAL_MS, setTrackLastPlay } from "./playDedup";
import {
  addProcessedTrackKey,
  getDbSessionId as getStoreDbSessionId,
  hasProcessedTrackKey,
} from "./stateHelpers";
import { type DbTrackInfo, findOrCreateTrack } from "./trackPersistence";

export async function recordPlay(
  track: NowPlayingTrack,
): Promise<{ playId: number; trackInfo: DbTrackInfo } | null> {
  if (!getStoreDbSessionId()) {
    logger.warn("Live", "No database session active");
    return null;
  }

  // Create a unique key for deduplication within the session
  const dedupWindow = Math.floor(Date.now() / TRACK_DEDUP_WINDOW_MS);
  const trackKey = `${track.artist}-${track.title}-${dedupWindow}`;

  // 🛡️ Layer 2: Absolute tracking for current session (Hybrid Dedup)
  // This blocks the same track from being recorded twice within 2 mins,
  // even if the 60s trackKey window above has rolled over.
  const absoluteKey = `${track.artist}-${track.title}`.toLowerCase();
  const lastPlayTime = getTrackLastPlay(absoluteKey);

  if (lastPlayTime !== undefined) {
    const timeSinceLastPlay = Date.now() - lastPlayTime;
    if (timeSinceLastPlay < MIN_REPLAY_INTERVAL_MS) {
      logger.debug("Live", "Track deduped (absolute interval)", {
        title: track.title,
        timeSinceLastPlayMs: timeSinceLastPlay,
      });
      return null;
    }
  }

  // 🛡️ Fix: Check AND Add immediately before any awaits to prevent race conditions
  // if multiple handleTrackChange calls happen in the same tick.
  if (hasProcessedTrackKey(trackKey)) {
    logger.debug("Live", "Track already recorded recently (window)", { title: track.title });
    return null;
  }
  addProcessedTrackKey(trackKey);
  setTrackLastPlay(absoluteKey, Date.now());

  try {
    const dbSessionId = getStoreDbSessionId();
    if (!dbSessionId) {
      logger.warn("Live", "No DB session ID, cannot record play");
      return null;
    }

    // Performance: findOrCreateTrack and addPlay are async,
    // but the trackKey already blocks other concurrent calls.
    const dbTrack = await findOrCreateTrack(track.artist, track.title, track.filePath);
    const timestamp = Math.floor(Date.now() / 1000);

    const play = await sessionRepository.addPlay(dbSessionId, dbTrack.id, timestamp);
    logger.info("Live", "Recorded play", {
      playId: play.id,
      artist: track.artist,
      title: track.title,
    });

    return { playId: play.id, trackInfo: dbTrack };
  } catch (error) {
    logger.error("Live", "Failed to record play", error);
    // Note: We don't remove the processed key on error to avoid spamming the DB
    // with failed retries for the same track in the same window.
    return null;
  }
}
