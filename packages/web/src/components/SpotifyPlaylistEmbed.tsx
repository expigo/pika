interface Props {
  spotifyPlaylistId: string;
  title?: string;
}

/**
 * Public Spotify playlist embed (Slice 5) — a cap-free iframe (no OAuth/matching/user-cap). The CSP in
 * `middleware.ts` allows `frame-src https://open.spotify.com`, or this renders nothing.
 */
export function SpotifyPlaylistEmbed({ spotifyPlaylistId, title }: Props) {
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
