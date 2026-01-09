# Design Document 008: Pika! Vision - Roadmap to 10/10

**Version:** 1.0.0
**Created:** 2026-01-09
**Status:** Vision / Future Roadmap
**Goal:** Elevate Pika! from a "Great Utility" (8.5/10) to an "Industry Standard Ecosystem" (10/10).

---

## 1. Executive Summary

This document captures the high-level vision for Pika!'s evolution beyond the MVP. While the MVP focuses on core utility (identifying songs), the 10/10 version focuses on **Robustness** (working anywhere) and **Community** (connecting people).

## 2. Infrastructure: The "Bunker" Standard (Robustness)

*Objective: Make the app indestructible. Eliminate "No Internet" as a failure mode.*

### 2.1 🔴 Offline / LAN Mode (The Holy Grail)
**Problem:** Venues often have terrible or non-existent 4G/5G/WiFi (basements, remote camps).
**Solution:** A "Local Server" mode built into the Desktop App.
*   **How it works:**
    *   DJ creates a local WiFi hotspot (e.g., "Pika_Party").
    *   Desktop App spins up a local HTTP server (embedded Bun/Node in Tauri) serving the web app.
    *   Dancers connect to WiFi → App works instantly with zero latency.
*   **Tech Stack:**
    *   Tauri sidecar or internal server to serve Next.js static export.
    *   mDNS / Bonjour for discovery (optional) or simple IP sharing via QR code.
*   **Difficulty:** High (Networking, captive portal handling, serving Next.js locally).
*   **Impact:** 🚀 **Critical**. Transforms Pika! from "Nice to have" to "Critical Infrastructure."

### 2.2 🔴 Zero-Latency Visual Sync
**Problem:** "Visualizing" music on a phone is often laggy due to network jitter, breaking immersion.
**Solution:** Beat-perfect synchronization.
*   **How it works:**
    *   Server sends `track_start_time` and `bpm`.
    *   Client syncs its internal clock with server (NTP-style).
    *   Animations (pulsing backgrounds, progress bars) run locally based on the predictive beat grid, correcting for latency.
*   **Impact:** 🤩 **Wow Factor**. Dancers are rhythm-obsessed; visual cues that match the auditory beat perfectly feel magical.

---

## 3. Ecosystem: From "Tool" to "Community Hub"

*Objective: Transform the app from a passive information screen into an active social engine.*

### 3.1 🟡 The "Traffic Light" System (Social Signaling)
**Problem:** Social anxiety. "Who wants to dance?" "Is that person taking a break?"
**Solution:** A discreet status indicator on the dancer's profile/phone.
*   **States:**
    *   🟢 **Green:** "Looking for dances!"
    *   🟡 **Yellow:** "Picky right now / Only unique songs."
    *   🔴 **Red:** "Taking a break / Watching."
*   **Implementation:**
    *   Simple toggle on the main UI.
    *   (Optional) "Beacon" mode where people nearby can see who is Green (requires Bluetooth LE or similar, maybe overkill for Web).
    *   Web-based: List of "Dancers looking for partners" in the current session.
*   **Impact:** ✨ **Viral**. Directly facilitates the event's primary purpose.

### 3.2 🟢 Personalized Night Recap ("Memory Lane")
**Problem:** Users leave the event and the experience ends.
**Solution:** A generated summary of *their* night.
*   **Features:**
    *   "You were active for 3 hours."
    *   "Your 'Song of the Night': [Track Name] (You liked it and voted 'Faster')."
    *   **"Generate Playlist":** create a Spotify/Apple Music playlist of ONLY the songs played while the user was active/checked-in.
*   **Impact:** ❤️ **Retention**. Creates a digital souvenir.

### 3.3 🟢 Dancer-Centric Analytics (Gamification)
**Problem:** No feedback loop for the dancer.
**Solution:** "Fitbit for WCS."
*   **Metrics:**
    *   "You prefer slower tracks (Average liked BPM: 95)."
    *   "You love Acoustic Blues."
*   **Impact:** Sticky usage. Users check the app to see their stats, not just the song name.

---

## 4. Prioritization Matrix

| Feature | Difficulty | Impact | Category | Suggested Phase |
| :--- | :--- | :--- | :--- | :--- |
| **Personalized Night Recap** | 🟢 Easy | ❤️ High | Engagement | v1.1 / v1.2 |
| **Traffic Light System** | 🟡 Medium | ✨ High | Social | v1.5 |
| **Offline / LAN Mode** | 🔴 Hard | 🚀 Critical | Infrastructure | v2.0 |
| **Zero-Latency Sync** | 🔴 Hard | 🤩 Medium | Polish | v2.x |

---

## 5. Next Steps

1.  **Validate**: Survey dancers/DJs if "Offline Mode" is a blocker for them (or if 4G is usually fine).
2.  **Prototype**: Build "Night Recap" as the first step towards 10/10—it's low hanging fruit that adds high emotional value.
