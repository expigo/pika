/**
 * Displays Spotify's canonical audio-features for a track, BESIDE the Pika sidecar radar (never
 * merged — different source + scale). Degrades: not matched to Spotify → hint; matched but absent
 * from the seeded catalog → "no features yet".
 */

import { getCamelotKey, type SpotifyAudioFeatures } from "@pika/shared";

const PITCH = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
// Sharp spelling that getCamelotKey()'s KEY_TO_CAMELOT map understands.
const CAMELOT_NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function keyName(keyPitch?: number, mode?: number): string | null {
  if (keyPitch == null || keyPitch < 0) return null;
  return `${PITCH[keyPitch] ?? keyPitch}${mode === 0 ? "m" : ""}`;
}
function camelotOf(keyPitch?: number, mode?: number): string | null {
  if (keyPitch == null || keyPitch < 0) return null;
  const note = CAMELOT_NOTE[keyPitch];
  return note ? getCamelotKey(`${note}${mode === 0 ? "m" : ""}`) : null;
}
const f2 = (v?: number) => (v == null ? "—" : v.toFixed(2));

interface Props {
  features: SpotifyAudioFeatures | null;
  loading: boolean;
  hasMatch: boolean;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-900/40 border border-emerald-500/15 p-3">
      <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
        Spotify
      </div>
      {children}
    </div>
  );
}

export function SpotifyFeaturePanel({ features, loading, hasMatch }: Props) {
  if (!hasMatch) {
    return (
      <Shell>
        <p className="text-xs text-slate-500">
          Not matched to Spotify — match it in{" "}
          <span className="text-slate-300">Build Playlist</span> to see Spotify's features.
        </p>
      </Shell>
    );
  }
  if (loading && !features) {
    return (
      <Shell>
        <p className="text-xs text-slate-500">Loading Spotify features…</p>
      </Shell>
    );
  }
  if (!features) {
    return (
      <Shell>
        <p className="text-xs text-slate-500">
          No Spotify features for this track yet (not in the catalog).
        </p>
      </Shell>
    );
  }

  const key = keyName(features.keyPitch, features.mode);
  const camelot = camelotOf(features.keyPitch, features.mode);
  const rows: Array<[string, string]> = [
    ["Tempo", features.tempo == null ? "—" : `${Math.round(features.tempo)} BPM`],
    ["Key", key ? (camelot ? `${key} · ${camelot}` : key) : "—"],
    ["Energy", f2(features.energy)],
    ["Danceability", f2(features.danceability)],
    ["Valence", f2(features.valence)],
    ["Acousticness", f2(features.acousticness)],
    ["Instrumentalness", f2(features.instrumentalness)],
    ["Liveness", f2(features.liveness)],
    ["Speechiness", f2(features.speechiness)],
    ["Loudness", features.loudness == null ? "—" : `${f2(features.loudness)} dB`],
    ["Time sig", features.timeSignature == null ? "—" : `${features.timeSignature}/4`],
    ["Popularity", features.popularity == null ? "—" : String(features.popularity)],
  ];

  return (
    <Shell>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-slate-500">{k}</span>
            <span className="font-semibold text-slate-200">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-600">
        Spotify's own scale (0–1 ratios, BPM, dB) — shown next to Pika's 0–100 analysis, not merged.
      </p>
    </Shell>
  );
}

export default SpotifyFeaturePanel;
