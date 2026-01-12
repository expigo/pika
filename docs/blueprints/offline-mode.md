# Design Document 009: Offline Mode ("The Bunker")
**Status:** Planned (Future)
**Version:** 1.0.0

## "When the internet fails, the beat goes on."

## 1. The Problem
West Coast Swing events often happen in locations with poor connectivity:
*   **Hotel Basements:** Thick concrete walls block all 4G/5G signals.
*   **Crowded Ballrooms:** 500+ dancers overload the single venue WiFi access point.
*   **Remote Camps:** Zero cellular infrastructure.

**Current Pika! Architecture:**
`DJ Laptop` -> `Internet` -> `Cloud Server` -> `Internet` -> `Dancer Phone`

If **Internet** breaks at any point, the experience dies.

## 2. The Solution: "Pika! Bunker"
A completely localized, self-contained network.

**Bunker Architecture:**
`DJ Laptop` -> `Local Router` -> `Dancer Phone`

*   **Latency:** < 5ms (LAN speed)
*   **Reliability:** 100% (Physics of cables and radio waves)
*   **Dependency:** Zero ISP involvement.

## 3. Hardware Requirements
Organizers or DJs need a "Bunker Box containing:
1.  **WiFi Router:**
    *   Dual-band (2.4GHz / 5GHz).
    *   Minimum spec: AC1200 or AX1800 (WiFi 6 is preferred for high density).
    *   *Note:* Old ISP routers work perfectly fine for < 50 users.
2.  **Ethernet Cable:** To connect DJ Laptop to Router (for stability).

## 4. Software Implementation

### A. Desktop App (The Server)
Currently, `packages/desktop` is just a client. In "Bunker Mode", it becomes the **Server**.
*   **Feature:** Bundle a lightweight HTTP/WebSocket server (using Rust/Tauri sidecar or converting the Python sidecar to serve).
*   **Port:** 3000 (or random if taken).

### B. Network Discovery (The Hard Part)
How do dancers find `http://192.168.0.15:3000`?
*   **Solution 1 (QR Code):** The Desktop App detects its own local IP (e.g., `192.168.1.5`) and generates a QR code pointing specifically to that IP.
*   **Solution 2 (mDNS / Bonjour):** `http://pika.local`. (Reliability varies on Android).
*   **Selected MVP Strategy:** **Dynamic QR Code**. It's fail-safe.

## 5. User Journey

1.  **DJ Setup:**
    *   Plugs in Router. Connects Laptop.
    *   Toggles "Bunker Mode" switch in Pika! Desktop.
    *   App restarts in "Server Mode".
    *   App displays large QR Code: "Scan to Join WiFi: Pika-Event" and "Scan to View Playlist".

2.  **Dancer Experience:**
    *   Dancer tries to load `pika.stream` -> Fails (No internet).
    *   Dancer sees flyer: "Connect to WiFi: Pika-Event".
    *   Dancer scans QR code -> Opens `http://192.168.x.x:3000`.
    *   App loads instantly.

## 6. Technical Tasks

- [ ] **Desktop Server:** implementing a `FastAPI` or `Actix` server inside the desktop app to serve the `packages/web` static build.
- [ ] **IP Detection:** Rust function to find the "primary" LAN IP address.
- [ ] **Local Database:** Ensure the local SQLite DB can serve the same API endpoints (`/api/sessions/active`, `/api/live`) as the Cloud DB.
- [ ] **UI Switch:** "Go Offline" toggle in Settings.

## 7. Migration Strategy
We will reuse 90% of the code. The `packages/web` frontend is already capable of connecting to any URL via `NEXT_PUBLIC_CLOUD_API_URL`. In Offline Mode, we just serve a build of the web app where this variable points to `window.location.origin` instead of `api.pika.stream`.
