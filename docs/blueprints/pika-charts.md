# Design Document 010: Pika! Charts (WCS Data Platform)

**Version:** 4.0.0
**Created:** 2026-01-11
**Status:** Approved for implementation
**Goal:** Establish Pika! as the data authority for West Coast Swing music.

---

## 1. Executive Summary

**Pika! Charts** is a strategic initiative to transform Pika! from a DJ utility into a community platform. It acts as the "Billboard Charts" for the West Coast Swing genre, aggregating data from curators to visualize trends, history, and connections.

### 1.1 Value Proposition
*   **For Dancers:** "What is everyone dancing to right now?" (Discovery) / "Find my DJ soulmate." (Connection)
*   **For Curators (DJs):** "Influence." Being listed validates their taste. provides feedback loop on their selections.
*   **For Organizers:** "Data." See global trends to book the right DJs or play the right music.
*   **For Pika!:** "Growth." The charts are shareable, viral content that drives traffic to the web app for free.

---

## 2. Architecture & Data Strategy

### 2.1 The "Two-Page" Strategy
We serve two distinct audiences with the same data:

1.  **`/charts` (Marketing & Fun)**
    *   **Audience:** Dancers, Casual Users.
    *   **Vibe:** "Billboard Top 40", colorful, "Spotify Wrapped" aesthetic.
    *   **Content:** "Trending Now", "Viral Hits", "Tastemaker of the Month".
2.  **`/explorer` (The Music DB)**
    *   **Audience:** DJs, Researchers, Power Users.
    *   **Vibe:** "Data Grid", filters, search, "Discogs" aesthetic.
    *   **Content:** Raw searchable database, history graph, remix linking.

### 2.2 Ingestion Architecture (Static Generation)
To respect Spotify rate limits and ensure performance, we use a **Scheduled Static Generation** model.

```
┌─────────────┐    ┌────────────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ Spotify API │ -> │ Ingest Script (Cron)   │ -> │ Dedupe & Score  │ -> │ Static JSON DB   │
└─────────────┘    └────────────────────────┘    └─────────────────┘    └─────────┬────────┘
                                                                                  │ (Build Time)
                                                                                  ▼
                                                                        ┌──────────────────┐
                                                                        │ Next.js Frontend │
                                                                        │ (SSG Pages)      │
                                                                        └──────────────────┘
```

### 2.3 Data Logic
*   **Deduplication (Critical):** We MUST normalize tracks to avoid splitting votes.
    *   *Rule:* Normalize Title/Artist strings (lowercase, remove "feat.", remove brackets).
    *   *Match:* `(NormTitle + NormArtist)`
    *   *Exception:* Do NOT merge "Remix", "Acoustic", or "Zouk Version". These are distinct musical entities in WCS.
*   **Quality Control (Whitelist):** We only index playlists explicitly named "WCS", "Swing", "Blues", or flagged manually. We ignore "Gym" or "Study" playlists from the same user.

### 2.4 Desktop → Cloud Integration (Planned)
*   **Tags Schema:** Desktop app will migrate to normalized `tags` + `track_tags` join tables (cloud-ready).
*   **Suggested Tags:** Cloud will provide `suggested_tags` table with community tag popularity.
*   **Sync Flow:** Personal tags upload ↑, community suggestions download ↓.
*   **trackKey:** Already using `artist::title` format for cross-DJ deduplication.

---

## 3. The 40-Feature Roadmap

### Group A: Inbound Trends (The "Pulse")
1.  **The "Momentum" Graph 📈**: Visualize `PlaylistAddCount` over time (Exponential Moving Average).
2.  **"New Discoveries" 🔭**: Tracks added to >2 playlists in the last 7 days.
3.  **"The Deep Cuts" 🕵️‍♀️**: Low Spotify Popularity (<10) but high WCS adoption.
4.  **"The 'Vintage' Revival" 🕰️**: Old tracks (Released <2010) suddenly trending.
5.  **"One-Hit Wonders" 🌠**: Artists with exactly one high-ranking song in the community.
6.  **"Regional Flavors" 🌍**: Compare "Europe Top 10" vs "USA Top 10".
7.  **"Genre Drift" Analysis 🌊**: Visualize aggregate genre shifts (Pop -> Blues) over years.
8.  **"Playlist Archetypes" 🧬**: Cluster analysis (e.g., "Late Night" vs "Competition").
9.  **"Rapid Risers" 🚀**: Tracks added to >3 playlists in <24 hours.
10. **"The Time Machine" 📅**: "View Charts from Jan 2019".

