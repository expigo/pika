import { getTrackKey } from "@pika/shared";
import { invoke } from "@tauri-apps/api/core";
import { trackRepository } from "../db/repositories/trackRepository";
import { logger } from "../utils/logger";

const GHOST_FILE_PREFIX = "ghost://";

export interface DbTrackInfo {
  id: number;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  danceability: number | null;
  brightness: number | null;
  acousticness: number | null;
  groove: number | null;
}

interface VdjTrackMetadata {
  bpm: number | null;
  key: string | null;
  volume: number | null;
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
    };
  }

  // New track - try VDJ lookup for BPM/key (lazy extraction)
  let vdjBpm: number | null = null;
  let vdjKey: string | null = null;

  if (filePath && !filePath.startsWith(GHOST_FILE_PREFIX)) {
    try {
      const vdjMeta = await invoke<VdjTrackMetadata | null>("lookup_vdj_track_metadata", {
        filePath,
      });
      if (vdjMeta) {
        vdjBpm = vdjMeta.bpm;
        vdjKey = vdjMeta.key;
        logger.debug("Live", "Got VDJ metadata", { bpm: vdjBpm, key: vdjKey });
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
  };
}
