# Engagement Feature Specifications

**Status:** Living Document
**Date:** January 15, 2026
**Based on:** `engagement-strategy.md` & Team Discussions

---

## 2. Implemented Measures (Reference)
*See `engagement-strategy.md` for details on features 2.1 - 2.5.*

---

## 3. Short-Term Enhancements (The "Hook")

### 3.1. Floating Social Signals (Web)
*   **Concept:** When users 'Like' a track, animated hearts float up on everyone's screen.
*   **Refinement:** Must be ambient and subtle. "Part of the room's lighting," not a distraction.
*   **Pros:**
    *   Creates "Effervescence" (shared emotional energy).
    *   Visual proof of a "live" room.
*   **Cons:**
    *   Visual clutter on small screens.
    *   Performance cost on low-end devices.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **High**. Requires syncing animations across clients via WebSocket. Pure CSS/JS particles can be CPU intensive on mobile.
> *   **Value:** **Critical**. This is the "killer feature" for "liveness".
> *   **Priority:** **CRITICAL**. Move to v0.2.0.


### 3.2. Dancer Avatars
*   **Concept:** Auto-assigned mascots (e.g., "Groovy Giraffe") for anonymous users.
*   **Refinement:** Allow "Re-roll" once per event. Future: Unlockable avatars.
*   **Pros:**
    *   Humanizes the "Listener Count".
    *   Fun/Humorous tone.
*   **Cons:**
    *   Risk of generating inappropriate names (needs strict allowlist).

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Medium**. Needs a deterministic generator based on ClientID/IP.
> *   **Value:** **Medium**. Adds charm but not essential for MVP functionality.
> *   **Priority:** **Low**. Visual fluff.


### 3.3. Quick Poll Presets (DJ)
*   **Concept:** One-tap buttons for common questions ("Energy Check?", "Too Fast?").
*   **Refinement:** Distinguish between a "Poll Builder" (Settings) and "Triggers" (Live View).
*   **Pros:**
    *   Drastically reduces DJ cognitive load.
*   **Cons:**
    *   Generic questions might feel robotic if overused.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Low**. Frontend-only change to the Poll Builder.
> *   **Value:** **High**. Friction is the enemy of DJ adoption.
> *   **Priority:** **HIGH**. Easy win.


### 3.4. DJ Bio Card
*   **Concept:** Expandable profile header with Instagram/Spotify links.
*   **Refinement:** Optional "Tip Jar" link.
*   **Pros:**
    *   Parasocial connection.
    *   Marketing value for DJs.
*   **Cons:**
    *   Screen real estate usage on mobile.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Medium**. Requires new DB tables for DJ Profile data + Desktop UI to edit it.
> *   **Value:** **High**. DJs will demand this for branding.
> *   **Priority:** **Medium**.


---

## 4. Community Propositions

### 4.1. "Stubborn Dancer" Award (formerly Streak Fire)
*   **Concept:** Recognition for sustained engagement over time.
*   **Refinement:** Time-based (e.g., Active for 30 mins) rather than click-based (3 likes in a row) to match WCS set patterns.
*   **Pros:**
    *   Rewards genuine presence.
*   **Cons:**
    *   Hard to measure "active" without intrusive tracking.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Medium**. Requires tracking "active minutes" server-side per session.
> *   **Value:** **Low**. Doesn't drive "in-the-moment" hype.
> *   **Priority:** **CUT**.


### 4.2. "The Banger Button" (Super Like)
*   **Concept:** A rare, high-value like.
*   **Refinement:** Does NOT consume hearts. Instead, highlights the track in history (Gold Border). "Peak of the Night" marker.
*   **Pros:**
    *   High signal-to-noise ratio for DJs.
    *   Satisfying "crunchy" interaction.
*   **Cons:**
    *   Risk of spam if not rate-limited (e.g., 1 per 15 mins).

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Low**. Similar to standard "Like" but with different weight/cooldown.
> *   **Value:** **High**. DJs love "signal".
> *   **Priority:** **HIGH**.


### 4.3. Unlockable / Event Themes
*   **Concept:** App color schemes match the event brand (e.g., Halloween Orange).
*   **Refinement:** Potential monetization (Paid Themes) or Organizer branding perk.
*   **Pros:**
    *   Monetization avenue.
    *   Delights organizers.
*   **Cons:**
    *   Maintenance of multiple CSS themes.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **High**. Tailwind CSS variables can handle this, but managing the assets is pain.
