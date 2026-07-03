/**
 * Telemetry ingest validation tests. The DB insert is fire-and-forget (failures swallowed →
 * still 204), so the happy path runs without Postgres too; the row-actually-lands assertion
 * lives in the gated integration suite.
 */

import { describe, expect, test } from "bun:test";
import { telemetryRoutes } from "./telemetry";

function post(body: unknown, raw = false): Promise<Response> {
  return telemetryRoutes.request("/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /events validation", () => {
  test("unknown event name → 400", async () => {
    const res = await post({ event: "made_up_event" });
    expect(res.status).toBe(400);
  });

  test("missing event → 400", async () => {
    const res = await post({ clientId: "client_x" });
    expect(res.status).toBe(400);
  });

  test("malformed JSON body → 400", async () => {
    const res = await post("definitely not json", true);
    expect(res.status).toBe(400);
  });

  test("malformed clientId → 400", async () => {
    const res = await post({ event: "journal_opened", clientId: "not-a-client-id!" });
    expect(res.status).toBe(400);
  });

  test("oversized props → 400", async () => {
    const res = await post({
      event: "journal_opened",
      props: { blob: "x".repeat(1100) },
    });
    expect(res.status).toBe(400);
  });

  test("valid event → 204 (insert is fire-and-forget)", async () => {
    const res = await post({
      event: "journal_opened",
      clientId: "client_unit_test",
      props: { totalLikes: 3 },
    });
    expect(res.status).toBe(204);
  });
});
