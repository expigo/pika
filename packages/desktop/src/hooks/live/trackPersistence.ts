/**
 * Track persistence for the LIVE path — find-or-create a library track (with lazy VDJ metadata
 * healing) so a play can be recorded + broadcast. Extracted verbatim from `useLiveSession.ts`
 * (2026-07) to keep the hook an orchestrator.
 *
 * NOTE: `services/trackService.ts` holds an OLDER, diverged copy of `findOrCreateTrack` used by
 * the history-import path (`useVdjHistory`). This live variant additionally captures the remembered
 * Spotify identity + track duration (the dancer wedge). Consolidating the two is a deliberate
 * FOLLOW-UP (the history path has its own behavior + weaker test coverage) — see the refactor notes.
 */

import { getTrackKey } from "@pika/shared";
import { invoke } from "@tauri-apps/api/core";
import { trackRepository } from "../../db/repositories/trackRepository";
import { logger } from "../../utils/logger";
import { GHOST_FILE_PREFIX } from "./constants";

/**
 * Track info from database with fingerprint data
 */
export interface DbTrackInfo {
  id: number;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  danceability: number | null;
  brightness: number | null;
  acousticness: number | null;
  groove: number | null;
  // Remembered Spotify identity (B3) — surfaced to dancers on the live broadcast when confident.
  spotifyUrl: string | null;
  spotifyAlbumArtUrl: string | null;
  spotifyMatchConfidence: number | null;
  spotifyMatchSource: string | null; // 'auto' | 'dj_confirmed'
}

/**
 * VDJ track metadata from Rust lookup
 */
interface VdjTrackMetadata {
  bpm: number | null;
  key: string | null;
  volume: number | null;
  duration: number | null; // seconds, from VDJ Infos.SongLength
}

/**
 * Find or create a track in the database by artist/title
 * Returns the track with fingerprint data for broadcasting
 *
 * Uses O(log n) indexed lookup via track_key
 */
export async function findOrCreateTrack(
  artist: string,
  title: string,
  filePath?: string,
): Promise<DbTrackInfo> {
  const trackKey = getTrackKey(artist, title);

  // O(log n) indexed lookup - no table scan!
  const existing = await trackRepository.findByTrackKey(trackKey);

  if (existing) {
    // Self-healing: If BPM is missing, try to fetch it from VDJ
    if (!existing.bpm && filePath && !filePath.startsWith(GHOST_FILE_PREFIX)) {
      try {
        const vdjMeta = await invoke<VdjTrackMetadata | null>("lookup_vdj_track_metadata", {
          filePath,
        });
        if (vdjMeta?.bpm) {
          logger.debug("Live", "Healing track metadata", {
            id: existing.id,
            bpm: vdjMeta.bpm,
            key: vdjMeta.key,
          });

          // Update DB (fire and forget await, but use the value for return)
          const bpmToSave =
            typeof vdjMeta.bpm === "string"
              ? Number.parseFloat(vdjMeta.bpm)
              : (vdjMeta.bpm as number | null);

          await trackRepository.insertTrack({
            filePath,
            artist,
            title,
            bpm: bpmToSave,
            key: vdjMeta.key || existing.key,
            duration: vdjMeta.duration,
          });

          return {
            ...existing,
            bpm: bpmToSave,
            key: vdjMeta.key || existing.key,
          };
        }
      } catch (error) {
        logger.warn("Live", "Failed to heal track metadata", error);
      }
    }

    return {
      id: existing.id,
      bpm: existing.bpm,
      key: existing.key,
      energy: existing.energy,
      danceability: existing.danceability,
      brightness: existing.brightness,
      acousticness: existing.acousticness,
      groove: existing.groove,
      spotifyUrl: existing.spotifyUrl,
      spotifyAlbumArtUrl: existing.spotifyAlbumArtUrl,
      spotifyMatchConfidence: existing.spotifyMatchConfidence,
      spotifyMatchSource: existing.spotifyMatchSource,
    };
  }

  // New track - try VDJ lookup for BPM/key (lazy extraction)
  let vdjBpm: number | null = null;
  let vdjKey: string | null = null;
  let vdjDuration: number | null = null;

  if (filePath && !filePath.startsWith(GHOST_FILE_PREFIX)) {
    try {
      const vdjMeta = await invoke<VdjTrackMetadata | null>("lookup_vdj_track_metadata", {
        filePath,
      });
      if (vdjMeta) {
        vdjBpm = vdjMeta.bpm;
        vdjKey = vdjMeta.key;
        vdjDuration = vdjMeta.duration;
        logger.debug("Live", "Got VDJ metadata", {
          bpm: vdjBpm,
          key: vdjKey,
          duration: vdjDuration,
        });
      }
    } catch (error) {
      logger.warn("Live", "VDJ lookup failed", error);
    }
  }

  // Insert new track
  const bpmToSave =
    typeof vdjBpm === "string" ? Number.parseFloat(vdjBpm) : (vdjBpm as number | null);

  logger.debug("Live", "Creating track", { artist, title, bpm: bpmToSave });
  const newId = await trackRepository.insertTrack({
    filePath: filePath || `${GHOST_FILE_PREFIX}${artist}/${title}`,
    artist,
    title,
    bpm: bpmToSave,
    duration: vdjDuration,
    key: vdjKey,
  });

  return {
    id: newId,
    bpm: bpmToSave,
    key: vdjKey,
    energy: null,
    danceability: null,
    brightness: null,
    acousticness: null,
    groove: null,
    // A brand-new track has never been matched to Spotify.
    spotifyUrl: null,
    spotifyAlbumArtUrl: null,
    spotifyMatchConfidence: null,
    spotifyMatchSource: null,
  };
}
