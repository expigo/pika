# Design Document 009: Offline Mode ("The Bunker")
**Status:** In Progress (Level 1)
**Version:** 2.0.0
**Last Updated:** 2026-01-18

## "When the internet fails, the beat goes on."

## 1. The Problem
West Coast Swing events often happen in locations with poor connectivity:
*   **Hotel Basements:** Thick concrete walls block all 4G/5G signals.
*   **Crowded Ballrooms:** 500+ dancers overload the single venue WiFi access point.
*   **Remote Camps:** Zero cellular infrastructure.

**Current Pika! Architecture:**
`DJ Laptop` -> `Internet` -> `Cloud Server` -> `Internet` -> `Dancer Phone`

If **Internet** breaks at any point, the experience suffers.

---

## 2. The Strategy: Defense in Depth

We approach offline resilience in layers, from simplest (software) to most complex (hardware).

### Level 0: The "Starlink" Hardware Fix (Immediate / User Responsibility)
**Strategy:** Bypass the venue's terrible infrastructure completely.
*   **How:** DJ brings their own **Starlink** (or high-end 5G router with external antenna).
*   **Workflow:**
    1.  DJ connects Laptop to Starlink WiFi.
    2.  Dancers connect to Starlink WiFi.
    3.  **Result:** Everyone enters the "Real Internet." Pika! works normally via Cloud.
*   **Pros:** Zero code changes. 100% reliable if hardware is good.
*   **Cons:** Hardware cost. Limited concurrent user support (standard routers choke at ~100 users).

### Level 1: Software Resilience (PWA + Optimistic UI) - **CURRENT FOCUS**
**Strategy:** The app never "crashes" or shows a dinosaur; it just waits.
*   **Core Technology: Progressive Web App (PWA)**
    *   **The Shell:** Cached HTML/CSS/JS means the app **opens instantly** even in airplane mode.
    *   **"Store & Forward":** Likes/Votes are stored in `localStorage` queue (already implemented) and auto-synced when signal returns.
    *   **"Signal Lost" UI:** If the DJ's heartbeat is missing for >2 mins, user sees explicit "Waiting for Signal" UI instead of stale song data.
*   **New Capabilities Unlocked:**
    *   **Installability:** "Add to Home Screen" prevents "lost tab" syndrome.
    *   **Selective Push Notifications:** Critical for announcements ("Pizza at midnight!"). Works even if phone is locked.
    *   **Vibration Access:** Standardized haptic feedback access on Android (and improved on iOS via interaction).
*   **Implementation Status:**
    - [x] Offline Queue (Likes)
    - [x] Offline Queue (DJ Updates)
    - [x] **PWA Manifest & Service Worker** (Done v2.0)
    - [x] **Push Notification Infrastructure** (Done v2.0)

### Level 3: "The Bunker" (Local LAN Server) - **FUTURE / GOD MODE**
A completely localized, self-contained network for the "Concrete Bunker" scenario where ZERO internet is possible.

**Bunker Architecture:**
`DJ Laptop` -> `Local Router` -> `Dancer Phone`

*   **Latency:** < 5ms (LAN speed)
*   **Reliability:** 100% (Physics of cables and radio waves)
*   **Dependency:** Zero ISP involvement.
*   **Constraint:** Requires all users to join the DJ's specific WiFi network (high friction). The browser security model makes seamless handover from Cloud to Local IP nearly impossible.

## 3. Detailed PWA Implementation Plan (Level 1)

### A. The Service Worker
We need a robust Service Worker strategy (using `next-pwa` or similar):
1.  **Cache Strategy:** `StaleWhileRevalidate` for API calls, `CacheFirst` for UI assets/fonts/images.
2.  **Offline Fallback:** If `pika.stream` is unreachable, serve the cached "App Shell" immediately.

### B. "Signal Lost" UX
When the client detects a `disconnected` socket state or missing heartbeat:
1.  **Do NOT** clear the screen.
2.  **DO** overlay a "Reconnecting..." toast (already done).
3.  **If > 2 mins:** Fade out the "Now Playing" art/metadata. Replace with "Searching for Signal..." to prevent misleading dancers with old song data.
4.  **Allow Interactions:** Keep the "History" and "My Likes" accessible. Allow "Liking" (it queues).

### C. Selective Push Announcements
1.  **Topic Subscription:** When joining a session (`pika_123`), the client subscribes to that topic.
2.  **Targeting:** DJ sends announcement -> Cloud Server -> FCM/APNs -> Only devices subscribed to `pika_123`.

---

## 4. Bunker Hardware Requirements (Reference for Level 3)
Organizers or DJs need a "Bunker Box containing:
1.  **WiFi Router:**
    *   Dual-band (2.4GHz / 5GHz).
    *   Minimum spec: AC1200 or AX1800 (WiFi 6 is preferred for high density).
    *   *Note:* Old ISP routers work perfectly fine for < 50 users.
2.  **Ethernet Cable:** To connect DJ Laptop to Router (for stability).

## 5. Software Implementation (Bunker Mode)

### A. Desktop App (The Server)
Currently, `packages/desktop` is just a client. In "Bunker Mode", it becomes the **Server**.
*   **Feature:** Bundle a lightweight HTTP/WebSocket server (using Rust/Tauri sidecar or converting the Python sidecar to serve).
*   **Port:** 3000 (or random if taken).

### B. Network Discovery (The Hard Part)
How do dancers find `http://192.168.0.15:3000`?
*   **Solution 1 (QR Code):** The Desktop App detects its own local IP (e.g., `192.168.1.5`) and generates a QR code pointing specifically to that IP.
*   **Solution 2 (mDNS / Bonjour):** `http://pika.local`. (Reliability varies on Android).
*   **Selected MVP Strategy:** **Dynamic QR Code**. It's fail-safe.

## 6. Migration Strategy
We will reuse 90% of the code. The `packages/web` frontend is already capable of connecting to any URL via `NEXT_PUBLIC_CLOUD_API_URL`. 

**Status Update (Jan 2026):**

### Web Client (Dancers) - Readiness: 9/10 🟢
The frontend is **Offline-Resilient**. We have implemented:
- **Robust Reconnection:** Heartbeat monitor ensures connection recovery.
- **Offline Queue:** Likes are gathered locally and bulk-sent when connection returns.
- **Session Scoping:** Persistence is handled safely per session.
- **Session Ended UI:** Distinct state for "DJ Left" vs "Connection Lost".

### Desktop Client (DJ) - Readiness: 8/10 🟢
The broadcaster is **Server-Ready** (Connectivity Wise).
- **Socket Recovery:** Robust logic implemented.
- **Offline Queue:** `OfflineQueueRepository` (SQLite) persists failed updates and flushes them on reconnect.
- **Pending:** Logic to actually *serve* the web assets in standalone mode (currently still relies on Cloud URL unless we switch to full Bunker architecture).

In Offline Mode, we just serve a build where the API URL points to the local desktop IP.
