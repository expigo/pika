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
| **Showcase** | Professional | A DJ's public-facing professional profile and archive. | "/dj/[slug]" URL |
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
