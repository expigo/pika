/**
 * Spotify oEmbed (D.1) — fetch a playlist's display TITLE at embed-add time.
 *
 * The narrow carve-out to the "embeds are never fetched" doctrine: this hits only the fixed
 * public oEmbed host with a URL built from the already-parsed 22-char playlist id (the caller
 * never passes raw user input, so there is no SSRF surface), and it fetches metadata — never
 * playlist content, never with credentials. The title is pure decoration: every failure path
 * returns null and the UI falls back to a generic label.
 */

import { logger, TIMEOUTS } from "@pika/shared";
import { z } from "zod";

const OEMBED_HOST = "https://open.spotify.com/oembed";
/** oEmbed bodies are ~1 KB; anything bigger than this is not the endpoint we think it is. */
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TITLE_CHARS = 300;

const OembedBody = z.object({ title: z.string().optional() });

export async function fetchSpotifyOembedTitle(
  spotifyPlaylistId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const target = `${OEMBED_HOST}?url=${encodeURIComponent(
    `https://open.spotify.com/playlist/${spotifyPlaylistId}`,
  )}`;
  try {
    const res = await fetchImpl(target, {
      redirect: "error", // never follow — the fixed host answers directly or not at all
      signal: AbortSignal.timeout(TIMEOUTS.OEMBED_FETCH),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return null;

    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const parsed = OembedBody.safeParse(JSON.parse(text));
    if (!parsed.success) return null;

    const title = parsed.data.title?.trim() ?? "";
    if (title.length === 0) return null;
    return title.slice(0, MAX_TITLE_CHARS);
  } catch (error) {
    // Timeouts, redirects, network and JSON errors all land here — the title just stays null.
    logger.warn("oEmbed title fetch failed", { spotifyPlaylistId, error: String(error) });
    return null;
  }
}
