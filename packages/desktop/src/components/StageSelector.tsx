import { Layers, Link2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createEvent,
  createStage,
  type EventRow,
  fetchDjEvents,
  fetchEventStages,
  fetchStageById,
  type StageRow,
} from "../services/stageApi";

type Mode = "pick" | "create" | "join";
export type StageChoice = { id: string; name: string };

/**
 * Stage chooser for the Go-Live modal. Collapsed by default (standalone), so the
 * solo-DJ flow is unchanged. Expanded, it offers three ways to broadcast to a
 * persistent stage (dancers stay connected across DJ rotation):
 *   - Pick:   choose one of the DJ's owned event → stages.
 *   - Create: spin up an Event + Stage (DJ-as-organizer).
 *   - Join:   paste a stage code (its id) to broadcast onto a stage you don't own
 *             (guest-DJ / cross-owner rotation), validated via GET /api/stages/:id.
 * Emits the chosen { id, name } (or undefined for standalone) so the live HUD/QR
 * can show the stage.
 */
export function StageSelector({
  onChange,
}: {
  onChange: (stage: StageChoice | undefined) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>("pick");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [eventId, setEventId] = useState("");
  const [chosen, setChosen] = useState<StageChoice | null>(null);

  // create-mode state ("" createEventId = new event)
  const [createEventId, setCreateEventId] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newStageName, setNewStageName] = useState("");
  // join-mode state
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load the DJ's events once expanded.
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    fetchDjEvents().then((rows) => {
      if (!cancelled) setEvents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [expanded]);

  // Load stages for the picked event (pick mode).
  useEffect(() => {
    if (!eventId) {
      setStages([]);
      return;
    }
    let cancelled = false;
    fetchEventStages(eventId).then((rows) => {
      if (!cancelled) setStages(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function choose(stage: StageChoice | undefined) {
    setChosen(stage ?? null);
    setErr(null);
    onChange(stage);
  }

  async function handleCreate() {
    const stageName = newStageName.trim();
    if (!stageName) return;
    setBusy(true);
    setErr(null);
    try {
      let evId = createEventId;
      if (!evId) {
        const ev = await createEvent(newEventName.trim() || stageName);
        if (!ev) {
          setErr("Couldn't create the event (are you signed in?)");
          return;
        }
        evId = ev.id;
        setEvents((prev) => [...prev, ev]);
      }
      const st = await createStage(stageName, evId);
      if (!st) {
        setErr("Couldn't create the stage");
        return;
      }
      choose(st);
      setMode("pick");
      setNewEventName("");
      setNewStageName("");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    setErr(null);
    try {
      const st = await fetchStageById(code);
      if (!st) {
        setErr("No stage found for that code");
        return;
      }
      choose(st);
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full bg-slate-950 border border-slate-700 rounded-2xl px-5 py-3 text-white placeholder:text-slate-600 outline-none focus:border-pika-accent transition-all font-bold text-sm";
  const tabClass = (active: boolean) =>
    `flex-1 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
      active ? "bg-pika-accent text-white" : "bg-slate-800 text-slate-400 hover:text-white"
    }`;

  // Collapsed: a single unobtrusive line (standalone by default).
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 text-[11px] font-bold text-slate-400 hover:text-white transition-colors"
      >
        <Layers size={13} />
        {chosen ? `Stage: ${chosen.name}` : "Broadcast to a stage (optional)"}
        <span className="text-slate-600">▾</span>
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <Layers size={12} /> Broadcast to a Stage
        </label>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-wider"
        >
          ▴ Collapse
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2">
        <button type="button" className={tabClass(mode === "pick")} onClick={() => setMode("pick")}>
          Pick
        </button>
        <button
          type="button"
          className={tabClass(mode === "create")}
          onClick={() => setMode("create")}
        >
          <Plus size={11} className="inline -mt-0.5 mr-1" />
          Create
        </button>
        <button type="button" className={tabClass(mode === "join")} onClick={() => setMode("join")}>
          <Link2 size={11} className="inline -mt-0.5 mr-1" />
          Join code
        </button>
      </div>

      {mode === "pick" && (
        <div className="space-y-2">
          <select
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              choose(undefined);
            }}
            className={fieldClass}
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
              value={chosen?.id ?? ""}
              onChange={(e) => {
                const st = stages.find((s) => s.id === e.target.value);
                choose(st ? { id: st.id, name: st.name } : undefined);
              }}
              className={fieldClass}
            >
              <option value="">Select a stage…</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {events.length === 0 && (
            <p className="text-[11px] text-slate-500">
              No events yet — use <strong>Create</strong> to make one, or <strong>Join code</strong>{" "}
              to broadcast onto an existing stage.
            </p>
          )}
        </div>
      )}

      {mode === "create" && (
        <div className="space-y-2">
          <select
            value={createEventId}
            onChange={(e) => setCreateEventId(e.target.value)}
            className={fieldClass}
          >
            <option value="">＋ New event…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
          {!createEventId && (
            <input
              type="text"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="Event name (e.g. WCS Budapest 2026)"
              className={fieldClass}
            />
          )}
          <input
            type="text"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="Stage name (e.g. Main Floor)"
            className={fieldClass}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !newStageName.trim()}
            className="w-full px-4 py-3 bg-pika-accent hover:bg-pika-accent-light disabled:opacity-40 text-white font-black rounded-2xl transition-all uppercase text-xs tracking-widest"
          >
            {busy ? "Creating…" : "Create & select"}
          </button>
        </div>
      )}

      {mode === "join" && (
        <div className="space-y-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Stage code (e.g. main-floor-849553a3)"
            className={fieldClass}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin();
            }}
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={busy || !joinCode.trim()}
            className="w-full px-4 py-3 bg-pika-accent hover:bg-pika-accent-light disabled:opacity-40 text-white font-black rounded-2xl transition-all uppercase text-xs tracking-widest"
          >
            {busy ? "Checking…" : "Join stage"}
          </button>
          <p className="text-[11px] text-slate-500">
            Ask the organizer for the stage code (the id in its share link). Lets you broadcast onto
            a floor you didn't create.
          </p>
        </div>
      )}

      {err && <p className="text-[11px] font-bold text-red-400">{err}</p>}
      {chosen && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
          <span className="text-[11px] font-bold text-emerald-400">
            🎭 Broadcasting to: {chosen.name}
          </span>
          <button
            type="button"
            onClick={() => choose(undefined)}
            className="text-[10px] font-bold text-slate-400 hover:text-white uppercase"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
