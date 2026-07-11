/**
 * One track row of the Build Spotify Playlist modal: current selection (with confidence /
 * remembered-lock / Spotify-features badge), the candidate picker, and the paste-a-link
 * fallback for tracks search can't find. Pure rendering — all state lives in useBuildPlaylist.
 */

import type { SpotifyAudioFeatures } from "@pika/shared";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronDown, Disc3, ExternalLink, Lock } from "lucide-react";
import { useState } from "react";
import type { Confidence, Row } from "../hooks/useBuildPlaylist";

function fmtDuration(ms: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    /* opener unavailable (e.g. tests) — ignore */
  }
}

const CONF_LABEL: Record<Confidence, { text: string; cls: string } | null> = {
  high: { text: "Strong match", cls: "text-emerald-400" },
  medium: { text: "Likely — verify", cls: "text-amber-400" },
  low: { text: "Uncertain — check", cls: "text-orange-400" },
  none: null,
};

function Art({ url }: { url?: string }) {
  if (!url) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-800">
        <Disc3 size={16} className="text-slate-600" />
      </div>
    );
  }
  return <img src={url} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />;
}

function PasteLink({ onPaste }: { onPaste: (v: string) => Promise<string | null> }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setErr(null);
    const e = await onPaste(value);
    setBusy(false);
    if (e) setErr(e);
    else setValue("");
  };
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="…or paste a Spotify track link"
          aria-label="Paste a Spotify track link"
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
        />
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={submit}
          className="shrink-0 rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 disabled:opacity-40"
        >
          {busy ? "…" : "Use link"}
        </button>
      </div>
      {err && <p className="mt-1 text-[11px] text-red-400/80">{err}</p>}
    </div>
  );
}

const PITCH = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
/** Compact "128 BPM · Cm · E 0.78" badge from Spotify features (omits missing parts). */
function spotifyFeatureBadge(f: SpotifyAudioFeatures): string | null {
  const parts: string[] = [];
  if (f.tempo != null) parts.push(`${Math.round(f.tempo)} BPM`);
  if (f.keyPitch != null && f.keyPitch >= 0)
    parts.push(`${PITCH[f.keyPitch] ?? f.keyPitch}${f.mode === 0 ? "m" : ""}`);
  if (f.energy != null) parts.push(`E ${f.energy.toFixed(2)}`);
  return parts.length ? parts.join(" · ") : null;
}

export function PlaylistRow({
  row,
  features,
  expanded,
  onToggle,
  onChoose,
  onRematch,
  onPaste,
}: {
  row: Row;
  features: SpotifyAudioFeatures | null;
  expanded: boolean;
  onToggle: () => void;
  onChoose: (value: number | null) => void;
  onRematch: () => void;
  onPaste: (value: string) => Promise<string | null>;
}) {
  const selected = row.selectedIndex !== null ? row.candidates[row.selectedIndex] : null;
  const conf = CONF_LABEL[row.confidence];
  const featBadge = features ? spotifyFeatureBadge(features) : null;

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-slate-100">{row.title}</span>
        <span className="truncate text-xs text-slate-500">{row.artist}</span>
        {row.durationMs ? (
          <span className="ml-auto shrink-0 text-[11px] text-slate-600">
            {fmtDuration(row.durationMs)}
          </span>
        ) : null}
      </div>

      {row.status === "searching" ? (
        <p className="text-xs text-slate-500">Searching Spotify…</p>
      ) : row.status === "unmatched" || row.status === "error" ? (
        <>
          <p
            className={`text-xs ${row.status === "error" ? "text-red-400/80" : "text-amber-400/80"}`}
          >
            {row.status === "error" ? "Search failed" : "No Spotify match"} — will be skipped unless
            you paste a link
          </p>
          <PasteLink onPaste={onPaste} />
        </>
      ) : (
        <>
          {/* Current selection */}
          <div className="flex items-center gap-3 rounded-lg bg-slate-900/60 p-2">
            {selected ? (
              <>
                <Art url={selected.albumArtUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {row.locked && (
                      <Lock
                        size={12}
                        className="shrink-0 text-emerald-400"
                        aria-label="Remembered"
                      />
                    )}
                    <span className="truncate text-sm text-slate-100">{selected.name}</span>
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {selected.artists} · {fmtDuration(selected.durationMs)}
                    {selected.popularity ? ` · ${selected.popularity}% popular` : ""}
                  </div>
                  {featBadge && (
                    <div
                      className="mt-0.5 text-[11px] text-emerald-400/80"
                      title="Spotify features"
                    >
                      {featBadge}
                    </div>
                  )}
                  {conf && !row.locked && (
                    <div className={`text-[11px] ${conf.cls}`}>{conf.text}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openExternal(selected.url)}
                  aria-label={`Open ${selected.name} on Spotify`}
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:text-[#1DB954]"
                  title="Verify on Spotify"
                >
                  <ExternalLink size={15} />
                </button>
              </>
            ) : (
              <span className="flex-1 text-sm text-slate-500">Skipped</span>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChoose(selected ? null : 0)}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                {selected ? "Skip" : "Use"}
              </button>
              {row.fromCache && row.candidates.length <= 1 ? (
                <button
                  type="button"
                  onClick={onRematch}
                  aria-label={`Re-match ${row.title}`}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:text-white"
                  title="Search Spotify again to see album art + alternatives"
                >
                  Re-match
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label={`Change match for ${row.title}`}
                  className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
                >
                  Change ({row.candidates.length})
                  <ChevronDown size={13} className={expanded ? "rotate-180" : ""} />
                </button>
              )}
            </div>
          </div>

          {/* Candidate picker */}
          {expanded && (
            <ul className="mt-2 space-y-1">
              <li>
                <button
                  type="button"
                  onClick={() => onChoose(null)}
                  className={`w-full rounded-lg p-2 text-left text-sm hover:bg-slate-800/60 ${
                    row.selectedIndex === null ? "bg-slate-800/60 text-slate-200" : "text-slate-500"
                  }`}
                >
                  ⊘ Skip this track
                </button>
              </li>
              {row.candidates.map((c, ci) => (
                <li key={c.spotifyId}>
                  <button
                    type="button"
                    onClick={() => onChoose(ci)}
                    aria-label={`Pick ${c.name} by ${c.artists}`}
                    className={`flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-800/60 ${
                      row.selectedIndex === ci ? "bg-slate-800/60" : ""
                    }`}
                  >
                    <Art url={c.albumArtUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-100">{c.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {c.artists} · {fmtDuration(c.durationMs)}
                        {c.popularity ? ` · ${c.popularity}% popular` : ""}
                      </div>
                    </div>
                    {row.selectedIndex === ci && (
                      <Check size={15} className="shrink-0 text-pika-accent" />
                    )}
                  </button>
                </li>
              ))}
              <li className="px-2 pb-1">
                <PasteLink onPaste={onPaste} />
              </li>
            </ul>
          )}
        </>
      )}
    </li>
  );
}
