# Blueprint: PWA Integration & Offline Resilience ("Bunker Mode")

## 1. Executive Summary

**The Goal:** Transform `@pika/web` from a website into a **Progressive Web App (PWA)**.
**The "Why":** West Coast Swing events often occur in venues with catastrophic connectivity (concrete basements, overcrowded hotel WiFi).
**The Promise:** Pika! must load instantly and allow interaction (voting/history) even in "Airplane Mode," syncing automatically when signal returns.

---

## 2. Strategic Value

| Feature | Value Prop | Impact Score |
| :--- | :--- | :--- |
| **Instant Load** | No "White Screen of Death" when network is flaky. | 🟢 CRITICAL |
| **Installability** | "Add to Home Screen" creates a permanent app icon. | 🟡 HIGH |
| **Offline Voting** | Likes/Polls are queued locally, never lost. | 🟢 CRITICAL |
| **Push Notifications** | "Pizza at Midnight" alerts reach locked phones. | 🟡 HIGH |
| **Immersion** | Removes browser chrome (URL bar) for a native feel. | 🟡 MEDIUM |

---

## 3. Technical Architecture (The Stack)

We will use the **"Modern Standard"** approach for Next.js 15 (App Router).

### A. The Shell (Caching)
*   **Library:** `@ducanh2912/next-pwa` (Community fork optimized for Next.js App Router).
*   **Strategy:**
    *   **Assets (JS/CSS/Images):** `CacheFirst`. The UI loads instantly from disk.
    *   **API (`/api/*`):** `NetworkOnly`. We do *not* cache API responses via SW (too stale). We handle data unavailability via React State (Optimistic UI).

### B. The Queue (Data Consistency)
*   **Storage:** `idb-keyval` (Tiny wrapper for IndexedDB).
*   **Mechanism:**
    1.  User taps "Like".
    2.  App checks `socket.readyState`.
    3.  If **Connected**: Send immediately.
    4.  If **Disconnected**: Write to JSON Queue in IndexedDB.
    5.  **Reconnection:** On `socket.open`, flush queue (FIFO).

---

## 4. Implementation Phase 1: "The Safety Net" (Next Sprint)

**Objective:** Prevent the "Dinosaur" error page.

1.  **Manifest File (`manifest.json`):**
    *   Define name: "Pika! Live"
    *   Colors: `#0f172a` (Background), `#ea580c` (Theme).
    *   Icons: Maskable icons for Android/iOS.

2.  **Service Worker Config (`next.config.mjs`):**
    *   Enable `@ducanh2912/next-pwa`.
    *   Exclude `/admin` or `/dj` routes (keep cache logic for Dancers only).
    *   Register default offline fallback page.

3.  **iOS Touch Ups:**
    *   Add `apple-mobile-web-app-capable` meta tag.
    *   Ensure "Safe Area" padding handles the notch correctly in fullscreen mode.

---

## 5. Implementation Phase 2: "The Sync Engine" (Future)

**Objective:** Guarantee every vote counts.

1.  **Dancer Queue Hook:**
    *   Create `useOfflineVoteQueue`.
    *   Intercepts `sendLike()` in `useLiveListener`.
    *   Manages the "Pending Sync..." UI indicator.

2.  **Background Sync API:**
    *   Register a `sync` event in the Service Worker.
    *   Allows flushing votes even if the user closes the app tab (Android only).

---

## 6. UX Changes (What the user sees)

*   **Online:** Normal app.
*   **Offline (First Load):** App opens instantly. Banner: "⚠️ Offline Mode". History is empty (or cached from last visit).
*   **Offline (Action):** User taps "Like".
    *   Confetti fires (Optimistic UI). 
    *   Toast: "Saved offline. Will sync when connected." 
    *   Small "cloud-off" icon appears in corner.
*   **Reconnection:**
    *   Socket connects.
    *   "Syncing..." spinner.
    *   "cloud-check" icon.

---

## 7. Risks & Mitigations

*   **Risk:** Aggressive caching breaks new deployments.
    *   *Mitigation:* Configure SW to check for updates on every navigation (`skipWaiting: true`).
*   **Risk:** Storage quota exceeded.
    *   *Mitigation:* `idb-keyval` is tiny. We only store text JSON (votes). Clean up old sessions on load.

---

## 8. Creative Utilization Ideas (Post-Integration)

Once Pika! is a PWA, we unlock powerful new engagement vectors:

1.  **"Vibration Voting" (Haptic):**
    *   Since PWAs have better access to the **Vibration API**, we can give tactile feedback when voting.
    *   *Idea:* A "Heartbeat" vibration pattern when the user matches the BPM of the song (tapping tempo).

2.  **"Pocket Announcement" (Push):**
    *   DJs can send **"Emergency Broadcasts"** (e.g., "Comp sign-ups closing in 5 mins!") that appear on lock screens.
    *   *Value:* Solves the problem of dancers ignoring the MC (Microphone Controller) over the loud music.

3.  **"Share Target" Viral Loop:**
    *   Register Pika! as a share target in `manifest.json`.
    *   *Flow:* User is in Spotify -> Share -> Pika!.
    *   *Action:* Pika! instantly opens and adds that song to the "Request Queue" (if enabled) or "Personal Wishlist".

4.  **"Local Geo-Fencing" (Bluetooth/NFC):**
    *   Use Web NFC (Android) or QR.
    *   *Idea:* Tapping a phone on an NFC sticker at the DJ booth instantly opens the PWA and connects to the current session (zero typing).

5.  **"The Morning After" (Background Sync):**
    *   The app wakes up in the background the next morning (Periodic Sync).
    *   *Action:* It downloads the full "Session Recap" and sends a notification: "Your night in stats is ready. You danced to 45 songs!".
    *   *Value:* Massive retention driver.
