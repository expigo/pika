# Architecture: Realtime Infrastructure

This document describes the technical implementation of the synchronization layer between the **Desktop** app (the source of truth) and the **Cloud** server (the distribution layer).

## 1. Design Philosophy: "Local First, Cloud Second"

Pika! is designed to run in venue environments where internet connectivity is intermittent or unreliable.
*   **Source of Truth:** The Desktop App (`packages/desktop`) holds the authoritative state of "What is playing".
*   **Distribution:** The Cloud Server (`packages/cloud`) is merely a relay and aggregation point.
*   **Resilience:** The system prioritizes *saving the data locally* first, then attempts to sync. Failure to sync should never crash the local application.

## 2. Connectivity Architecture

The connection is established via WebSockets (`wss://`).

### Client-Side (`packages/desktop`)
*   **Library:** `reconnecting-websocket` wraps the standard DOM `WebSocket`.
*   **Behavior:**
    *   **Auto-Reconnect:** Exponential backoff (1s to 10s) on disconnection.
    *   **Session Restoration:** On `onopen`, the client immediately re-sends `REGISTER_SESSION` with the active `sessionId`. This allows the server to rebuild in-memory state after a deployment or restart without the user noticing.

### Server-Side (`packages/cloud`)
*   **Library:** Bun's native `ServerWebSocket` via Hono integration.
*   **State:** In-memory `activeSessions` Map.
*   **Scaling:** Currently single-instance. (Future work: Redis adapter for multi-instance support).

## 3. The Offline Queue Mechanism

To handle network drops without data loss, the Desktop app implements a persistent offline queue.

### How it works:
1.  **Detection:** When `sendMessage()` is called, we check `socket.readyState === WebSocket.OPEN`.
2.  **Enqueue:** If not open, the message payload is sent to `offlineQueueRepository` (SQLite).
3.  **Flush:** When the socket triggers `onopen`, `flushQueue()` is called.
    *   It reads all persisted messages.
    *   Sends them sequentially to preserve order.
    *   Deletes them from SQLite only after `send()` is called.

> [!NOTE]
> Only critical messages (like `BROADCAST_TRACK`) are queued. Ephemeral messages (like "typing indicators" or high-frequency updates) may be dropped to prevent flood on reconnection.

## 4. Deduplication & Data Integrity

Since the Desktop app periodically polls VirtualDJ (every 1-2s), it may detect the same track multiple times.

*   **Last Broadcast Pointer:** The client stores `lastBroadcastedTrackKey` (Artist + Title). It will not send a `BROADCAST_TRACK` message if it matches the last sent one.
*   **Ghost Tracks:** If a DJ plays a file not imported into the Pika! library, the system generates a "Ghost Track" (ID: `ghost://...`) to ensure the play is still recorded and broadcast.

## 5. Known Limitations & Risks

### ⚠️ Lack of Application-Level ACKs
**Severity: Medium**
The current WebSocket implementation relies on TCP guarantees *while connected*. However, if a connection drops *during* a message transmission:
1.  The Client thinks `send()` succeeded.
2.  The Server never receives the frame.
3.  The message is lost (not queued).

**Recommended Fix:** Implement a protocol-level Acknowledgement.
*   Client sends `{ id: "uuid-1", type: "BROADCAST_TRACK" ... }`.
*   Server replies `{ type: "ACK", id: "uuid-1" }`.
*   Client keeps message in "Pending" state until ACK received (with timeout/retry).

### ⚠️ Ordering Edge Cases
During `flushQueue()`, if the connection drops again, the loop breaks. On the next reconnection, the queue is restarted.
*   **Risk:** If `flushQueue` has not completed and new live data is generated, we must ensure the *new* data is not sent before the *old* queue is drained. Current implementation relies on the single-threaded nature of JS event loop, but explicit guards would be safer.
