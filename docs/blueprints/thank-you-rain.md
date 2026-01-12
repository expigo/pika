# Blueprint: Interaction - "Thank You" Rain

**Use Case:** The "End of Night" Ritual.
**Problem:** Dancers often leave without getting to say thanks to the DJ, or the DJ is too busy packing up.
**Solution:** A digital avalanche of appreciation.

## 1. The Interaction

### Dancer Side (Mobile)
*   **Trigger:** Available anytime, but highlighted when DJ sets status to "Last Song" or manually triggers "Closing Time".
*   **UI:** A "Send Thanks 💖" button (Floaty Action Button?).
*   **Feedback:** When clicked, button particles explode locally. Maybe a cooldown (5s) to prevent spamming APIs?

### DJ Side (Desktop Overlay)
*   **Visual:** A `Canvas` or `HTML` overlay on top of the Pika! Dashboard.
*   **Animation:** Confetti/Heart particles falling from top of screen.
*   **Physics:** 1 click = 5-10 particles. 50 clicks = A storm.
*   **Sound:** Subtle "pop" or "chime"? (Maybe too annoying? Default to Silent).

## 2. Technical Implementation

### A. WebSocket Event
*   **Message:** `TYPE: SOCIAL_SIGNAL`, `payload: { kind: "THANK_YOU" }`.
*   **Aggregation:** To save bandwidth, client can batch clicks? Or Server creates a "storm" broadcast if many come in at once?
    *   *Simple MVP:* 1 click = 1 message broadcast to DJ. DJ client handles the particle generation.

### B. Frontend (Desktop)
*   **Library:** `canvas-confetti` (Lightweight, popular).
*   **Z-Index:** Highest. Covers the playlist/analytics.
*   **Perf:** Ensure it doesn't lag the audio processing (render in RAF loop).

## 3. Risks
*   **Spam:** A user scripting a loop to crash the DJ app.
*   **Mitigation:** Server-side rate limit (max 10 'thanks' per IP per minute).
