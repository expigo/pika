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
