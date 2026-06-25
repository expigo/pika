import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/apiClient";
import { getConfiguredUrls } from "../services/settingsService";
import { logger } from "../utils/logger";

interface EventRow {
  id: string;
  name: string;
}
interface StageRow {
  id: string;
  name: string;
}

/**
 * Optional Stage picker for the Go-Live modal. Fetches the DJ's events
 * (GET /api/events) and the chosen event's stages (GET /api/events/:id/stages)
 * via the authenticated apiClient. Broadcasting to a stage lets dancers stay
 * connected across DJ rotation. Renders nothing if the DJ has no events, so the
 * solo-DJ flow is unchanged.
 */
export function StageSelector({ onChange }: { onChange: (stageId: string | undefined) => void }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [eventId, setEventId] = useState("");
  const [stageId, setStageId] = useState("");
  const [loading, setLoading] = useState(true);

  // Load the DJ's events once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { apiUrl } = getConfiguredUrls();
        const res = await apiFetch(`${apiUrl}/api/events`);
        const data = res.ok ? ((await res.json()) as { events?: EventRow[] }) : { events: [] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch (e) {
        logger.debug("Stage", "Could not load events (broadcasting standalone)", e);
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load stages whenever the selected event changes.
  useEffect(() => {
    if (!eventId) {
      setStages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { apiUrl } = getConfiguredUrls();
        const res = await apiFetch(`${apiUrl}/api/events/${eventId}/stages`);
        const data = res.ok ? ((await res.json()) as { stages?: StageRow[] }) : { stages: [] };
        if (!cancelled) setStages(data.stages ?? []);
      } catch {
        if (!cancelled) setStages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Keep the modal clean for DJs who don't use stages.
  if (loading || events.length === 0) return null;

  const selectClass =
    "w-full bg-slate-950 border border-slate-700 rounded-2xl px-5 py-3 text-white outline-none focus:border-pika-accent transition-all font-bold text-sm cursor-pointer";

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
        <Layers size={12} /> Broadcast to a Stage (optional)
      </label>
      <select
        value={eventId}
        onChange={(e) => {
          setEventId(e.target.value);
          setStageId("");
          onChange(undefined); // changing event clears the stage selection
        }}
        className={selectClass}
      >
        <option value="">Standalone — no stage</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.name}
          </option>
        ))}
      </select>
      {eventId && (
        <select
          value={stageId}
          onChange={(e) => {
            setStageId(e.target.value);
            onChange(e.target.value || undefined);
          }}
          className={selectClass}
        >
          <option value="">Select a stage…</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
