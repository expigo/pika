"use client";

import { Play } from "lucide-react";
import { useState } from "react";

interface Props {
  spotifyPlaylistId: string;
  title?: string;
  /** Slice D: render a light tap-to-load placeholder instead of the 352px iframe up front —
   * a Booth near the 24-playlist cap was shipping a very heavy mobile page. */
  collapsed?: boolean;
}

/**
 * Public Spotify playlist embed (Slice 5) — a cap-free iframe (no OAuth/matching/user-cap). The CSP in
 * `middleware.ts` allows `frame-src https://open.spotify.com`, or this renders nothing.
 */
export function SpotifyPlaylistEmbed({ spotifyPlaylistId, title, collapsed = false }: Props) {
  const [show, setShow] = useState(!collapsed);

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        aria-label={`Show Spotify player for ${title ?? "playlist"}`}
        className="w-full flex items-center justify-center gap-3 py-5 rounded-xl border border-white/5 bg-white/[0.03] text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-white/[0.06] transition-all"
      >
        <Play className="w-4 h-4 text-emerald-500" />
        Show Spotify player
      </button>
    );
  }

  return (
    <iframe
      title={title ?? "Spotify playlist"}
      src={`https://open.spotify.com/embed/playlist/${spotifyPlaylistId}`}
      width="100%"
      height="352"
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      className="rounded-xl border-0"
    />
  );
}
