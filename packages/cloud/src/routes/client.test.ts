/**
 * Client route guard tests — the clientId format check short-circuits before any DB or Spotify
 * work, so these run without Postgres (routes/playlist.test.ts pattern). Real-DB behavior
 * (pagination, retro-enrichment, export flow) lives in the gated integration suite.
 */

import { describe, expect, test } from "bun:test";
import { client } from "./client";

describe("client routes — clientId format guard", () => {
  test("GET with a malformed clientId → 400", async () => {
    const res = await client.request("/bad$id/likes");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Invalid client ID format");
  });

  test("GET without the client_ prefix → 400", async () => {
    const res = await client.request("/nope/likes");
    expect(res.status).toBe(400);
  });

  test("POST export with a malformed clientId → 400 before any export work", async () => {
    const res = await client.request("/nope/likes/playlist", { method: "POST" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Invalid client ID format");
  });

  test("DELETE with a malformed clientId → 400", async () => {
    const res = await client.request("/bad$id/likes/1", { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Invalid client ID format");
  });

  test("DELETE with a non-numeric like id → 400 before any DB work", async () => {
    const res = await client.request("/client_x/likes/abc", { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Invalid like id");
  });
});
