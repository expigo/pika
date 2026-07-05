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
*   **Journal & Export:** likes feed the dancer's Journal (`/my-likes`), read via
    `GET /api/client/:clientId/likes` (paginated, real total; Spotify identity retro-enriched
    through the trusted `track_links` spine) and exportable as ONE per-dancer "My Pika Journal"
    playlist on the shared Pika Spotify account (`POST /api/client/:clientId/likes/playlist`,
    regenerated in place; per-IP limit + per-client cooldown + daily budget). Likes are also
    removable post-hoc from the Journal (`DELETE /api/client/:clientId/likes/:likeId`,
    ownership-scoped; two-tap confirm in the UI) — the playlist drops the song on the next
    export. Journal usage is measured via `POST /api/telemetry/events` → `product_events`
    (enum-whitelisted beacons).

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


## 6. Session Telemetry (v0.5.0)

DJ session stability is tracked via the `session_events` table:
*   `connect` - DJ established WebSocket connection
*   `disconnect` - DJ connection unexpectedly closed  
*   `reconnect` - DJ reconnected after disconnect
*   `end` - DJ explicitly ended session

This enables operational insights without storing PII.

## 7. The Relationship Loop (Slice C)

Two durable signals extend the live-only ones above:

*   **Follow** (`dj_follows`) — the dancer→DJ edge, **account-keyed** (never clientId: a follow
    must survive device eviction — it's also the account-conversion moment). Composite PK makes
    it idempotent; both FKs cascade on account deletion. Follower lists are never public — the DJ
    sees an aggregate count, publicly shown only behind their own toggle. Anonymous taps route
    through `/my-likes/save` with the intent riding the callbackURL query string.
*   **Thanks** (`session_thanks`) — one-tap post-set applause, at most one per device per session
    (same possession-trust model as likes; `unique(session_id, client_id)`). Deliberately carries
    no free text (no moderation surface). Surfaces as a count in the DJ's morning digest. The
    pre-existing ephemeral `thank_you` WS reaction is unchanged — this is its durable counterpart.

---

*Last Updated: July 5, 2026 (Slice C — follows + durable thanks)*
