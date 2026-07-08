/**
 * oEmbed title fetch — every failure path must return null (the title is decoration, never
 * correctness). Uses the DI'd fetchImpl, NOT module mocking (bun mock.module is process-global
 * and leaks across files — see CLAUDE.md).
 */

import { describe, expect, test } from "bun:test";
import { fetchSpotifyOembedTitle } from "./spotifyOembed";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const ID = "37i9dQZF1DXaXB8fQg7xif";

describe("fetchSpotifyOembedTitle", () => {
  test("parses the title from a healthy oEmbed response — and hits the fixed host with the parsed id", async () => {
    let requested = "";
    const title = await fetchSpotifyOembedTitle(ID, (async (input: RequestInfo | URL) => {
      requested = String(input);
      return jsonResponse({ title: "  Budafest Warmup  ", thumbnail_url: "https://x" });
    }) as typeof fetch);
    expect(title).toBe("Budafest Warmup"); // trimmed
    expect(requested.startsWith("https://open.spotify.com/oembed?url=")).toBe(true);
    expect(requested).toContain(encodeURIComponent(`https://open.spotify.com/playlist/${ID}`));
  });

  test("caps a runaway title at 300 chars", async () => {
    const title = await fetchSpotifyOembedTitle(ID, (async () =>
      jsonResponse({ title: "x".repeat(1000) })) as typeof fetch);
    expect(title?.length).toBe(300);
  });

  test("non-2xx → null", async () => {
    const title = await fetchSpotifyOembedTitle(
      ID,
      (async () => new Response("nope", { status: 404 })) as typeof fetch,
    );
    expect(title).toBeNull();
  });

  test("non-JSON content-type → null (HTML error pages don't become titles)", async () => {
    const title = await fetchSpotifyOembedTitle(
      ID,
      (async () =>
        new Response("<html>oops</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })) as typeof fetch,
    );
    expect(title).toBeNull();
  });

  test("invalid JSON body → null", async () => {
    const title = await fetchSpotifyOembedTitle(
      ID,
      (async () =>
        new Response("not json{", {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    );
    expect(title).toBeNull();
  });

  test("missing or empty title field → null", async () => {
    expect(
      await fetchSpotifyOembedTitle(ID, (async () =>
        jsonResponse({ thumbnail_url: "https://x" })) as typeof fetch),
    ).toBeNull();
    expect(
      await fetchSpotifyOembedTitle(ID, (async () =>
        jsonResponse({ title: "   " })) as typeof fetch),
    ).toBeNull();
  });

  test("oversize body → null", async () => {
    const title = await fetchSpotifyOembedTitle(ID, (async () =>
      jsonResponse({ title: "ok", pad: "y".repeat(70 * 1024) })) as typeof fetch);
    expect(title).toBeNull();
  });

  test("thrown fetch errors (timeout/abort/redirect/network) → null, never a throw", async () => {
    const title = await fetchSpotifyOembedTitle(ID, (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as typeof fetch);
    expect(title).toBeNull();
  });
});
