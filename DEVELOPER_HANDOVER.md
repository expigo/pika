# Pika! Developer Handover & Technical Guide

**Date:** December 29, 2025  
**Version:** 0.0.1 (MVP Phase)

This document is designed to get a new developer up to speed with the **Pika!** codebase. It covers the architectural decisions, current implementation status, and key flows required to understand how the system operates.

---

## 1. Project Overview & Architecture

**Pika!** is a hybrid Local/Cloud system for West Coast Swing DJs. It monitors local DJ software (VirtualDJ) and broadcasts the "Now Playing" track to a real-time cloud server for dancers to see.

### The "Split Brain" Architecture
The system is divided into two distinct environments (monorepo via **Bun Workspaces**):

1.  **Desktop (The Broadcaster)** - `@pika/desktop`
    *   **Tech:** Tauri 2.0 (Rust), React 19, TypeScript, Vite.
    *   **Role:** Runs locally on the DJ's laptop. Watches filesystem for track changes and pushes data to the cloud.
    *   **Key Service:** `VirtualDjWatcher` (polls `history.m3u` / `database.xml`).

2.  **Cloud (The Relay)** - `@pika/cloud`
    *   **Tech:** Hono Server running on Bun.
    *   **Role:** A lightweight WebSocket relay. It receives data from **Desktop** and broadcasts it to **Listeners**.
    *   **Key Concept:** Pub/Sub model using Bun's native `subscribe`/`publish`.

---

## 2. Key Technical Decisions

### Why Tauri?
We chose Tauri over Electron for lighter resource usage (critical for DJs running audio software simultaneously). Calls to native OS functions (like filesystem reading) connect via Tauri's IPC bridge.

### Why Hono + Bun?
*   **Performance:** Bun provides extremely fast startup and WebSocket performance.
*   **Simplicity:** Hono's API allows us to run a unified HTTP + WebSocket server in a single file (`index.ts`), simplifying deployment.
*   **Native WebSockets:** We use `Bun.serve({ websocket: ... })` which is more performant than the Node.js `ws` library.

### Why Polling for VirtualDJ?
VirtualDJ does not have a reliable "Webhook" or "Push" API for track changes. We implemented a `VirtualDjWatcher` service that polls the history file (default: 2s interval). This is robust and file-system agnostic.

---

## 3. Current Implementation Status

### ✅ Implemented & Working
*   **Desktop <-> Cloud Connection:** `useLiveSession` hook successfully manages WebSocket connections, reconnects on failure (`reconnecting-websocket`), and handles the "Go Live" lifecycle.
*   **Session Management:**
    *   Session IDs are generated locally and persisted in `localStorage`.
    *   DJs register via `REGISTER_SESSION` message.
*   **Track Broadcasting:**
    *   When `VirtualDjWatcher` detects a change => `BROADCAST_TRACK` => Cloud => `NOW_PLAYING` (broadcast).
*   **Feedback Loop:** The system supports a "Like" mechanism where listeners can send feedback, and the Desktop App displays a Toast notification.

### 🚧 WIP / Missing
*   **Listener Frontend:** There is currently NO user-facing web interface for the dancers. The API exists (`GET /sessions`, `ws://...`), but there is no `index.html` or React app for the public to view the current track.
    *   *Note:* Accessing the cloud URL via a browser currently returns JSON, not a websocket client.
*   **Secure Auth:** Currently any client can register as a DJ. No authentication tokens are enforced yet.

---

## 4. Key Data Flows

### A. The "Go Live" Sequence
1.  **User Action:** Click "Go Live" in Desktop UI.
2.  **Hook:** `useLiveSession.ts` initializes.
3.  **Connection:** Connects to `ws://localhost:3001/ws` (or env var).
4.  **Registration:** Sends `{ type: "REGISTER_SESSION", djName: "..." }`.
5.  **Confirmation:** Server responds with `SESSION_REGISTERED`.

### B. The "Now Playing" Loop
1.  **VirtualDJ:** Writes new line to history file.
2.  **Watcher:** `virtualDjWatcher.ts` reads file diff.
3.  **Event:** Fires `onTrackChange` callback.
4.  **Upload:** `useLiveSession` sends `{ type: "BROADCAST_TRACK", track: { ... } }`.
5.  **Broadcast:** Cloud server executes `rawWs.publish("live-session", payload)` to all subscribers.

---

## 5. Directory Structure / Where to Look

```
pika/
├── packages/
│   ├── desktop/
│   │   ├── src/hooks/useLiveSession.ts  <-- MAIN LOGIC for Broadcasting
│   │   ├── src/services/virtualDjInfo.ts <-- File watching logic
│   │   └── src-tauri/                   <-- Rust backend config
│   │
│   ├── cloud/
│   │   ├── src/index.ts                 <-- MAIN LOGIC for Server/Relay
│   │   └── src/drizzle/                 <-- Database schemas
```

---

## 6. Development Tips

*   **Running the Stack:** You need two terminals.
    1.  `cd packages/cloud && bun run dev`
    2.  `cd packages/desktop && bun run dev`
*   **Mobile Testing:**
    *   To test with a phone, the phone must be on the same Wi-Fi.
    *   **Crucial:** You cannot just open the URL in Safari. You must build a simple client or use a WebSocket tester app on the phone to verify the stream until the Frontend is built.
*   **Port Config:**
    *   Cloud defaults to `:3001`.
    *   Desktop has a `.env` support for `VITE_CLOUD_WS_URL` if you need to point to a specific IP (e.g., `ws://192.168.1.50:3001/ws`).

