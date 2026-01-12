# Architecture: Logbook & Analytics

This document describes the *current* implementation of the Logbook system (Desktop) and the centralized analytics data (Cloud).

## 1. Overview

The "Logbook" exists in two forms:
1.  **Desktop Logbook (Local):** A SQLite-based history of every session played by the DJ on their machine. It stores "Plays", "Sessions", and "Tracks".
2.  **Cloud Analytics (Central):** A Postgres-based history of every session broadcasted live. It adds "Social Data" (Likes, Tempo Votes, Polls).

## 2. Desktop Implementation (Local)

**Location:** `packages/desktop/src/db/schema.ts`

The desktop app maintains a local `sessions` table and a `plays` table.

```typescript
export const sessions = sqliteTable("sessions", {
  id: int("id").primaryKey(),
  uuid: text("uuid"),       // Sync ID
  name: text("name"),       // e.g. "Friday Night Set"
  djIdentity: text("dj_identity"),
  startedAt: int("started_at"),
  endedAt: int("ended_at"),
});

export const plays = sqliteTable("plays", {
  id: int("id").primaryKey(),
  sessionId: int("session_id"),
  trackId: int("track_id"),
  playedAt: int("played_at"),
  reaction: text("reaction"), // 'neutral', 'peak', 'brick' (DJ Tags)
  notes: text("notes"),
  dancerLikes: int("dancer_likes"), // Synced from cloud (partial implementation)
});
```

*   **Status:** The "Reaction" (Peak/Brick) and "Notes" columns exist, supporting manual tagging.
*   **Missing:** The "Smart Suggestions" and "Timeline Row" visualizations described in early designs are NOT implemented.

## 3. Cloud Implementation (Analytics)

**Location:** `packages/cloud/src/db/schema.ts`

The cloud server captures the "Social Layer" that the desktop cannot see directly.

### A. Session History
*   `sessions` table tracks DJ, start/end times.
*   `playedTracks` table stores the sequence of tracks + audio metrics (bpm, energy, etc.).

### B. Social Signals
*   **Likes:** `likes` table stores every heart sent, linked to `playedTracks` and `clientId`.
*   **Tempo:** `tempoVotes` table aggregates "Faster/Slower" votes *per track*.
*   **Polls:** `polls` and `pollVotes` store every question and answer.

## 4. Derived Analytics (The "Recap")

Currently, analytics are delivered via the **Session Recap API** (`packages/cloud/src/index.ts` -> `/api/session/:id/recap`).
*   It aggregates the `playedTracks` sequence.
*   It includes basic counts (Likes).
*   **Missing:** Advanced transition quality analysis, "Energy Flow" graphs, or "Crowd Sentiment" timelines.

## 5. Known Limitations

1.  **Correlation Gap:** There is no dedicated `session_events` table for fine-grained timestamped events (e.g. "at 10:05:33 user X clicked Like"). Likes are associated with a *Track*, not a specific timestamp within the track.
2.  **Performance Mode UI:** The desktop UI does not yet implement the distinct "Democracy Mode" or "Ghost Mode" overlays described in the vision.
    *   **Missing:** "Floating Hearts Stream" overlay (Standard Mode).
    *   **Missing:** Prominent "Live Bar Chart" overlay (Democracy Mode).
    *   **Missing:** "Clean Dashboard" toggle (Ghost Mode).
3.  **Visualization:** The Logbook is currently a standard table, not the "Layered Timeline" envisioned.
