# Architecture: Audio Analysis Engine

This document describes the *current* implementation of the audio analysis system in the Pika! Desktop Client.

## 1. Overview

The audio analysis engine runs as a **Python Sidecar** (`packages/desktop/python-src`) bundled with the Tauri application. It uses `librosa` to extract musical features from audio files on the local filesystem.

**Location:** `packages/desktop/python-src/audio_processing.py`

## 2. Technical Stack

*   **Runtime:** Python 3 (bundled via PyInstaller)
*   **Library:** `librosa`
*   **Input:** Local audio files (MP3, FLAC, WAV, M4A)
*   **Output:** JSON object containing `AnalysisResult`
*   **Communication:** Tauri `Command` spawns Python process, reads `stdout`.

## 3. Implemented Metrics

The Python sidecar currently calculates the following metrics for every analyzed track:

### A. Core Metrics
| Metric | Type | Description |
| :--- | :--- | :--- |
| `bpm` | `float` | Beat Per Minute estimate (Start BPM seeded by VirtualDJ if available). |
| `energy` | `float` | RMS (Root Mean Square) energy, normalized to 0-100 scale. |
| `key` | `string` | Estimated musical key (e.g., "Am", "C#"). |

### B. Fingerprint Metrics (0-100 Scale)
These metrics provide the "DNA" of a track for the recommendation engine.

| Metric | Code Implementation | Musical Meaning |
| :--- | :--- | :--- |
| `brightness` | `spectral_centroid` | **High:** Crisp, pop, modern. **Low:** Warm, vintage, muffled. |
| `acousticness` | `inverted spectral_flatness` | **High:** Live instruments, vocals. **Low:** Synthesizers, electronic. |
| `danceability` | `tempogram peak_ratio` | **High:** Strong, clear beat. **Low:** Ambient, irregular rhythm. |
| `groove` | `onset_strength` | **High:** Punchy, percussive. **Low:** Smooth, flowing. |

## 4. Analysis Modes

The analysis engine supports multiple modes for different use cases:

| Mode | Trigger | Description |
| :--- | :--- | :--- |
| **Batch (Pre-Gig)** | "Start Analysis" button | Analyze all unanalyzed tracks before a performance. |
| **Set Analysis** | "Analyze Set" button | Analyze only tracks in the current set builder. |
| **Progressive (On-Play)** | Auto during live session | Analyze tracks as they're played (if enabled). |
| **Single Track** | "⚡ Analyze" button in Library | Analyze one specific track on demand. |

### Settings (Configurable via Settings Panel)

| Setting | Default | Description |
| :--- | :--- | :--- |
| `analysis.onTheFly` | `false` | Enable progressive on-play analysis. |
| `analysis.afterSession` | `true` | Sync fingerprints to Cloud after session ends. |
| `analysis.cpuPriority` | `normal` | Delay between tracks: `low`=3s, `normal`=1s, `high`=0s. |

### Pause/Resume

Analysis can be paused and resumed during batch operations:
- **Pause:** Finishes current track, then waits.
- **Resume:** Continues from where it left off.
- **Stop:** Aborts completely (progress lost).

## 5. Schema Versioning

Tracks include an `analysis_version` field to enable re-analysis when the algorithm improves.

| Version | Date | Metrics Included |
| :--- | :--- | :--- |
| 1 | 2026-01-16 | BPM, Key, Energy, Danceability, Brightness, Acousticness, Groove |

**See:** [Schema Versioning Guide](schema-versioning.md)

## 6. Database Schema (SQLite)

These metrics are persisted in the local SQLite database (`packages/desktop/src/db/schema.ts`).

```typescript
export const tracks = sqliteTable("tracks", {
  // ...
  bpm: real("bpm"),
  energy: real("energy"),
  key: text("key"),
  danceability: real("danceability"),
  brightness: real("brightness"),
  acousticness: real("acousticness"),
  groove: real("groove"),
  analyzed: int("analyzed", { mode: "boolean" }).default(false),
  analysisVersion: int("analysis_version").default(0),
});
```

## 7. Known Limitations

1.  **Missing "High Res" Contour:** The `energy_contour` (time-series data) described in early designs is **NOT** currently implemented in the database schema or frontend, although `librosa` could generate it.
2.  **Performance:** Analysis happens sequentially (one track at a time).
3.  **Accuracy:** Key detection is a best-guess estimate using Chroma features.

## 8. Change Log

| Date | Change |
| :--- | :--- |
| 2026-01-16 | Added Settings panel, Pause/Resume, Schema versioning, CPU priority delays |
| 2026-01-16 | Added pre-gig set analysis, progressive on-play, single-track analysis |
| 2026-01-15 | Initial documentation |
