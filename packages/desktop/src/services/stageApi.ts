/**
 * Stage/Event read helpers for the Go-Live picker.
 *
 * Thin wrappers over the authenticated apiClient. Every call is best-effort:
 * any failure (offline, unauthenticated, server error) resolves to an empty
 * list so the DJ simply falls back to a standalone (stage-less) session.
 *
 * @file packages/desktop/src/services/stageApi.ts
 */

import { getConfiguredUrls } from "../hooks/useDjSettings";
import { logger } from "../utils/logger";
import { apiFetch } from "./apiClient";

export interface EventRow {
  id: string;
  name: string;
}
export interface StageRow {
  id: string;
  name: string;
}

/** The authenticated DJ's events (owner-scoped). `[]` on any failure. */
export async function fetchDjEvents(): Promise<EventRow[]> {
  try {
    const { apiUrl } = getConfiguredUrls();
    const res = await apiFetch(`${apiUrl}/api/events`);
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: EventRow[] };
    return data.events ?? [];
  } catch (e) {
    logger.debug("Stage", "Could not load events (broadcasting standalone)", e);
    return [];
  }
}

/** Stages under an event. `[]` on any failure. */
export async function fetchEventStages(eventId: string): Promise<StageRow[]> {
  try {
    const { apiUrl } = getConfiguredUrls();
    const res = await apiFetch(`${apiUrl}/api/events/${eventId}/stages`);
    if (!res.ok) return [];
    const data = (await res.json()) as { stages?: StageRow[] };
    return data.stages ?? [];
  } catch (e) {
    logger.debug("Stage", "Could not load stages", e);
    return [];
  }
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Create an Event owned by the authenticated DJ. `null` on any failure. */
export async function createEvent(name: string): Promise<EventRow | null> {
  try {
    const { apiUrl } = getConfiguredUrls();
    const res = await apiFetch(`${apiUrl}/api/events`, jsonPost({ name }));
    if (!res.ok) return null;
    const ev = (await res.json()) as EventRow;
    return ev.id ? { id: ev.id, name: ev.name } : null;
  } catch (e) {
    logger.debug("Stage", "Failed to create event", e);
    return null;
  }
}

/** Create a Stage under an event. `null` on any failure. */
export async function createStage(name: string, eventId: string): Promise<StageRow | null> {
  try {
    const { apiUrl } = getConfiguredUrls();
    const res = await apiFetch(`${apiUrl}/api/stages`, jsonPost({ name, eventId }));
    if (!res.ok) return null;
    const st = (await res.json()) as StageRow;
    return st.id ? { id: st.id, name: st.name } : null;
  } catch (e) {
    logger.debug("Stage", "Failed to create stage", e);
    return null;
  }
}

/**
 * Resolve a stage by its id (the "join code") via the public read endpoint.
 * `null` if it doesn't exist / on any failure. Lets a guest DJ broadcast to a
 * stage they don't own (cross-owner rotation).
 */
export async function fetchStageById(stageId: string): Promise<StageRow | null> {
  try {
    const { apiUrl } = getConfiguredUrls();
    const res = await apiFetch(`${apiUrl}/api/stages/${encodeURIComponent(stageId)}`);
    if (!res.ok) return null;
    const st = (await res.json()) as StageRow;
    return st.id ? { id: st.id, name: st.name } : null;
  } catch (e) {
    logger.debug("Stage", "Failed to resolve stage by id", e);
    return null;
  }
}