> *   **Value:** **Medium**. Nice for Events, useless for weekly gigs.
> *   **Priority:** **Low**.


### 4.4. "Partner Beacon" (Downtime Utility)
*   **Concept:** Toggle "Looking for a dance" → Device glows green.
*   **Refinement:** Explicitly for "Downtime" (sitting at table). Acts as a digital flag.
*   **Pros:**
    *   Solves real social friction (shyness).
    *   Utility beyond music.
*   **Cons:**
    *   Could be misinterpreted (dating signal?). Needs clear copy: "Dance Partner".

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Low**. Simple client-side state + WS broadcast.
> *   **Value:** **EXTREME**. Solves a massive real-world pain point in WCS.
> *   **Priority:** **HIGH**.


### 4.5. "Who's Here?"
*   **Concept:** List of present users.
*   **Refinement:** **SAFETY CRITICAL.** "Friends Only" (Mutuals) or strict Opt-In. Start with "Friends".
*   **Pros:**
    *   Deep tribal bonding.
*   **Cons:**
    *   Stalking risk. Must be handled with extreme care.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **High**. Requires Auth for Dancers (currently anon).
> *   **Value:** **Medium**.
> *   **Priority:** **CUT** (Privacy risk too high for now).


### 4.6. "Newbie Mode" (Education)
*   **Concept:** Overlay explaining current genre/rhythm. "Rhythm: 1-2-3-and-4".
*   **Refinement:** Toggleable. Educational tool.
*   **Pros:**
    *   Welcoming to beginners.
*   **Cons:**
    *   Complex to implement (needs precise beatgrid data).

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Extreme**. We don't have accurate beatgrid data, only BPM.
> *   **Value:** **Medium**.
> *   **Priority:** **CUT**.


### 4.7. Tempo Graph
*   **Concept:** User-facing BPM history.
*   **Refinement:** Hide behind "Nerd Mode" or "Stats" tab to avoid clutter.
*   **Pros:**
    *   Transparency for dancers managing energy.
*   **Cons:**
    *   Information overload for casuals.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Medium**. We have the data, just need a charting lib (Recharts).
> *   **Value:** **Medium**. "Nerds" love it, others don't care.
> *   **Priority:** **Low**.


### 4.8. "Organizer Complaint Box"
*   **Concept:** Direct feedback channel for logistics (AC, Water, Sound).
*   **Refinement:** Routed to Organizer, NOT DJ.
*   **Pros:**
    *   Vents frustration productively.
*   **Cons:**
    *   Someone has to read/act on it.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **High**. Who receives this? The DJ? They are busy. The Organizer? They aren't logged in.
> *   **Value:** **Low**.
> *   **Priority:** **CUT**.


### 4.9. [CUT] Predictive Analytics
*   *Verdict:* **Removed.** Confusing UX ("Is this playing now?") and spoils DJ surprises.

### 4.10. "Set Souvenir"
*   **Concept:** Generated image summary of the night.
*   **Refinement:** Data-rich: "Top Genre: Blues", "Shared 5 Loves", "Ranking: Top 10%".
*   **Pros:**
    *   Viral growth loop (Instagram Stories).
*   **Cons:**
    *   Requires generating images client-side or server-side (resource intensive).

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **High**. Generating images server-side is heavy.
> *   **Value:** **High**. Viral growth loop.
> *   **Priority:** **Medium** (Post-MVP).


---

## 5. Expert Propositions (The Frontier)

### 5.11. "Flash Sync" (Ritual)
*   **Concept:** Synchronized screen color change on "Drop".
*   **Refinement:** **SAFETY:** No strobing. Slow "Breathing" fade-in/out only.
*   **Pros:**
    *   Massive "Stadium" feel.
*   **Cons:**
    *   Epilepsy risk if bugged. Needs hard constraints.
    *   Requires low latency (<50ms) to feel good.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Extreme**. Latency variance across 100+ 4G phones makes "sync" impossible without NTP time server logic.
> *   **Value:** **High** (The "Taylor Swift Bracelet" effect).
> *   **Priority:** **Low** (Tech demo only).


### 5.12. "Vibe Meter"
*   **Concept:** Continuous "Chill <-> Hype" slider.
*   **Refinement:** Low-friction "Check-in". Prompts user once per 30m: "How's the vibe?" → Swipe → Gone.
*   **Pros:**
    *   Qualitative data (Mood) vs Quantitative (BPM).
*   **Cons:**
    *   Another interrupt on the dancefloor.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Medium**.
