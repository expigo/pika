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
*   **Likes:** Positive feedback for current tracks.

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

### C. Likes (Hype) ❤️
Simple binary positive feedback.
*   **Action:** Dancer taps "Heart".
*   **Restriction:** 1 like per track per `clientId`.
*   **Feedback:** "Like" animation on sender, counter update for everyone.

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
*   **Throttling:** 
    *   Likes: 1 per track.
    *   Polls: 1 per poll.
    *   **Missing:** Rate limiting for connection floods or spamming updates.
*   **"Vibe Check" Grid:** Original design had a 4-button grid. Current implementation effectively splits this into "Tempo" (3 buttons) and "Like" (1 button).
*   **Persistence:** Polls are saved to DB. Likes constitute a session-scoped local state for the user.

