# Design Doc 003: The Logbook & Analytics (The Memory)

**Status:** APPROVED
**Date:** 2026-01-03
**Author:** Antigravity

## 1. Summary
Transform the existing **Logbook** and **Performance Mode** from simple tracking tools into an integrated "Feedback Loop." By correlating **Audio Data** (001) and **Social Signals** (002) with the DJ's own **Manual Tags** (Peak/Brick), we create a system that helps the DJ refine their intuition without changing their core workflow.

## 2. User Stories
*   **The Reality Check**: As a DJ, I want to compare my manual "Peak" tag against the actual "Like Count" to see if the crowd agreed with me.
*   **The Context Aware Performer**: As a DJ in "Performance Mode," I want to see "Vibe Requests" (e.g., "Too Slow") overlayed on the screen *only* if I am in "Standard Mode" (not Ghost Mode).
*   **The Smart Diary**: As a DJ, I want the system to suggest tags ("High Engagement detected - mark as Peak?") to save me effort.

## 3. Enhancing "Performance Mode" (Live)
*   **Philosophy**: Do not break the existing focus-mode UI. Add information density only where valuable.
*   **Mode Awareness**:
    *   **Standard Mode**: Show "Vibe Requests" (e.g., "5 Users want Blue") in a designated notification area.
    *   **Democracy Mode**: Show "Poll Status" (e.g., "Winner: Funk 80%") prominently.
    *   **Ghost Mode**: Hide all social inputs. Keep only Track Info.
*   **Latency Handling**:
    *   *Issue:* VDJ takes a few seconds to update the file history.
    *   *Mitigation:* The "Now Playing" display updates asynchronously. Social signals (requests) are independent of the track and update instantly.

## 4. Enhancing The Logbook (Post-Set)
*   **Visual Upgrade**:
    *   Replace the simple table row with a **Timeline Row**.
    *   **Layer 1**: `TrackWaveform` (Energy Contour).
    *   **Layer 2**: `Social Heatmap` (Likes/Requests over time).
    *   **Layer 3**: `Dj Tag` (Peak/Brick icon overlay).
*   **Smart Suggestions**:
    *   If `Diff(Likes, Average)` is High (> 2 std dev), highlight row gold: "Potential Peak?".
    *   If `Negative Signals` count is High, highlight row red: "Potential Floor Clearer?".

## 5. Technical Architecture
*   **Storage**: SQLite.
    *   New Table: `session_events` to store timestamps of every Like/Request.
*   **Correlation**:
    *   Analytics queries join `tracks` (Audio), `plays` (Manual Tags), and `session_events` (Social) by timestamp.
*   **Privacy**: Local-first processing. "Smart Suggestions" run on the DJ's machine.
