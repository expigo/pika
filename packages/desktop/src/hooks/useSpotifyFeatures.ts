/**
 * React hooks over the Spotify-features service (local-first cache + cloud fetch). Single-id variant
 * for a track detail panel; batch variant for lists/analytics. A null/absent id resolves to no
 * features (the track isn't matched, or isn't in the seeded catalog).
 */

import type { SpotifyAudioFeatures } from "@pika/shared";
import { useEffect, useMemo, useState } from "react";
import { getFeaturesForTracks } from "../services/spotifyFeaturesService";

export function useSpotifyFeatures(spotifyId: string | null | undefined): {
  features: SpotifyAudioFeatures | null;
  loading: boolean;
} {
  const [features, setFeatures] = useState<SpotifyAudioFeatures | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!spotifyId) {
      setFeatures(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getFeaturesForTracks([spotifyId])
      .then((m) => {
        if (active) setFeatures(m.get(spotifyId) ?? null);
      })
      .catch(() => {
        if (active) setFeatures(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [spotifyId]);

  return { features, loading };
}

export function useSpotifyFeaturesBatch(spotifyIds: Array<string | null | undefined>): {
  features: Map<string, SpotifyAudioFeatures>;
  loading: boolean;
} {
  const [features, setFeatures] = useState<Map<string, SpotifyAudioFeatures>>(new Map());
  const [loading, setLoading] = useState(false);
  // Stable key so a new array identity with the same ids doesn't refetch.
  const key = useMemo(
    () => [...new Set(spotifyIds.filter((x): x is string => Boolean(x)))].sort().join(","),
    [spotifyIds],
  );

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setFeatures(new Map());
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getFeaturesForTracks(ids)
      .then((m) => {
        if (active) setFeatures(m);
      })
      .catch(() => {
        if (active) setFeatures(new Map());
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key]);

  return { features, loading };
}
