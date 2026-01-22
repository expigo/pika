# Blueprint: The Dance Music Library & Global Registry

## 1. Vision: From Utility to Community Destination

This document outlines the transition of Pika! from a live-set utility into a **unified community music platform**. The goal is to solve the "disappearing music" problem in the dance scene by creating a permanent bridge between the dance floor and personal streaming services (Spotify/Apple Music).

**Status:** Brainstorming / Vision
**Core Concept:** Use the "manual ground-truth" work DJs already do to fuel a global, crowdsourced music intelligence engine.

---

## 2. The Problem to Solve

1.  **For Dancers**: Songs "liked" on the floor are often forgotten or hard to find later. Current `/my-likes` are ephemeral and disconnected from where dancers actually listen to music.
2.  **For DJs**: Preparing and sharing setlists is a repetitive manual chore. Their impact on the "popularity" of a track is unquantified.
3.  **For the Scene**: There is no "Canonical Database" for West Coast Swing music. Metadata is messy, and remixes are hard to track across different platforms.

---

## 3. The Solution: The "Shadow Library" & Global Registry

### A. The Dancer's Library (The Collection)
Dancers transition from active listeners to active curators.
*   **The Musical Journal**: A persistent, account-based collection of every song they've ever liked at a dance.
*   **Sync to Cloud**: One-click "Sync to Apple Music/Spotify" that automatically adds floor-likes to a dedicated Pika! playlist on their streaming service of choice.
*   **Vibe Discovery**: Recommendations based on their liked history, but filtered through the "WCS Lens" (BPM, Energy, and what's trending in the local community).

### B. The DJ's "Influencer" Dashboard
DJs become the architects of the community library.
*   **The Verification UI**: Pika! helps automated the setlist creation by suggesting tracks. When a DJ manually corrects a track or pastes their Spotify link, they "Verify" that track for the entire Pika! ecosystem.
*   **Impact Analytics**: DJs can see how many people "added to their library" after hearing a track in their set. They get credit for spreading new music.

### C. The Global Music Registry (GMR - The Brain)
A crowdsourced, de-duplicated database that maps:
*   `Messy DJ Filename` ➔ `Canonical Registry ID` ➔ `ISRC Code` ➔ `Platform IDs (Spotify/Apple)`.
*   **Crowdsourced Matching**: Once *one* DJ maps a file to a Spotify link, every future DJ playing that file (or a dancer liking it) gets the link automatically.

---

## 4. The "Manual-to-Magic" Feedback Loop

1.  **The Ingestion**: A DJ plays a set. Pika! captures the messy local metadata.
2.  **The Manual Bridge**: The DJ (who is already creating a Spotify playlist for social media) links it to their Pika! Recap.
3.  **The Learning**: Pika! scrapes that link and updates the **Global Registry**, mapping those specific file names to canonical streaming IDs.
4.  **The Value Unlock**: 
    - **Dancers** who "liked" those songs suddenly see "Available on Apple Music" buttons.
    - **The Scene** gets a real-time "Trending" chart based on actual floor data, not just general streaming stats.

---

## 5. Ecosystem Impact

*   **Network Effect**: Every new DJ and Dancer makes the "Registry" more accurate.
*   **Data Moat**: Pika! becomes the only place with a "WCS Ground Truth" database (Knowing which songs are good for WCS, their actual danced BPM, and their floor energy).
*   **Community Identity**: Users can eventually share their "Dance Library" publically, creating a social network centered around the "vibe" of the dance.

---

## 6. Future Roadmap

1.  **Dancer Accounts**: Moving from anonymous `clientIds` to persistent user profiles.
2.  **The Scraper**: Automation to pull metadata from DJ-linked Spotify/Apple Music playlists.
3.  **The Global ID Table**: Implementing the `registry_tracks` schema in the Cloud database.
4.  **Community Analytics**: Launching "Global Floor Charts" (The most liked songs across all sets globally).