> *   **Value:** **Medium**.
> *   **Priority:** **Medium**.


### 5.13. "Guess the BPM"
*   **Concept:** Mini-game during intro. "90 or 100?".
*   **Refinement:** Great for "Water Break" moments.
*   **Pros:**
    *   Gamifies musicality.
*   **Cons:**
    *   Distraction if played while dancing.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Medium**.
> *   **Value:** **Low**.
> *   **Priority:** **Low**.


### 5.14. "DJ Context" Push
*   **Concept:** DJ sends text to screen ("Rare Remix!").
*   **Refinement:** "Toast" notification pattern. Top banner, slides in, waits 10s, slides out.
*   **Pros:**
    *   Educational authority.
*   **Cons:**
    *   DJ typing while mixing is hard (needs presets).

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Low**. We already have announcements!
> *   **Value:** **High**.
> *   **Priority:** **HIGH** (Already partially implemented).


### 5.15. "Leader vs. Follower" Battle
*   **Concept:** Polls split by dance role.
*   **Refinement:** Implemented as a **Poll Type** in the Builder.
*   **Pros:**
    *   Fun rivalry. Interesting data.
*   **Cons:**
    *   Requires users to self-identify role (extra click).

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Medium**.
> *   **Value:** **Medium**.
> *   **Priority:** **Low**.


### 5.16. Unlockable Avatars
*   **Concept:** Earn avatars by engagement.
*   **Refinement:** Run "Community Design Contests" to source assets.
*   **Pros:**
    *   Long-term retention hook.
*   **Cons:**
    *   Need asset pipeline.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **High**.
> *   **Value:** **Medium**.
> *   **Priority:** **Low**.


### 5.17. "Last Call" Mode
*   **Concept:** UI theme change for last 3 songs.
*   **Refinement:** Visual language: Sunset Gradient or Gold Border. Universal signal.
*   **Pros:**
    *   Creates urgency/hype.
*   **Cons:**
    *   DJ must remember to trigger it.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Low**. Just a global state flag.
> *   **Value:** **High**.
> *   **Priority:** **HIGH**.


### 5.18. Collaborative Cooldown
*   **Concept:** Crowd votes for the last song.
*   **Refinement:** "Queue Battle". DJ queues 3 tracks, winner loads to deck.
*   **Pros:**
    *   Peak-End Rule satisfaction.
*   **Cons:**
    *   Technical complexity (V-DJ integration).

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **Extreme**. We cannot write *to* the DJ software, only read.
> *   **Value:** **Medium**.
> *   **Priority:** **CUT** (Technically impossible with current architecture).


### 5.19. Post-Set Summary
*   **Concept:** End-of-session anonymous report card.
*   **Specs:** "You engaged with [X] songs", "Your Vibe: [Genre]", "Rank: [Top X%]".
*   **Pros:**
    *   Closure. Gamification.
*   **Cons:**
    *   Needs user to check phone *after* the music stops.

> [!NOTE] 
> **Audit Assessment (Jan 2026)**
> *   **Complexity:** **High**. Needs data aggregation logic.
> *   **Value:** **Medium**.
> *   **Priority:** **Medium**.


---

## 6. UI/UX Audit Proposals (Jan 2026)

### 6.1. "Hype-O-Meter" (Audio Visualizer)
*   **Concept:** A subtle background animation that reacts to the music's volume/energy.
*   **Technical:** Web Audio API is overkill and restricted by browsers (needs user gesture).
*   **Solution:** **Fake it.** Use the *BPM* to drive a CSS pulsing animation. 90 BPM = slow breathe, 120 BPM = fast pulse.
*   **Value:** Makes the app feel "alive" and connected to the sound, even if it's just a sync trick.

### 6.2. "Song Requests" (Structured)
*   **Problem:** Dancers always want to request songs, but DJs hate being interrupted.
*   **Concept:** A specific "Request" tab.
    *   User searches iTunes/Spotify API (or just text entry).
    *   **Rate Limit:** 1 request per 30 mins per user.
    *   **DJ View:** A separate list. Can "Ack" (thumbs up), "Later" (clock), or "No" (X).
*   **Value:** High utility. Keeps DJs sane.

### 6.3. "Light Mode" (Day Party Support)
*   **Problem:** Pika! is hardcoded to Dark Mode. WCS events often have pool parties or afternoon comps outside.
*   **Proposal:** Add `light:` variants to all Tailwind utility classes.
*   **Priority:** High for Summer events.
