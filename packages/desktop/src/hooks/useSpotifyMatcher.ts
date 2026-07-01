import { useCallback, useRef, useState } from "react";
import { type Track, trackRepository } from "../db/repositories/trackRepository";
import { PlaylistApiError, resolveSpotifyTracks, searchSpotify } from "../services/spotifyPlaylist";

/**
 * Slice 2 — background library pre-match. Matches the DJ's whole local library to Spotify ahead of
 * time so Slice 1's live wedge (album art + "Listen on Spotify") fires for the bulk of what they play.
 * Clones the `useAnalyzer` throttled/serial/resumable/pause-stop machinery over a different work unit
 * (`searchSpotify`) and a different cursor (unmatched library tracks). Cap-free (app-token search) and
 * cache-first server-side; needs only the DJ's Pika login.
 */

const PAGE = 200; // rows per cursor query; re-queried as matched/attempted rows drop out
const THROTTLE_MS = 1100; // ~55/min, under the cloud's 60 req/min/DJ limiter
const RATE_LIMIT_BACKOFF_MS = 60_000; // on 429, wait out the window then retry the SAME track
const ART_BATCH = 50; // resolve-batch id cap
const MAX_DURATION_MS = 3_600_000; // cloud SearchBody cap
/**
 * The "high" confidence-tier floor. `searchSpotify` returns a tier STRING (no number); we only write
 * high-tier matches, and Slice 1's live gate surfaces `spotifyMatchConfidence >= 0.8`, so storing the
 * floor is a truthful lower bound that makes every auto-match visible live.
 */
const AUTO_HIGH_CONFIDENCE = 0.8;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface UseSpotifyMatcherState {
  isMatching: boolean;
  isPaused: boolean;
  currentTrack: Track | null;
  progress: number;
  total: number;
  matched: number;
  skipped: number;
  error: string | null;
}

export interface UseSpotifyMatcherReturn extends UseSpotifyMatcherState {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

export function useSpotifyMatcher(): UseSpotifyMatcherReturn {
  const [isMatching, setIsMatching] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [matched, setMatched] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs track state across the async loop (mirror useAnalyzer).
  const shouldContinue = useRef(true);
  const isMatchingRef = useRef(false);
  const isPausedRef = useRef(false);
  const resumeResolve = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    shouldContinue.current = false;
    if (isPausedRef.current && resumeResolve.current) resumeResolve.current();
  }, []);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    if (resumeResolve.current) {
      resumeResolve.current();
      resumeResolve.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (isMatchingRef.current) return; // prevent concurrent runs

    shouldContinue.current = true;
    isPausedRef.current = false;
    isMatchingRef.current = true;
    setIsMatching(true);
    setIsPaused(false);
    setError(null);
    setProgress(0);
    setMatched(0);
    setSkipped(0);

    // Matches whose candidate lacked album art (cache hits) — backfilled after the loop.
    const needArt: Array<{ trackId: number; spotifyId: string }> = [];

    try {
      const totalCount = await trackRepository.getUnmatchedCount();
      setTotal(totalCount);
      if (totalCount === 0) {
        setError("Everything's already matched.");
        return;
      }

      let processed = 0;
      let page = await trackRepository.getUnmatchedLibraryTracks(PAGE);

      while (shouldContinue.current && page.length > 0) {
        for (const track of page) {
          if (!shouldContinue.current) break;
          setCurrentTrack(track);

          const artist = track.artist ?? "";
          const title = track.title ?? "";
          const ms = track.duration && track.duration > 0 ? Math.round(track.duration * 1000) : 0;

          // Per-track retry loop so a 429 retries the SAME track (doesn't advance/skip it).
          let done = false;
          while (!done && shouldContinue.current) {
            try {
              const result = await searchSpotify({
                artist,
                title,
                ...(ms > 0 && ms <= MAX_DURATION_MS ? { durationMs: ms } : {}),
              });
              // Write ONLY high-confidence matches (recommendedIndex is always 0 here).
              const c = result.confidence === "high" ? result.candidates[0] : undefined;
              if (c) {
                await trackRepository.setTrackSpotifyMatch(track.id, {
                  spotifyId: c.spotifyId,
                  spotifyUrl: c.url,
                  albumArtUrl: c.albumArtUrl ?? null,
                  confidence: AUTO_HIGH_CONFIDENCE,
                  source: "auto",
                });
                if (!c.albumArtUrl) needArt.push({ trackId: track.id, spotifyId: c.spotifyId });
                setMatched((n) => n + 1);
              } else {
                await trackRepository.markSpotifyMatchAttempted(track.id);
                setSkipped((n) => n + 1);
              }
              done = true;
            } catch (e) {
              if (e instanceof PlaylistApiError && (e.status === 401 || e.status === 403)) {
                setError("Reconnect your Pika account to keep matching.");
                shouldContinue.current = false; // stop the whole run
                done = true;
              } else if (e instanceof PlaylistApiError && e.status === 429) {
                await sleep(RATE_LIMIT_BACKOFF_MS); // wait the window, then retry this track
              } else {
                // Bad title (400), 5xx, or network — skip this track, keep going.
                console.warn("[Matcher] search failed; skipping track", track.id, e);
                await trackRepository.markSpotifyMatchAttempted(track.id);
                setSkipped((n) => n + 1);
                done = true;
              }
            }
          }

          if (!shouldContinue.current) break; // auth-abort: don't count it as processed

          processed++;
          setProgress(processed);

          if (shouldContinue.current) await sleep(THROTTLE_MS);

          if (isPausedRef.current && shouldContinue.current) {
            await new Promise<void>((resolve) => {
              resumeResolve.current = resolve;
            });
          }
        }
        // Re-query: matched/attempted rows have dropped out of the cursor.
        page = shouldContinue.current ? await trackRepository.getUnmatchedLibraryTracks(PAGE) : [];
      }

      // Album-art backfill: cache-hit matches came back without art (the cache stores no image), and
      // art is what makes Slice 1's live wedge visible. Resolve in batches; throttle to respect the limiter.
      for (let i = 0; i < needArt.length && shouldContinue.current; i += ART_BATCH) {
        const batch = needArt.slice(i, i + ART_BATCH);
        try {
          const { candidates } = await resolveSpotifyTracks(batch.map((b) => b.spotifyId));
          const artById = new Map(
            candidates
              .filter((c) => c.albumArtUrl)
              .map((c) => [c.spotifyId, c.albumArtUrl as string]),
          );
          for (const b of batch) {
            const art = artById.get(b.spotifyId);
            if (art) await trackRepository.setTrackAlbumArt(b.trackId, art);
          }
        } catch (e) {
          console.warn("[Matcher] art backfill batch failed", e);
        }
        if (i + ART_BATCH < needArt.length) await sleep(THROTTLE_MS);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      isMatchingRef.current = false;
      isPausedRef.current = false;
      setIsMatching(false);
      setIsPaused(false);
      setCurrentTrack(null);
    }
  }, []);

  return {
    isMatching,
    isPaused,
    currentTrack,
    progress,
    total,
    matched,
    skipped,
    error,
    start,
    stop,
    pause,
    resume,
  };
}
