"use client";

import { LIMITS } from "@pika/shared";
import { HeartHandshake } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { trackEvent } from "@/lib/events";
import { ProCard } from "./ui/ProCard";
import { TrackRow } from "./ui/TrackRow";

interface CompatResponse {
  sharedCount: number;
  viewerTrackCount: number;
  topShared: {
    title: string;
    artist: string;
    albumArtUrl: string | null;
    spotifyUrl: string;
  }[];
}

interface CompatCardProps {
  slug: string;
  djName: string;
}

/**
 * Dancer↔DJ compatibility (Slice D) — overlap-first: "you've loved N songs this DJ plays",
 * from the viewer's journal vs the DJ's public repertoire (the Signature's context set).
 * Per-viewer data → fetched via /api/me (FollowButton hydration pattern), never the cached
 * Booth payload. Renders nothing signed-out or below the overlap floor.
 */
export function CompatCard({ slug, djName }: CompatCardProps) {
  const { data: session, isPending } = authClient.useSession();
  const [compat, setCompat] = useState<CompatResponse | null>(null);
  const viewedFired = useRef(false);

  useEffect(() => {
    if (!session) {
      setCompat(null);
      return;
    }
    let cancelled = false;
    fetch(`${getApiBaseUrl()}/api/me/compat/${encodeURIComponent(slug)}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CompatResponse | null) => {
        if (cancelled || !d) return;
        setCompat(d);
        if (d.sharedCount >= LIMITS.COMPAT_MIN_OVERLAP && !viewedFired.current) {
          viewedFired.current = true;
          trackEvent("compat_viewed", { slug, sharedCount: d.sharedCount });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, slug]);

  if (isPending || !session || !compat || compat.sharedCount < LIMITS.COMPAT_MIN_OVERLAP) {
    return null;
  }

  return (
    <ProCard className="mb-8 p-8 sm:p-10" glow glowColor="purple-500">
      <div className="flex items-center gap-3 mb-2">
        <HeartHandshake className="w-4 h-4 text-pink-500" />
        <h3 className="font-black text-white italic uppercase tracking-widest text-xs">
          Your match.
        </h3>
      </div>
      <p className="text-slate-400 text-sm font-medium mb-6">
        You&apos;ve loved <span className="text-white font-black">{compat.sharedCount}</span>{" "}
        {compat.sharedCount === 1 ? "song" : "songs"} {djName} plays.
      </p>
      <div className="space-y-1">
        {compat.topShared.map((t) => (
          <TrackRow
            key={`${t.artist}-${t.title}`}
            title={t.title}
            artist={t.artist}
            albumArtUrl={t.albumArtUrl}
            spotifyUrl={t.spotifyUrl}
          />
        ))}
      </div>
    </ProCard>
  );
}
