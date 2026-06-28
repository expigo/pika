"use client";

/**
 * Web-DJ engagement controls (Track D, B2).
 *
 * The SEND side of the desktop DJ's live-interaction tools, for the Spotify-only web DJ:
 * broadcast announcements + run floor polls. All mutations go through the parent's `run`
 * wrapper (busy-gating + status refresh + error surfacing). The live results / announcement
 * banner still render in the embedded <LivePlayer> (its own listener) — here we only show the
 * DJ-side readout (active poll tallies + aggregated tempo) off the polled status.
 */

import { useState } from "react";
import { endPoll, type LiveStatus, sendAnnouncement, startPoll } from "@/lib/djLive";

/** Quick-start poll templates (mirrors the desktop PollPresets). */
const POLL_PRESETS: Array<{
  label: string;
  question: string;
  options: string[];
  duration: number;
}> = [
  {
    label: "Vibe Check",
    question: "How's the energy alongside this track?",
    options: ["Too Chill 😴", "Just Right 👌", "Need More Fire 🔥"],
    duration: 120,
  },
  {
    label: "Tempo Check",
    question: "Is this speed working for you?",
    options: ["Too Slow 🐢", "Perfect 👌", "Too Fast 🐇"],
    duration: 60,
  },
  {
    label: "Next Style",
    question: "What should I play next?",
    options: ["Lyrical 🎵", "Funky 🎸", "Acoustic 🎻", "Mainstream 📻"],
    duration: 120,
  },
];

const ANNOUNCEMENT_MAX = 200;
const ANNOUNCEMENT_DURATIONS = [
  { label: "No timer", value: 0 },
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
  { label: "15 min", value: 900 },
];
const POLL_DURATIONS = [60, 120, 300];

const card = "w-full max-w-lg rounded-2xl bg-slate-900 p-5";
const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none";
const sectionLabel = "mb-3 text-xs font-medium uppercase tracking-wide text-slate-500";

interface Props {
  status: LiveStatus;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}

export function DjLiveControls({ status, busy, run }: Props) {
  return (
    <>
      <AnnouncementComposer busy={busy} run={run} />
      <PollControl status={status} busy={busy} run={run} />
      <TempoReadout tempo={status.tempo} />
    </>
  );
}

function AnnouncementComposer({ busy, run }: Omit<Props, "status">) {
  const [message, setMessage] = useState("");
  const [duration, setDuration] = useState(0);
  const [push, setPush] = useState(false);
  const trimmed = message.trim();

  const send = async () => {
    if (!trimmed) return;
    await run(() => sendAnnouncement(trimmed, duration || undefined, push));
    setMessage("");
  };

  return (
    <section className={card} aria-label="Announcement">
      <p className={sectionLabel}>Announcement</p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, ANNOUNCEMENT_MAX))}
        rows={2}
        placeholder="Last song! • Birthday jam for Sam • Switch partners"
        className={`${inputCls} resize-none`}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>
          {message.length}/{ANNOUNCEMENT_MAX}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Timer
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            aria-label="Announcement timer"
          >
            {ANNOUNCEMENT_DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={push}
            onChange={(e) => setPush(e.target.checked)}
            className="h-4 w-4 accent-purple-600"
          />
          Push to phones
        </label>
        <button
          type="button"
          disabled={busy || !trimmed}
          onClick={send}
          className="ml-auto rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </section>
  );
}

function PollControl({ status, busy, run }: Props) {
  const active = status.activePoll;
  if (active) {
    const leader = active.totalVotes > 0 ? Math.max(...active.votes) : -1;
    return (
      <section className={card} aria-label="Active poll">
        <p className={sectionLabel}>Live poll · {active.totalVotes} votes</p>
        <p className="mb-3 text-sm font-medium text-slate-100">{active.question}</p>
        <ul className="space-y-2">
          {active.options.map((opt, i) => {
            const n = active.votes[i] ?? 0;
            const pct = active.totalVotes > 0 ? Math.round((n / active.totalVotes) * 100) : 0;
            return (
              <li key={`${opt}-${i}`} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span
                    className={n === leader && leader > 0 ? "font-semibold text-purple-300" : ""}
                  >
                    {opt}
                  </span>
                  <span className="text-slate-400">
                    {n} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800">
                  <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(endPoll)}
          className="mt-4 w-full rounded-full bg-red-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          End Poll
        </button>
      </section>
    );
  }
  return <PollBuilder busy={busy} run={run} />;
}

function PollBuilder({ busy, run }: Omit<Props, "status">) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [duration, setDuration] = useState(120);

  const applyPreset = (p: (typeof POLL_PRESETS)[number]) => {
    setQuestion(p.question);
    setOptions(p.options);
    setDuration(p.duration);
  };

  const setOption = (i: number, v: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  const addOption = () => setOptions((prev) => (prev.length < 10 ? [...prev, ""] : prev));
  const removeOption = (i: number) =>
    setOptions((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));

  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const canStart = question.trim().length > 0 && cleanOptions.length >= 2;

  const start = async () => {
    if (!canStart) return;
    await run(() =>
      startPoll({ question: question.trim(), options: cleanOptions, durationSeconds: duration }),
    );
    setQuestion("");
    setOptions(["", ""]);
    setDuration(120);
  };

  return (
    <section className={card} aria-label="Poll builder">
      <p className={sectionLabel}>New poll</p>

      <div className="mb-3 flex flex-wrap gap-2">
        {POLL_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-purple-500"
          >
            {p.label}
          </button>
        ))}
      </div>

      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Poll question"
        aria-label="Poll question"
        className={`${inputCls} mb-3`}
      />

      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={`opt-${i}`} className="flex items-center gap-2">
            <input
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
              className={inputCls}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                aria-label={`Remove option ${i + 1}`}
                className="rounded-md border border-slate-700 px-2 py-1 text-sm text-slate-400"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {options.length < 10 && (
          <button
            type="button"
            onClick={addOption}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300"
          >
            + Add option
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Duration
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            aria-label="Poll duration"
          >
            {POLL_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d}s` : `${d / 60} min`}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !canStart}
          onClick={start}
          className="ml-auto rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Start Poll
        </button>
      </div>
    </section>
  );
}

function TempoReadout({ tempo }: { tempo: LiveStatus["tempo"] }) {
  if (!tempo) return null;
  const items = [
    { label: "Slower", value: tempo.slower, cls: "text-sky-300" },
    { label: "Perfect", value: tempo.perfect, cls: "text-emerald-300" },
    { label: "Faster", value: tempo.faster, cls: "text-amber-300" },
  ];
  return (
    <section className={card} aria-label="Tempo feedback">
      <p className={sectionLabel}>Tempo feedback · {tempo.total} votes</p>
      <div className="flex gap-3">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-center"
          >
            <div className={`text-lg font-semibold ${it.cls}`}>{it.value}</div>
            <div className="text-xs text-slate-500">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
