# Architecture: Social Signals & Voting

This document describes the *current* implementation of the social interaction system in Pika!.

## 1. Overview

The Social Signals system turns the audience from passive listeners into active participants. It runs entirely on the **Cloud** server (`packages/cloud`) and interacts with the **Web** client (`packages/web`).

> [!TIP]
> For deep technical details on the synchronization transport, offline queue, and connection handling, see [Realtime Infrastructure](./realtime-infrastructure.md).

**Key Components:**
*   **WebSockets:** Real-time bidirectional communication.
*   **Active Polling:** DJ-initiated questions.
*   **Tempo Feedback:** Dancer requests for "Faster/Slower/Perfect".
*   **Likes (Pulse):** Real-time positive feedback for current tracks (with Undo support).

## 2. Implemented Features

### A. Live Polling (Active) 📊
DJs can create polls that appear instantly on all dancer devices.
*   **Creation:** DJ sends `START_POLL` (Question + Options + Duration).
*   **Voting:** Dancers send `VOTE_ON_POLL`.
*   **Results:** Updates broadcast in real-time (`POLL_UPDATE`).
*   **State:** Polls are stored in-memory on the Cloud server and persisted to DB.
*   **Validation:** 1 vote per `clientId` per poll.

### B. Tempo Requests (Passive) 🐢🐇
Dancers can signal their preference for the music speed *anonymously*.
*   **Options:** "Faster", "Slower", "Perfect".
*   **Aggregation:** Server counts votes per session.
*   **Reset:** Votes are tied to the *current track*? (Needs verification: Code suggests `TEMPO_RESET` exists but when does it fire?).
*   **Code:** `SEND_TEMPO_REQUEST` handler in `packages/cloud/src/index.ts`.

### C. Likes & Unhearts (Pulse) ❤️
Simple binary sentiment feedback with real-time synchronization.
*   **Heart (Like):** Dancer taps the Pulse button to signal hype.
*   **Unheart (Undo):** Dancer taps again to remove the like.
*   **Restriction:** 1 like per track play per `clientId`.
*   **Broadcasting:** Handled via `LIKE_RECEIVED` and `LIKE_REMOVED` messages.
*   **Persistence:** Mirrored to database with a 2-second debounce for DJ efficiency.

> [!NOTE]
> For deep technical details on the Heart/Unheart message flow and database idempotency, see [Heart & Unheart Logic](./heart-logic.md).

### D. Announcements 📢
DJ can broadcast messages to all dancers.
*   **Creation:** DJ sends `SEND_ANNOUNCEMENT` (message + optional duration).
*   **Display:** Overlay banner appears on all dancer devices.
*   **Auto-dismiss:** Timer-based dismissal when `endsAt` expires.
*   **Session-scoped:** Announcements only show to dancers in the DJ's session.
*   **Cancellation:** DJ can manually cancel via `CANCEL_ANNOUNCEMENT`.

### E. Listener Count 👥
Real-time counter of connected *unique* `clientId`s.

### F. Resilience Features 🛡️
*   **Offline Queue:** If a dancer likes a track while offline, it is queued and automatically flushed when the connection is restored.
*   **Session Scoping:** Likes are persisted in `localStorage` scoped to the `sessionId`. This prevents "Phantom Likes" when joining new sessions or reconnecting.

## 3. Data Structures

Defined in `packages/shared/src/schemas.ts`.

```typescript
// Poll Schema
export const StartPollSchema = z.object({
  type: z.literal("START_POLL"),
  question: z.string(),
  options: z.array(z.string()).min(2).max(5),
  durationSeconds: z.number().optional(),
});

// Tempo Schema
export const SendTempoRequestSchema = z.object({
  type: z.literal("SEND_TEMPO_REQUEST"),
  preference: z.enum(["faster", "slower", "perfect", "clear"]),
});
```

## 4. Poll Results UX (Desktop)

When a poll ends (manually or via timer):
1. **Results persist** in `endedPoll` state until dismissed.
2. **Toast notification** shows "🏆 Poll ended! {Winner} won with {%}!".
3. **Drawer display** shows all options with percentages and winner highlighted.
4. DJ clicks "Dismiss Results" to clear and start a new poll.

This ensures busy DJs don't miss poll results during live performances.

## 5. Known Limitations

*   **Ghost Mode:** Not implemented. All feedback is always live.
*   **Rate Limiting:** 
    *   Likes: Client-side rate limiting (Sonner toasts) and server-side sliding window protection.
    *   Unhearts: Validated against current session state.
*   **Idempotency:** Enforced via DB unique constraint on `(session_id, client_id, played_track_id)`.


## 6. Session Telemetry (v0.4.5)

DJ session stability is tracked via the `session_events` table:
*   `connect` - DJ established WebSocket connection
*   `disconnect` - DJ connection unexpectedly closed  
*   `reconnect` - DJ reconnected after disconnect
*   `end` - DJ explicitly ended session

This enables operational insights without storing PII.

---

*Last Updated: January 29, 2026 (v0.4.5)*
