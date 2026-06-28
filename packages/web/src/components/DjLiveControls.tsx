"use client";

/**
 * Web-DJ engagement controls (Track D, B2).
 *
 * The SEND side of the desktop DJ's live-interaction tools, for the Spotify-only web DJ:
 * broadcast announcements + run floor polls. One ProCard with an Announce/Poll segmented
 * switch keeps it compact. Live tallies (poll votes, tempo) come from the parent's polled
 * `status`; mutations go through the parent's `run` wrapper (busy-gating + refresh + errors).
 */

import { BarChart3, Megaphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  cancelAnnouncement,
  endPoll,
  type LiveStatus,
  sendAnnouncement,
  startPoll,
} from "@/lib/djLive";
import { ProCard } from "./ui/ProCard";

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

const input =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none";
const select = "rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm";
const primaryBtn =
  "rounded-full bg-purple-600 px-5 py-2 text-sm font-bold uppercase tracking-wide hover:bg-purple-500 disabled:opacity-40";

interface Props {
  status: LiveStatus;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}

type Tab = "announce" | "poll";

export function DjLiveControls({ status, busy, run }: Props) {
  const [tab, setTab] = useState<Tab>("announce");

  // When a poll goes live, jump to the Poll tab so the DJ sees the results + End control.
  const activePollId = status.activePoll?.pollId;
  useEffect(() => {
    if (activePollId) setTab("poll");
  }, [activePollId]);

  return (
    <ProCard glow className="w-full max-w-lg">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-800/20 px-4 py-3">
        <TabButton active={tab === "announce"} onClick={() => setTab("announce")} icon={Megaphone}>
          Announce
        </TabButton>
        <TabButton active={tab === "poll"} onClick={() => setTab("poll")} icon={BarChart3}>
          Poll
        </TabButton>
        {status.activePoll && tab !== "poll" && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-purple-400">
            Poll live
          </span>
        )}
      </div>

      <div className="p-4">
        {tab === "announce" ? (
          <AnnouncementComposer
            activeAnnouncement={status.activeAnnouncement ?? null}
            busy={busy}
            run={run}
          />
        ) : (
          <PollControl status={status} busy={busy} run={run} />
        )}
      </div>

      <TempoStrip tempo={status.tempo} />
    </ProCard>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Megaphone;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
        active
          ? "bg-purple-600/20 text-purple-200 ring-1 ring-purple-500/50"
          : "text-slate-500 hover:text-slate-300"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function AnnouncementComposer({
  activeAnnouncement,
  busy,
  run,
}: {
  activeAnnouncement: LiveStatus["activeAnnouncement"];
  busy: boolean;
  run: Props["run"];
}) {
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
    <div className="space-y-3">
      {activeAnnouncement && (
        <div className="flex items-start gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
          <p className="flex-1 text-sm text-purple-100">{activeAnnouncement.message}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(cancelAnnouncement)}
            className="flex items-center gap-1 rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:border-red-500 hover:text-red-300 disabled:opacity-40"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>
      )}

      <div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, ANNOUNCEMENT_MAX))}
          rows={2}
          placeholder="Last song! • Birthday jam for Sam • Switch partners"
          className={`${input} resize-none`}
        />
        <div className="mt-1 text-right text-[11px] text-slate-600">
          {message.length}/{ANNOUNCEMENT_MAX}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className={select}
          aria-label="Announcement timer"
        >
          {ANNOUNCEMENT_DURATIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={push}
            onChange={(e) => setPush(e.target.checked)}
            className="h-4 w-4 accent-purple-600"
          />
          Push
        </label>
        <button
          type="button"
          disabled={busy || !trimmed}
          onClick={send}
          className={`ml-auto ${primaryBtn}`}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function PollControl({ status, busy, run }: Props) {
  const active = status.activePoll;
  if (!active) return <PollBuilder busy={busy} run={run} />;

  const leader = active.totalVotes > 0 ? Math.max(...active.votes) : -1;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">{active.question}</p>
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {active.totalVotes} {active.totalVotes === 1 ? "vote" : "votes"}
        </span>
      </div>
      <ul className="space-y-2">
        {active.options.map((opt, i) => {
          const n = active.votes[i] ?? 0;
          const pct = active.totalVotes > 0 ? Math.round((n / active.totalVotes) * 100) : 0;
          const winning = n === leader && leader > 0;
          return (
            <li key={`${opt}-${i}`}>
              <div className="mb-1 flex justify-between text-sm">
                <span className={winning ? "font-semibold text-purple-300" : "text-slate-300"}>
                  {opt}
                </span>
                <span className="text-slate-500">{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${winning ? "bg-purple-400" : "bg-purple-600/60"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={() => run(endPoll)}
        className="mt-4 w-full rounded-full bg-red-600/90 px-4 py-2 text-sm font-bold uppercase tracking-wide hover:bg-red-500 disabled:opacity-40"
      >
        End Poll
      </button>
    </div>
  );
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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {POLL_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:border-purple-500 hover:text-purple-200"
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
        className={input}
      />

      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={`opt-${i}`} className="flex items-center gap-2">
            <input
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
              className={input}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                aria-label={`Remove option ${i + 1}`}
                className="shrink-0 rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-500 hover:text-red-300"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {options.length < 10 && (
          <button
            type="button"
            onClick={addOption}
            className="text-xs font-medium text-purple-400 hover:text-purple-300"
          >
            + Add option
          </button>
        )}
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className={select}
          aria-label="Poll duration"
        >
          {POLL_DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d < 60 ? `${d}s` : `${d / 60} min`}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !canStart}
          onClick={start}
          className={`ml-auto ${primaryBtn}`}
        >
          Start Poll
        </button>
      </div>
    </div>
  );
}

function TempoStrip({ tempo }: { tempo: LiveStatus["tempo"] }) {
  if (!tempo || tempo.total === 0) return null;
  const items = [
    { label: "Slower", value: tempo.slower, cls: "text-sky-300" },
    { label: "Perfect", value: tempo.perfect, cls: "text-emerald-300" },
    { label: "Faster", value: tempo.faster, cls: "text-amber-300" },
  ];
  return (
    <div className="flex items-center gap-4 border-t border-slate-800 bg-slate-800/20 px-4 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tempo</span>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`font-bold ${it.cls}`}>{it.value}</span>
          {it.label}
        </span>
      ))}
    </div>
  );
}
