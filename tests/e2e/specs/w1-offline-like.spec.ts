import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { createDjSession, type DjSimulator } from "../fixtures/ws-dj-simulator";

/**
 * W1 — ACK-gated, idempotent offline-like flush (end-to-end).
 *
 * Drives the real dancer UI against the running cloud + real Postgres. The dancer's
 * WebSocket is proxied via `page.routeWebSocket` so we can deterministically (a) drop
 * the connection to force the offline-queue path, and (b) drop the server ACK to prove
 * the queue is retained until acknowledged.
 *   1. Likes queued while offline land in Postgres exactly once after reconnect.
 *   2. IndexedDB is cleared only after the server ACK.
 *   3. A dropped ACK keeps the queue; the next reconnect re-flushes → still ONE row.
 */

// Harness-agnostic DB read, keyed on DATABASE_URL so it works locally (:5433) and against CI's
// Postgres service (:5432). The E2E cloud runs with E2E_PERSIST=1, so `likes` rows are real.
const sql = postgres(
  process.env["DATABASE_URL"] ?? "postgres://pika:pika@localhost:5433/pika_cloud",
  {
    max: 1,
  },
);

async function likeCountInDb(sessionId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM likes WHERE session_id = ${sessionId}`;
  return row?.n ?? 0;
}

/** Pending offline likes idb-keyval holds for this session (idb-keyval store: keyval-store/keyval). */
async function pendingIdbCount(page: Page, sessionId: string) {
  return page.evaluate(async (sid) => {
    return await new Promise<number>((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open("keyval-store");
      } catch {
        return resolve(-1);
      }
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("keyval")) {
          db.close();
          return resolve(0);
        }
        const g = db
          .transaction("keyval", "readonly")
          .objectStore("keyval")
          .get(`pika_pending_likes_${sid}`);
        g.onsuccess = () => {
          const v = g.result;
          db.close();
          resolve(Array.isArray(v) ? v.length : 0);
        };
        g.onerror = () => {
          db.close();
          resolve(-2);
        };
      };
      req.onerror = () => resolve(-3);
    });
  }, sessionId);
}

/**
 * Proxy the dancer WS so the test controls connectivity + ACK delivery.
 * - goOffline(): drop the live socket and refuse new ones → client.readyState != OPEN → likes queue.
 * - goOnline():  allow the next reconnect to bridge to the real server.
 * - armAckDrop(): drop exactly the next server→client ACK frame.
 */
async function installWsControl(page: Page) {
  const state = { blocked: false, dropAck: false };
  // biome-ignore lint/suspicious/noExplicitAny: Playwright WebSocketRoute typing kept local
  let current: any = null;

  await page.routeWebSocket(/\/ws(\?|$)/, (ws) => {
    current = ws;
    if (state.blocked) {
      ws.close();
      return;
    }
    const server = ws.connectToServer();
    ws.onMessage((m: string | Buffer) => server.send(m));
    server.onMessage((m: string | Buffer) => {
      if (state.dropAck && typeof m === "string") {
        try {
          if (JSON.parse(m).type === "ACK") {
            state.dropAck = false;
            return; // swallow this ACK
          }
        } catch {
          /* not JSON — forward */
        }
      }
      ws.send(m);
    });
  });

  return {
    goOffline: () => {
      state.blocked = true;
      try {
        current?.close();
      } catch {
        /* already closed */
      }
    },
    goOnline: () => {
      state.blocked = false;
    },
    armAckDrop: () => {
      state.dropAck = true;
    },
  };
}

// Navigate straight to the session's player (the QR-code target URL) — deterministic,
// avoids homepage discovery flaking when multiple e2e sessions are live at once.
async function tuneIn(page: Page, sessionId: string, trackTitle: string) {
  await page.goto(`http://localhost:3002/live/${sessionId}`);
  await expect(page.getByText(trackTitle)).toBeVisible({ timeout: 15000 });
}

test.describe("W1: ACK-gated offline-like flush", () => {
  let dj: DjSimulator;

  // Runs under the standard E2E harness: playwright.config.ts sets E2E_PERSIST=1 so `likes` rows are
  // real. Prerequisite: Postgres up + migrated (docker compose + db:migrate).
  test.afterAll(async () => {
    await sql.end();
  });

  test.afterEach(async () => {
    // End the session immediately so it doesn't linger in the 45s reconnect-grace (sibling-spec
    // isolation, matching the other specs).
    dj?.endSession();
    await new Promise((r) => setTimeout(r, 250));
    dj?.disconnect();
  });

  test("offline like → reconnect flush → exactly one DB row, IndexedDB cleared", async ({
    page,
  }) => {
    const ws = await installWsControl(page);
    dj = await createDjSession({
      djName: "W1 Happy DJ",
      track: { title: "Bad Wifi Blues", artist: "The Reconnects", bpm: 96 },
    });
    const sid = dj.getSessionId();

    await tuneIn(page, sid, "Bad Wifi Blues");
    expect(await likeCountInDb(sid)).toBe(0);

    // Drop the socket, then like → must QUEUE (not reach the server).
    ws.goOffline();
    await page.getByLabel(/like this track/i).click({ force: true });
    await expect.poll(() => pendingIdbCount(page, sid), { timeout: 10000 }).toBe(1);
    expect(await likeCountInDb(sid)).toBe(0);

    // Reconnect → ACK-gated flush drains the queue.
    ws.goOnline();
    await expect.poll(() => likeCountInDb(sid), { timeout: 25000 }).toBe(1);
    await expect.poll(() => pendingIdbCount(page, sid), { timeout: 10000 }).toBe(0);

    // Still exactly one — the flush did not duplicate.
    await page.waitForTimeout(1000);
    expect(await likeCountInDb(sid)).toBe(1);
  });

  test("dropped ACK keeps the queue; next reconnect re-flushes → still ONE row", async ({
    page,
  }) => {
    const ws = await installWsControl(page);
    dj = await createDjSession({
      djName: "W1 Resilient DJ",
      track: { title: "Lost ACK Lament", artist: "The Retransmits", bpm: 88 },
    });
    const sid = dj.getSessionId();

    await tuneIn(page, sid, "Lost ACK Lament");

    // Queue a like while offline.
    ws.goOffline();
    await page.getByLabel(/like this track/i).click({ force: true });
    await expect.poll(() => pendingIdbCount(page, sid), { timeout: 10000 }).toBe(1);

    // Reconnect but DROP the flush ACK → server persists, client keeps the queue.
    ws.armAckDrop();
    ws.goOnline();

    // Server got it (one row) ...
    await expect.poll(() => likeCountInDb(sid), { timeout: 25000 }).toBe(1);
    // ... but with the ACK dropped, the queue is NOT cleared (this is the fix).
    await page.waitForTimeout(7000); // > TIMEOUTS.ACK_TIMEOUT (5s)
    expect(await pendingIdbCount(page, sid)).toBe(1);
    expect(await likeCountInDb(sid)).toBe(1);

    // Force another reconnect → re-flush, this time the ACK gets through.
    ws.goOffline();
    await page.waitForTimeout(500);
    ws.goOnline();

    // Idempotent: still exactly one row, and now the queue clears.
    await expect.poll(() => pendingIdbCount(page, sid), { timeout: 25000 }).toBe(0);
    expect(await likeCountInDb(sid)).toBe(1);
  });
});
