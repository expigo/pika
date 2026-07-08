"use client";

import { Heart, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type CrowdPleasersData, getMyCrowdPleasers } from "@/lib/djLive";
import { trackEvent } from "@/lib/events";
import { TrackRow } from "./ui/TrackRow";

/**
 * Crowd-pleasers (Slice D) — the DJ-private floor-love leaderboard across ALL their sessions:
 * the "why keep broadcasting" surface. Mounted on /dj/booth beside the Booth manager.
 */
export function CrowdPleasers() {
  const [data, setData] = useState<CrowdPleasersData | null>(null);
  const viewedFired = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getMyCrowdPleasers()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        if (!viewedFired.current && d.tracks.length > 0) {
          viewedFired.current = true;
          trackEvent("dj_stats_viewed", { tracks: d.tracks.length });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || data.tracks.length === 0) return null;

  return (
    <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp size={14} className="text-purple-400" />
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-300">
          Crowd-pleasers
        </h2>
      </div>

      <div className="mb-4 flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <span>
          <span className="text-slate-200">{data.totals.sessions}</span> sets
        </span>
        <span>
          <span className="text-slate-200">{data.totals.likes}</span> likes
        </span>
        <span>
          <span className="text-slate-200">{data.totals.dancers}</span> dancers
        </span>
      </div>

      <div className="space-y-1">
        {data.tracks.map((t, i) => (
          <TrackRow
            key={`${t.artist}-${t.title}`}
            title={t.title}
            artist={t.artist}
            albumArtUrl={t.albumArtUrl}
            spotifyUrl={t.spotifyUrl ?? undefined}
            position={i + 1}
          >
            <span className="flex items-center gap-1 text-[10px] font-black text-red-400 tabular-nums">
              <Heart className="w-3 h-3 fill-current" />
              {t.likes}
            </span>
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
              {t.plays} {t.plays === 1 ? "play" : "plays"}
            </span>
          </TrackRow>
        ))}
      </div>
    </section>
  );
}
