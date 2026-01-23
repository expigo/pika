import type { TrackInfo } from "@pika/shared";
import { invoke } from "@tauri-apps/api/core";
import { settingsRepository } from "../db/repositories/settingsRepository";

/**
 * Extended track info from VirtualDJ with additional metadata.
 * When sending to Cloud, map to TrackInfo.
 */
export interface NowPlayingTrack extends TrackInfo {
  filePath: string;
  timestamp: Date;
  rawTimestamp?: number;
}

/**
 * Convert NowPlayingTrack to TrackInfo for WebSocket messages.
 * Includes fingerprint data if available.
 */
export function toTrackInfo(track: NowPlayingTrack): TrackInfo {
  return {
    artist: track.artist,
    title: track.title,
    // Core metrics
    bpm: track.bpm,
    key: track.key,
    // Fingerprint metrics (if available on track)
    energy: track.energy,
    danceability: track.danceability,
    brightness: track.brightness,
    acousticness: track.acousticness,
    groove: track.groove,
  };
}

interface HistoryTrack {
  artist: string;
  title: string;
  file_path: string;
  timestamp: number;
}

type TrackChangeCallback = (track: NowPlayingTrack) => void;

/**
 * VirtualDJ History Watcher
 * Monitors the VirtualDJ history folder for track changes using Rust backend
 */
class VirtualDJWatcher {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastTrack: NowPlayingTrack | null = null;
  private lastTimestamp: number = 0;
  private listeners: TrackChangeCallback[] = [];

  /**
   * Read and parse the latest track from history using Rust
   */
  async readLatestTrack(): Promise<NowPlayingTrack | null> {
    try {
      // Get custom VDJ path from settings (may be "auto" or a file path)
      const customPath = await settingsRepository.get("library.vdjPath");

      const result = await invoke<HistoryTrack | null>("read_virtualdj_history", {
        customPath: customPath,
      });

      if (!result) {
        console.log("[VDJ Watcher] No track found in history");
        return null;
      }

      console.log("[VDJ Watcher] Got track from Rust:", result.artist, "-", result.title);

      const track: NowPlayingTrack = {
        artist: result.artist,
        title: result.title,
        filePath: result.file_path,
        timestamp: new Date(result.timestamp * 1000),
        rawTimestamp: result.timestamp,
      };

      // Do not update this.lastTrack here - let the watcher handle it
      // this.lastTrack = track;
      return track;
    } catch (e) {
      console.error("[VDJ Watcher] Failed to read history:", e);
      return null;
    }
  }

  /**
   * Start watching for track changes
   */
  async startWatching(intervalMs: number = 1000): Promise<void> {
    if (this.pollingInterval) {
      console.log("[VDJ Watcher] Already watching");
      return;
    }

    console.log("[VDJ Watcher] Starting to watch for track changes...");

    // Initial read
    const initial = await this.readLatestTrack();
    if (initial) {
      console.log("[VDJ Watcher] Initial track:", initial.artist, "-", initial.title);
      this.lastTrack = initial;
      this.lastTimestamp = initial.rawTimestamp ?? 0;
      // Notify listeners of initial track
      this.notifyListeners(initial);
    }

    // Start polling
    this.pollingInterval = setInterval(async () => {
      try {
        const track = await this.readLatestTrack();
        if (track && this.hasTrackChanged(track)) {
          console.log("[VDJ Watcher] Track changed:", track.artist, "-", track.title);
          this.lastTrack = track;
          this.lastTimestamp = track.rawTimestamp ?? 0;
          this.notifyListeners(track);
        }
      } catch (e) {
        console.error("[VDJ Watcher] Polling error:", e);
      }
    }, intervalMs);
  }

  /**
   * Stop watching
   */
  stopWatching(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.lastTimestamp = 0;
      console.log("[VDJ Watcher] Stopped watching");
    }
  }

  /**
   * Check if track has changed since last notification
   */
  private hasTrackChanged(track: NowPlayingTrack): boolean {
    if (track.rawTimestamp && this.lastTimestamp) {
      return track.rawTimestamp !== this.lastTimestamp;
    }

    if (!this.lastTrack) return true;

    return track.artist !== this.lastTrack.artist || track.title !== this.lastTrack.title;
  }

  /**
   * Add a listener for track changes
   */
  onTrackChange(callback: TrackChangeCallback): () => void {
    this.listeners.push(callback);
    console.log("[VDJ Watcher] Listener added, total:", this.listeners.length);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
      console.log("[VDJ Watcher] Listener removed, total:", this.listeners.length);
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(track: NowPlayingTrack): void {
    console.log("[VDJ Watcher] Notifying", this.listeners.length, "listeners");
    for (const listener of this.listeners) {
      try {
        listener(track);
      } catch (e) {
        console.error("[VDJ Watcher] Listener error:", e);
      }
    }
  }

  /**
   * Get current track
   */
  getCurrentTrack(): NowPlayingTrack | null {
    return this.lastTrack;
  }
}

// Singleton instance
export const virtualDjWatcher = new VirtualDJWatcher();
