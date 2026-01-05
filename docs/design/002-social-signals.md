# Design Doc 002: Social Signals & Voting (Blurring the Line)

**Status:** APPROVED
**Date:** 2026-01-03
**Author:** Antigravity

## 1. Summary
Transform the audience from "Passive Listeners" to "Active Participants." This feature introduces a real-time feedback loop where dancers can request "Vibes" (not songs), vote on polls, and hype the DJ, while giving the DJ rigorous tools ("Ghost Mode", "Throttling") to manage this input safely.

## 2. User Stories
*   **The Shy Dancer**: As a dancer who is too shy to approach the booth, I want to anonymously request a vibe (e.g., "Too Fast") or signal "More Blues please."
*   **The "Vibe Check"**: As a DJ, I want to poll the room ("Lyrical or Funky?") and see a live result *while mixing* to decide my next track.
*   **The "Late Night" Party**: As a DJ, I want to turn on "Democracy Mode" for 30 minutes where the crowd explicitly picks the genre of every block.

## 3. Core Mechanics

### A. The "Vibe Vote" (Active Polling)
*   **Mechanism**: A "Flash Poll" initiated by the DJ.
*   **Workflow (No Dead Air)**:
    *   DJ sets the poll *during* a song (e.g., "Next block: Funky vs Lyrical?").
    *   Result updates **LIVE** in real-time.
    *   **NO Waiting**: The music never stops. The DJ uses the data to queue the next track instantly.
*   **Duration**: Short (60s max) or manual close. Results disappear after the event (Event-based lifecycle).

### B. "Smart" Requests (Vibe Only - Passive Stream)
*   **Philosophy**: "Don't tell me *what* to play, tell me *how* you feel."
*   **Constraint**: No free-text search (prevents Jukebox behavior).
*   **Grid UI**: Buttons for `⚡️ More Energy`, `🧊 Chill Out`, `🎸 More Blues`, `🐢 Too Fast`.
*   **Decay Logic (The "Half-Life")**:
    *   Requests are not permanent. They fade over **3 songs** (or 10 mins).
    *   If the DJ fulfills it (plays Blues), the crowd stops asking, and old votes decay naturally.

### C. The Feedback Loop (Private vs Public)
*   **Positive Signals (Public)**: "Likes" / Hearts ❤️ broadcast to screens/projectors to hype the room.
*   **Negative Signals (Private)**: "Boring" / "Too Fast" 👎 are visible **ONLY** to the DJ's dashboard to prevent mob shaming.

### D. The "Safety Valve" (Anti-Pressure Measures)
*   **Ghost Mode**: DJ toggles "Listening" OFF. Dancers see "DJ is in flow state 🧘‍♂️" and controls are disabled.
*   **Aggregation Throttling**: DJ never sees "1 person complains." They only see metrics if a *threshold* is met (e.g., >15% of room).
*   **Live Transparency**: Dancers see poll results ("70% voted Blues") so they blame the *community*, not the DJ, if their song isn't played.

## 4. Session Modes & Interaction Matrix
The DJ selects a "Game Mode" for the current block, determining what everyone sees.

| Feature | **Mode 1: "Standard"** (Default) | **Mode 2: "Democracy"** (Late Night) | **Mode 3: "Ghost"** (Competition) |
| :--- | :--- | :--- | :--- |
| **Philosophy** | **DJ is King.** Dancers advise. | **Crowd Control.** Dancers decide. | **Do Not Disturb.** DJ focuses. |
| **DJ View** | Live "Requests" + Private "Boring" Alerts + Throttled Metrics. | **Alert**: "POLL WINNER: BLUES" (Instruction to obey). | Clean Dashboard. "Now Playing" Only. |
| **Dancer View** | "Like" Button + Vibe Request Grid (Active). | **Active Poll**: "Vote Now: Blues vs Pop!" | "DJ is in Flow State" (Controls Disabled). |
| **Projector View** | "Now Playing" + Floating "Hearts" Stream. | **Live Bar Chart**: Poll Results washing over the screen. | "Now Playing" Only. Clean. |

## 5. Technical Architecture
*   **Protocol**: WebSocket (Existing `@pika/cloud`).
*   **Throttling**: 1 vote per device per 30s.
*   **Privacy**: Anonymous `SessionID` (cookie) to prevent ballot stuffing.
