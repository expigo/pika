# Architecture: Social Signals & Voting

This document describes the *current* implementation of the social interaction system in Pika!.

## 1. Overview

The Social Signals system turns the audience from passive listeners into active participants. It runs entirely on the **Cloud** server (`packages/cloud`) and interacts with the **Web** client (`packages/web`).

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

### D. Listener Count 👥
Real-time counter of connected *unique* `clientId`s.

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

## 4. Known Limitations

*   **Ghost Mode:** Not implemented. All feedback is always live.
*   **Throttling:** 
    *   Likes: 1 per track.
    *   Polls: 1 per poll.
    *   **Missing:** Rate limiting for connection floods or spamming updates.
*   **"Vibe Check" Grid:** Original design had a 4-button grid. Current implementation effectively splits this into "Tempo" (3 buttons) and "Like" (1 button).
*   **Persistence:** Polls are saved to DB, but `tempoVotes` appear to be in-memory only? (Need to verify persistence of tempo votes).
