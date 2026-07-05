/**
 * /api/img pinhole-proxy tests — the SSRF surface is the whole point: exactly one host/path
 * shape passes, redirects are refused, and only image/* bodies under the cap stream through.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { imgRoutes } from "./img";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(response: Response | Error): void {
  globalThis.fetch = ((..._args: unknown[]) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response)) as never;
}

describe("/api/img", () => {
  test("rejects anything off the allowlist with 400 — and never fetches", async () => {
    let fetched = false;
    globalThis.fetch = ((..._args: unknown[]) => {
      fetched = true;
      return Promise.resolve(new Response("nope"));
    }) as never;
    for (const src of [
      "https://evil.example/image/abc",
      "https://i.scdn.co/other/abc",
      "https://i.scdn.co.evil.example/image/abc",
      "http://i.scdn.co/image/abc", // http downgrade
      "https://i.scdn.co/image/abc?x=1", // query smuggling
      "",
    ]) {
      const res = await imgRoutes.request(`/?src=${encodeURIComponent(src)}`);
      expect(res.status).toBe(400);
    }
    expect(fetched).toBe(false);
  });

  test("streams an allowed image with the long immutable cache header", async () => {
    stubFetch(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    const res = await imgRoutes.request("/?src=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab12CD");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=604800, immutable");
  });

  test("rejects non-image upstream bodies with 502", async () => {
    stubFetch(
      new Response("<html>login</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    const res = await imgRoutes.request("/?src=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab12CD");
    expect(res.status).toBe(502);
  });

  test("a redirect attempt (fetch throws under redirect:'error') → 502, not followed", async () => {
    stubFetch(new Error("unexpected redirect"));
    const res = await imgRoutes.request("/?src=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab12CD");
    expect(res.status).toBe(502);
  });
});
