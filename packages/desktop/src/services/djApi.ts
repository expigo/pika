/**
 * DJ profile API client (`/api/dj/me/*`) — thin wrapper over the cloud, distinct from
 * `spotifyPlaylist.ts` (which is scoped to `/api/playlist/*`). Auth (Better Auth bearer) + the
 * `X-Pika-Client` CSRF header are attached by `apiFetch`. Reuses `PlaylistApiError` so callers can
 * special-case auth (401/403) the same way as the playlist flow.
 */

import { apiFetch } from "./apiClient";
import { getConfiguredUrls } from "./settingsService";
import { PlaylistApiError } from "./spotifyPlaylist";

async function djFetch(path: string, init: { method: string; body?: unknown }): Promise<void> {
  const { apiUrl } = getConfiguredUrls();
  const res = await apiFetch(`${apiUrl}${path}`, {
    method: init.method,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new PlaylistApiError(res.status, detail.error ?? `Request failed: ${res.status}`);
  }
}

/**
 * Share this set's Spotify playlist on the DJ's public Pika profile — it then embeds on the set's
 * recap + shows a badge on the profile session row. `cloudSessionId` is the `pika_...` id stored
 * locally at go-live. Throws `PlaylistApiError` (404 = the set isn't a cloud session).
 */
export function syncSessionPlaylist(
  cloudSessionId: string,
  playlist: { spotifyPlaylistId: string; spotifyPlaylistUrl?: string },
): Promise<void> {
  return djFetch(`/api/dj/me/sessions/${encodeURIComponent(cloudSessionId)}/playlist`, {
    method: "POST",
    body: playlist,
  });
}

/** Un-share this set's playlist from the DJ's public profile. */
export function unsyncSessionPlaylist(cloudSessionId: string): Promise<void> {
  return djFetch(`/api/dj/me/sessions/${encodeURIComponent(cloudSessionId)}/playlist`, {
    method: "DELETE",
  });
}
