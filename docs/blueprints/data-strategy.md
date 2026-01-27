# Pika! Data Strategy: The WCS Intelligence Platform

**Date:** 2026-01-27
**Status:** DRAFT (Concept Phase)
**Vision:** Transforming Pika! from a live tool into the definitive data source for West Coast Swing music trends.

---

## 1. The Core Concept: "Smart Crate" Digitization

Currently, DJ setlists are ephemeral. They exist as history files on a laptop or screenshots on Facebook. Pika! captures this data in real-time, but it is "raw" (Artist - Title text strings).

**The Strategy:** Turn raw string data into **Structured Entities** (Spotify URIs, ISRC codes, Audio Fingerprints) using a Human-in-the-Loop workflow.

### The "Smart Crate" Workflow

1.  **Capture (Real-time):**
    *   DJ plays track.
    *   Sidecar analyzes audio (BPM, Energy, Key).
    *   Cloud stores raw string: "Ed Sheehan - Shape of You (Remix)".

2.  **Enrichment (Post-Set Async):**
    *   System fuzzy-matches text against Spotify/Apple Music APIs.
    *   System checks internal "Fingerprint Database" (Has anyone played this file hash before?).

3.  **Verification (The DJ's Role):**
    *   DJ opens "Set Recap" in Pika Desktop.
    *   System highlights **Low Confidence Matches**.
    *   DJ confirms or manual-searches the correct track.
    *   **Incentive:** "Confirm these 3 tracks to export your setlist to Spotify automatically."

4.  **Consolidation (The Golden Record):**
    *   The link between `AudioHash:XYZ` and `SpotifyURI:123` is saved globally.
    *   *Next time ANY DJ plays this file, it is 100% identified instantly.*

---

## 2. The Product: "WCS Dashboard" (Global Charts)

With clean data, we build the **Billboard Charts of WCS**.

### Target Audience & Value Proposition

| Role | Responsibility | Gain (Product Value) |
| :--- | :--- | :--- |
| **The DJ** | Curator of the music. | **Discovery:** "What is trending in Europe right now?" <br> **Convenience:** instant export to Spotify/Apple Music. <br> **Reputation:** "I broke that song first." (Trendsetter badges). |
| **The Dancer** | Consumer of the experience. | **Recall:** "What was that amazing Blues song last night?" <br> **Personal Stats:** "My 2026 Wrapped: I danced to 500 hours of music." |
| **The Organizer** | Host of the event. | **Compliance:** Automatic generation of PRO (Copyright) reports. <br> **Quality Control:** "Are my DJs playing fresh music or just top 40?" |
| **The Community** | The ecosystem. | **Truth:** A definitive, data-backed list of "Top WCS Songs of 2026". |

---

## 3. Five Key Opportunities (Powered by this Data)

### Opportunity A: The "WCS Billboard 100"
*   **Concept:** Automated weekly charts based on actual play counts across all Pika! enabled events globally.
*   **Viral Loop:** DJs share "I had 3 tracks in the Top 10" on social media.

### Opportunity B: Vibe-Based Recommendation Engine
*   **Concept:** "You liked 'Cold Heart'. Here are 5 other tracks with High Energy (8/10) and Groove (Swing) but slower Tempo (90 BPM)."
*   **Tech:** leveraging the Librosa/Essentia analysis vectors stored in `played_tracks`.

### Opportunity C: Copyright Compliance Automation (Monetization)
*   **Concept:** Events pay PROs (ASCAP/BMI/GEMA) based on music played. Currently, this is estimated.
*   **Product:** Pika! generates a CSV export of "Every song played, timestamped, with ISRC codes."
*   **Revenue:** B2B SaaS feature for Organizers.

### Opportunity D: Dancer's "Year in Review"
*   **Concept:** Spotify Wrapped, but for *physical dancing*.
*   **Data Source:** `User Attendance (Stage Topic)` + `DJ Logbook`.
*   **Output:** "You were on the floor for 42 hours. Your favorite BPM is 105."

### Opportunity E: "The Remix Hunter"
*   **Concept:** Identifying the "Unshazamable" tracks.
*   **Logic:** Tracks that have high play counts in Pika! but **Zero matches** on Spotify.
*   **Value:** Highlights the exclusive remixes and "White Label" culture of WCS.

---

## 4. Technical Requirements

### New Infrastructure
*   **Fuzzy Matching Service:** A worker process to query external APIs (Spotify/Apple) safely (rate limited).
*   **Global Track Repository:** A central database table `global_tracks` that links `fingerprint_hash` <-> `external_ids`.
*   **Vector Database (Optional):** For "Vibe Match" (e.g. pgvector for Postgres) to store audio analysis embeddings.

### Data Privacy
*   **DJ Setlists:** Some DJs safeguard their "Secret Weapons".
*   **Policy:** Allow DJs to mark specific tracks as "Private/Do Not List" in public charts, but still count towards aggregate statistics (anonymized).

---

## 5. Phasing

*   **Phase 1:** "Smart Crate" (DJ Tool). Focus on the UI for manual verification.
*   **Phase 2:** "The Global Hash" (Backend). Start linking file hashes across different DJs.
*   **Phase 3:** "The Dashboard" (Public). Read-only charts and trends.
