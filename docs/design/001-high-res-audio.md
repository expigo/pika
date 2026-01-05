# Design Doc 001: High Resolution Audio (The "X-Ray")

**Status:** APPROVED
**Date:** 2026-01-03
**Author:** Antigravity

## 1. Summary
Upgrade the analysis engine from "Lossy" (single value averages) to "High Resolution" (time-series data). This gives the DJ "X-Ray Vision," allowing them to see the internal structure of tracks (intros, breaks, build-ups, drops) rather than just a global energy level.

## 2. User Stories (WCS Specific)
*   **The "Phrasing" Check**: As a WCS DJ, I need to know if a song has a 32-beat intro or a weird 48-beat break so I can cue my mix to match the dancers' phrasing (8-count structure).
*   **The "Energy Cliff" Prevention**: As a DJ, I want to see if a High Energy song ends on a Low Energy outro.
*   **The "Drop" Hunter**: As a DJ, I want to see exactly where the energy peaks so I can visually cue the mix.
*   **Visual Library**: As a DJ, I want to recognize songs by their "shape" (e.g., "The one with the long quiet intro").

## 3. Technical Specification

### A. The "Sensor Fusion" Strategy
We assume no single source of truth is perfect. We rely on a tiered trust system where VirtualDJ feeds Librosa:
1.  **Tier 1 (The Human Truth):** **VirtualDJ Metadata**.
2.  **Tier 2 (The Physics Truth):** **Librosa RMS/BPM**.
    *   **Optimization (Seeding):** We pass `start_bpm=vdj_bpm` to `librosa.beat.beat_track`. This uses the VDJ value as a "prior" probability, preventing half-time/double-time errors.
3.  **Conflict Detection (Safe Mode):**
    *   If `abs(vdj_bpm - librosa_bpm) > 5`: Flag track with ⚠️ "BPM Mismatch".

### B. Python Sidecar (`packages/desktop/python-src`)
*   **Library**: `librosa` (Standard).
*   **Optimization for M1/Desktop**:
    *   **Sample Rate**: Downsample to `11025 Hz`.
    *   **Channels**: Mono (`mono=True`).
    *   **Hop Length**: `1024` (Faster processing, sufficient for WCS 80-140 BPM range).
*   **Parameter Tuning (WCS Genre Specifics)**:
    *   **Onset Detection**: Set `wait` parameter based on BPM to ~16th note duration to filter out "ghost notes" (micro-rhythms).
*   **Output Metrics**:
    1.  `energy_contour`: List[float] (Time-series RMS).
    2.  `brightness`: Spectral Centroid (Warm vs Bright).
    3.  `acousticness`: Spectral Flatness (Electronic vs Acoustic).
    4.  `bpm/energy`: Global averages.

### C. Database Schema (`packages/desktop/src/db`)
*   **Table**: `tracks`
*   **New Columns**:
    *   `energy_contour`: TEXT/JSON.
    *   `brightness`: REAL (0-100).
    *   `acousticness`: REAL (0-100).

### D. Frontend Visualization
*   **Library View**: "Sparkline" preview (hidden by default, toggle on hover).
*   **Set Canvas**: Full `TrackWaveform` overlay with **32-beat Phrasing Grid**.

## 4. Performance & Distribution Strategy
*   **Bundling**: `PyInstaller` + `Librosa` (No Essentia binaries yet).
*   **Background Processing**: Strict sequential queue (1 track at a time).
*   **M1 Performance**: Expected analysis time < 5s per track using 11kHz downsampling.

## 5. Verification Plan
*   **Accuracy Check (BPM)**: Verify `start_bpm` seeding corrects a known "Double Time" track error.
*   **Accuracy Check (Contour)**: Verify the "Drop" in a high-contrast song is visible in the waveform.
*   **Performance Check**: Ensure 5-minute track analyzes in < 5 seconds on M1 Air.