### Group B: Connection & Personalization (Positive Vibes)
11. **"Your DJ Soulmate" 💘**: Paste your Spotify link -> Find a DJ with 90% overlap.
12. **"DJ Venn Diagram" 🟠**: Visual overlay of two curators' libraries.
13. **"Practice Partner Sync" 👯**: Intersect two users' profiles to find "Common Ground" songs.
14. **"Musical Archetypes" 🔮**: "Badge" system (e.g., "The Purist", "The Futurist").
15. **"The Event Compass" 🧭**: Recommend events based on music taste alignment.
16. **"The 'Bridge' Tracks" 🌉**: "If you like Pop, here is a Blues song with Pop structure."
17. **"Vibe Search" 🔍**: "Find a playlist that feels 'Cozy'."
18. **"Chain Reaction" 🔗**: Analysis of "Which song usually follows Song X?".
19. **"Cross-Pollination" 🐝**: Tracks appearing in both WCS and Zouk/Hustle lists.
20. **"The 'Fresh' Ratio" 🥗**: % of New Releases vs Classics in a profile.

### Group C: Outbound (Writing the Narrative)
21. **"Set-to-Spotify" Export 🖱️**: One-click export Pika! set to Spotify.
22. **"The Set Reconstruction" 🧠**: Smart UI for Local MP3 -> Spotify ID fuzzy matching.
23. **"Spotify Canvas" Generator 🎨**: Auto-generate IG Story assets for a set.
24. **"Listener History" Sync 🎧**: Dancers' "Likes" auto-sync to their Spotify.
25. **"The White Label" Service 🏢**: Auto-export event sets to Organizer Brand Accounts.
26. **"Playlist Health Check" 🏥**: Tool for DJs ("You have 5 deleted tracks").
27. **"Where Can I Buy This?" 🛍️**: Direct links to Bandcamp/Amazon.
28. **"Automatic Mix Recorder" ⏺️**: Generate `.cue` files from Pika! timestamps.
29. **"Long-Tail Heroes" 🦸**: Highlighting DJs who play diverse/unique tracks.
30. **"Dancer 'Wishlist' Heatmap" 🔥**: Pre-event aggregate requests.

### Group D: The Oracle (Advanced Metadata)
31. **"The True BPM" Oracle**: Crowd-sourced, human-verified BPMs.
32. **"Energy Flow" Visualizer**: Cloud-based energy waveform rendering.
33. **"The Remix Hunter"**: Identification of specific unreleased remixes.
34. **"Set 'Vibe' Similarity"**: Recommendation engine based on Energy profiles.
35. **"Global Play History"**: "You played this 3x in this city."
36. **"The 'Do Not Play' List"**: Event rules/warnings.
37. **"Harmonic Leaderboard"**: Gamification of key mixing.
38. **"Lyrical Themes"**: Tagging songs by topic (Love, Breakup).
39. **"Geographic Insights"**: Map visualization of where tracks are breaking.
40. **"The WCS Index"**: A single composite score of the genre's "Health" (Diversity/Newness).

---

## 4. Implementation Ladder (The "Sunday Project" Plan)

To ensure this fun side project remains manageable, we implement in strict iterations.

**Step 1: "Hello World" (Script Only)**
*   **Goal:** Fetch data, save raw JSON.
*   **Task:** `scripts/ingest-wcs-trends.ts`. Hardcode 3 playlists. Console log results.
*   **Duration:** ~2 hours.

**Step 2: "The Static List" (Frontend)**
*   **Goal:** Visual proof.
*   **Task:** Create `/charts/page.tsx` rendering the raw JSON.
*   **Duration:** ~2 hours.

**Step 3: "The Database" (History)**
*   **Goal:** Time-series data.
*   **Task:** Connect script to Postgres. Save "First Seen" dates.
*   **Duration:** ~3 hours.

**Step 4: "The Tweak" (Algorithms)**
*   **Goal:** Better insights.
*   **Task:** Implement "Deep Cuts" logic and "Dedupe" logic with TDD.
*   **Duration:** Open ended.

**Step 5: "The Interface" (Music DB)**
*   **Goal:** Power user tool.
*   **Task:** Create `/explorer` page with search and filters.
*   **Duration:** ~4 hours.

---

## 5. Quality Assurance

**TDD Policy:**
*   We use **Test Driven Development** for the `TrendAnalyzer` logic.
*   We **Mock** all Spotify API responses in tests (`fixtures/spotify`).
*   We verify our "Deduplication Rules" against known edge cases (e.g., "The Kungs Remix").
