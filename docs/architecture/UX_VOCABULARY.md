# Pika! Pro UX Vocabulary & Design Language

This document defines the terminology and design principles introduced in the **Pro Polish (v0.2.0)** overhaul. This vocabulary ensures consistency across the Cloud, Desktop, and Web components.

---

## 1. 🎨 The Design Language: "Slate & Neon"

The "Slate & Neon" aesthetic is designed for low-light venue environments (DJ booths and dance floors).

*   **Core Palette:** Slate-950 (Deep background), Slate-800/900 (Container borders), Purple-500/Red-500 (Functional neon highlights).
*   **Aesthetics:** 
    *   **Glassmorphism:** Light background blurs for depth.
    *   **Interactive Glows:** Subtle outer glows when elements have high momentum.
    *   **Italicized Black Typography:** High-impact, energetic headings (e.g., "LOBBY", "RECAP").

---

## 2. 📖 Vocabulary Index

| Term | Domain | Definition | User-Facing Usage |
| :--- | :--- | :--- | :--- |
| **Sync** | Engagement | A "Like" or vote. Represents the dancer and DJ being in sync. | "42 Syncs", "Total Syncs" |
| **Pulse** | Analytics | The live state or historical flow of data across the network. | "Lobby Pulse", "Pulse Chronology" |
| **Chronology** | History | A tracklist that emphasizes time and flow over simple position. | "Pulse Chronology" |
| **Momentum** | Algorithmic | A score (0-1) based on listener count + like density. | "Peak Momentum" |
| **Lobby** | Navigation | The central discovery hub for active DJ sets. | "/live" URL |
| **Journal** | Personal | A dancer's personal history of synced tracks. | "/my-likes" URL |
| **Booth** | Professional | The DJ's public page: bio, upcoming gigs, playlists, Follow. (Supersedes "Showcase".) | "/dj/[slug]" URL, "Visit the booth"; "Manage your booth" → /dj/booth |
| **DJ Workspace** | Professional | The authed DJ pair /dj/booth (manage: profile, playlists, Signature, insights) + /dj/live (broadcast), joined by a persistent Booth ⁄ Broadcast pill-nav at all widths (D.1). | Pill-nav on both pages |
| **Broadcast** | Professional | The nav label for /dj/live — the focused web-broadcast surface (connect Spotify, go live, dancer mirror). | "Broadcast" pill in the DJ workspace nav |
| **Follow** | Relationship | The durable dancer→DJ edge (account-keyed; Slice C). | "Follow" / "Following" button |
| **Night Recap** | Retention | The morning-after email: your loved songs + the floor's top 3. | "Night recap emails" toggle |
| **Night Card** | Growth | A shareable 1080×1920 story image of the night (QR → Booth). | "Night Card" button on the recap |
| **Signature** | Identity | The Booth's computed "what to expect" card: BPM/energy/mood **ranges** (never single numbers) + era chips over published sets + promoted playlists (Slice D). Always carries its load-bearing denominator line; the DJ can hide it. | "Signature." card on the Booth, toggle in Booth manager |
| **Crowd-Pleasers** | Analytics | DJ-private leaderboard: which of my tracks drew floor love (Syncs per play). | "Crowd-pleasers." card on /dj/live |
| **Your Match** | Relationship | Signed-in dancer↔DJ overlap card: "You've loved N songs this DJ plays." Renders only at ≥3 shared tracks. | Compat card on the Booth |
| **"⚡ Played live on Pika"** | Provenance | Badge for live-derived playlists (`source='profile'`) — the earned prize. | Booth playlist cards, playlist manager |
| **"DJ's pick"** | Provenance | Badge for imported playlists (`source='csv'`) — neutral-positive; NEVER say "Imported". | Booth playlist cards, playlist manager |
| **Vibe Temp** | Community | The average BPM across all active sessions in the lobby. | "Avg Vibe: 102 BPM" |
| **Sticky Window** | Architecture | The 5-minute period where a disconnected client still counts as "Live". | Developer only |

---

## 3. 🧩 Component Identity

### `ProCard`
The foundational container.
- **Normal:** Subtle slate border.
- **Glow:** Purple/Indigo outer glow (used for "Peak Moment" or "Active Room").

### `VibeBadge`
Compact stat display with functional coloring:
- **Red:** Hearts / Likes / Hot Momentum.
- **Purple:** BPM / Analysis.
- **Slate:** Metadata / Listener Counts.

---

## 4. 💡 UX Philosophy
1.  **"Pocket-Friendly":** UI must accommodate users who "pocket" their phone for a dance (the **Sticky Window**).
2.  **Zero-State Pride:** Even when no DJs are live, the lobby should feel like a premium "Waiting Room" (the **Discovery Hub**).
3.  **Low Friction:** Navigation should be thumb-accessible via the **BottomNav** for PWA users.
