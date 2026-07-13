/**
 * Events/Stages provisioning, WS stage subscribe, scoped push targets.
 * Moved verbatim from src/__tests__/db.integration.test.ts L684-944 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { handleSubscribeStage } from "../../handlers/subscriber";
import type { WSContext } from "../../handlers/ws-context";
import {
  getAllActivePushTargets,
  getEventPushTargets,
  getStagePushTargets,
} from "../../lib/persistence/push-targets";
import { persistSession } from "../../lib/persistence/sessions";
import { getStageTopic } from "../../lib/topics";
import { stageRoutes } from "../../routes/stages";
import { ensureBaseSession, setupIntegrationEnv, signUpDj, suite, uniq } from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
  });

  // ==========================================================================
  // 4. Stages / Events + SCOPED push (the "Global Megaphone" fix)
  // ==========================================================================

  describe("stages / events + scoped push (real Postgres)", () => {
    const createdEventIds: string[] = [];
    const createdEndpoints: string[] = [];
    const djUserIds: string[] = [];

    afterAll(async () => {
      for (const id of createdEventIds) {
        // CASCADE clears the event's stages + stage_subscriptions.
        await db.delete(schema.events).where(eq(schema.events.id, id));
      }
      for (const ep of createdEndpoints) {
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, ep));
      }
      for (const id of djUserIds) {
        await db.delete(schema.user).where(eq(schema.user.id, id));
      }
    });

    // An approved DJ + a Better Auth bearer token (the stage routes are requireDjAuth-gated).
    async function newDjToken(): Promise<string> {
      const { userId, token } = await signUpDj({ approved: true });
      djUserIds.push(userId);
      return token;
    }

    test("route: create event + stage (auth'd), then public reads resolve them", async () => {
      const token = await newDjToken();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      const evRes = await stageRoutes.request("/events", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "WCS Test 2026" }),
      });
      expect(evRes.status).toBe(201);
      const ev = (await evRes.json()) as { id: string; ownerUserId: string };
      createdEventIds.push(ev.id);
      expect(typeof ev.ownerUserId).toBe("string"); // owner derived from token, not the body
      expect(ev.ownerUserId.length).toBeGreaterThan(0);

      const stRes = await stageRoutes.request("/stages", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Main Floor", eventId: ev.id }),
      });
      expect(stRes.status).toBe(201);
      const st = (await stRes.json()) as { id: string };

      const getRes = await stageRoutes.request(`/stages/${st.id}`);
      expect(getRes.status).toBe(200);
      // Public read is enriched with the parent event name (for the dancer's "Stage · Event" badge).
      const stageRead = (await getRes.json()) as { name: string; eventName: string | null };
      expect(stageRead.name).toBe("Main Floor");
      expect(stageRead.eventName).toBe("WCS Test 2026");

      const listRes = await stageRoutes.request(`/events/${ev.id}/stages`);
      const list = (await listRes.json()) as { stages: Array<{ id: string }> };
      expect(list.stages.some((s) => s.id === st.id)).toBe(true);
    });

    test("route: stage under an unknown parent event → 400", async () => {
      const token = await newDjToken();
      const bad = await stageRoutes.request("/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "Orphan", eventId: `nope_${uniq()}` }),
      });
      expect(bad.status).toBe(400);
    });

    test("GET /api/events lists the DJ's events; unauthenticated → 401", async () => {
      const token = await newDjToken();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const created = (await (
        await stageRoutes.request("/events", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: "Owned Event" }),
        })
      ).json()) as { id: string };
      createdEventIds.push(created.id);

      const list = await stageRoutes.request("/events", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(list.status).toBe(200);
      const body = (await list.json()) as { events: Array<{ id: string }> };
      expect(body.events.some((e) => e.id === created.id)).toBe(true);

      const noauth = await stageRoutes.request("/events");
      expect(noauth.status).toBe(401);
    });

    test("FK set null: deleting a stage nulls sessions.stage_id but keeps the session", async () => {
      const evId = `ev_${uniq()}`;
      const stId = `st_${uniq()}`;
      const sid = `sess_${uniq()}`;
      await db.insert(schema.events).values({ id: evId, name: "E" });
      createdEventIds.push(evId);
      await db.insert(schema.stages).values({ id: stId, name: "S", eventId: evId });
      await db.insert(schema.sessions).values({ id: sid, djName: "D", stageId: stId });

      await db.delete(schema.stages).where(eq(schema.stages.id, stId));

      const [sess] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sid));
      expect(sess).toBeDefined();
      expect(sess?.stageId).toBeNull();
      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
    });

    test("FK cascade: deleting an event removes its stages and stage_subscriptions", async () => {
      const evId = `evc_${uniq()}`;
      const stId = `stc_${uniq()}`;
      await db.insert(schema.events).values({ id: evId, name: "E" });
      await db.insert(schema.stages).values({ id: stId, name: "S", eventId: evId });
      await db.insert(schema.stageSubscriptions).values({ stageId: stId, clientId: "casc-client" });

      await db.delete(schema.events).where(eq(schema.events.id, evId));

      const remStages = await db.select().from(schema.stages).where(eq(schema.stages.id, stId));
      const remSubs = await db
        .select()
        .from(schema.stageSubscriptions)
        .where(eq(schema.stageSubscriptions.stageId, stId));
      expect(remStages.length).toBe(0);
      expect(remSubs.length).toBe(0);
    });

    test("SCOPED push isolates by stage/event; global still reaches everyone", async () => {
      const evId = `evp_${uniq()}`;
      const s1 = `s1_${uniq()}`;
      const s2 = `s2_${uniq()}`;
      const cA = `cA_${uniq()}`;
      const cB = `cB_${uniq()}`;
      const cC = `cC_${uniq()}`;
      const epA = `https://push.test/${cA}`;
      const epB = `https://push.test/${cB}`;
      const epC = `https://push.test/${cC}`;

      await db.insert(schema.events).values({ id: evId, name: "Push Event" });
      createdEventIds.push(evId);
      await db.insert(schema.stages).values([
        { id: s1, name: "S1", eventId: evId },
        { id: s2, name: "S2", eventId: evId },
      ]);
      // A is at stage 1, B at stage 2, C is subscribed to NO stage.
      await db.insert(schema.stageSubscriptions).values([
        { stageId: s1, clientId: cA },
        { stageId: s2, clientId: cB },
      ]);
      await db.insert(schema.pushSubscriptions).values([
        { endpoint: epA, p256dh: "p", auth: "a", clientId: cA },
        { endpoint: epB, p256dh: "p", auth: "a", clientId: cB },
        { endpoint: epC, p256dh: "p", auth: "a", clientId: cC },
      ]);
      createdEndpoints.push(epA, epB, epC);

      // Stage scope → only that stage's client.
      const stage1 = await getStagePushTargets(s1);
      expect(stage1.map((t) => t.endpoint)).toEqual([epA]);

      // Event scope → every stage under the event (A + B), but not the stage-less C.
      const eventTargets = await getEventPushTargets(evId);
      expect(eventTargets.map((t) => t.endpoint).sort()).toEqual([epA, epB].sort());

      // Global → reaches everyone incl. the stage-less C (the legacy fallback).
      const allEps = new Set((await getAllActivePushTargets()).map((t) => t.endpoint));
      expect(allEps.has(epA) && allEps.has(epB) && allEps.has(epC)).toBe(true);
    });

    // --- real-DB handler paths (the unit suite runs these in NODE_ENV=test) ----

    async function waitFor(check: () => Promise<boolean>, ms = 1500): Promise<boolean> {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (await check()) return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    }

    function mkStageCtx(stageId: string, clientId: string, messageId?: string) {
      const sent: Array<Record<string, unknown>> = [];
      const subscribed: string[] = [];
      const rawWs = {
        subscribe: (t: string) => subscribed.push(t),
        unsubscribe: () => {},
        publish: () => {},
        getBufferedAmount: () => 0,
      } as unknown as ServerWebSocket;
      const ctx = {
        message: { type: "SUBSCRIBE_STAGE", stageId, clientId },
        ws: { send: (d: string) => sent.push(JSON.parse(d)), close: () => {} },
        rawWs,
        state: {
          clientId,
          isListener: false,
          subscribedSessionId: null,
          subscribedStageId: null,
          djSessionId: null,
        },
        messageId,
      } as unknown as WSContext;
      return { ctx, sent, subscribed };
    }

    test("persistSession records stage_id; handleSubscribeStage arms scoped push", async () => {
      const evId = `evh_${uniq()}`;
      const stId = `sth_${uniq()}`;
      const sid = `sessh_${uniq()}`;
      const clientId = `ch_${uniq()}`;
      const ep = `https://push.test/${clientId}`;
      await db.insert(schema.events).values({ id: evId, name: "Evt" });
      createdEventIds.push(evId);
      await db.insert(schema.stages).values({ id: stId, name: "St", eventId: evId });
      await db
        .insert(schema.pushSubscriptions)
        .values({ endpoint: ep, p256dh: "p", auth: "a", clientId });
      createdEndpoints.push(ep);

      // persistSession writes the stage_id column.
      await persistSession(sid, "DJ H", null, stId);
      const [sess] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sid));
      expect(sess?.stageId).toBe(stId);
      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));

      // handleSubscribeStage validates the stage + writes the durable membership row.
      const { ctx, subscribed } = mkStageCtx(stId, clientId);
      await handleSubscribeStage(ctx);
      expect(subscribed).toContain(getStageTopic(stId));

      // Membership write is fire-and-forget → poll, then confirm scoped push reaches us.
      const armed = await waitFor(async () => {
        const rows = await db
          .select()
          .from(schema.stageSubscriptions)
          .where(
            and(
              eq(schema.stageSubscriptions.stageId, stId),
              eq(schema.stageSubscriptions.clientId, clientId),
            ),
          );
        return rows.length === 1;
      });
      expect(armed).toBe(true);
      const targets = await getStagePushTargets(stId);
      expect(targets.map((t) => t.endpoint)).toContain(ep);
    });

    test("handleSubscribeStage NACKs an unknown stage and does not subscribe", async () => {
      const { ctx, sent, subscribed } = mkStageCtx(`ghost_${uniq()}`, `cg_${uniq()}`, "mid-ghost");
      await handleSubscribeStage(ctx);
      expect(subscribed).toHaveLength(0);
      expect(sent.some((m) => m.type === "NACK")).toBe(true);
    });
  });
});
