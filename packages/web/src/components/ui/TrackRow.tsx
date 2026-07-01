import { ExternalLink, Music2 } from "lucide-react";
import type { ReactNode } from "react";

interface TrackRowProps {
  title: string;
  artist: string;
  albumArtUrl?: string | null;
  spotifyUrl?: string | null;
  position?: number;
  /** Trailing page-specific stats (likes badge, time, tempo dots). */
  children?: ReactNode;
}

/**
 * Shared dancer-facing track row (Slice 4): album art + title/artist + "Listen on Spotify", with a
 * trailing slot for page-specific stats. Used on the recap + my-likes pages so the music-discovery loop
 * closes after the set. Album art + link are present only for matched tracks (nullable → graceful
 * fallback); mirrors the live now-playing treatment (`LivePlayer`).
 */
export function TrackRow({
  title,
  artist,
  albumArtUrl,
  spotifyUrl,
  position,
  children,
}: TrackRowProps) {
  return (
    <div className="px-6 sm:px-8 py-4 flex items-center gap-4">
      {position !== undefined && (
        <span className="text-slate-800 font-black text-xs w-6 italic tabular-nums shrink-0">
          {String(position).padStart(2, "0")}
        </span>
      )}
      {albumArtUrl ? (
        // biome-ignore lint/performance/noImgElement: plain <img> avoids next/image remote-host config for Spotify's album-art CDN (i.scdn.co)
        <img
          src={albumArtUrl}
          alt={`${title} cover`}
          loading="lazy"
          className="w-11 h-11 rounded-lg object-cover shrink-0 shadow-lg shadow-black/30"
        />
      ) : (
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center shrink-0">
          <Music2 className="w-4 h-4 text-slate-500" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-black italic truncate tracking-tight uppercase text-sm leading-tight">
          {title}
        </p>
        <p className="text-slate-500 text-[10px] font-black uppercase truncate tracking-widest mt-1">
          {artist}
        </p>
      </div>
      {spotifyUrl && (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Listen to ${title} on Spotify`}
          className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#1DB954]/10 border border-[#1DB954]/30 text-[#1DB954] hover:bg-[#1DB954]/20 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
    </div>
  );
}
