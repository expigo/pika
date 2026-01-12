# Blueprint: Spotify Playlist Integration

This document outlines the **Future Vision** for Spotify playlist generation.
This feature allows DJs to automatically export their history to Spotify for easy sharing.

**Status:** Planned (Post-MVP)
**Original Doc:** `005-spotify-playlist-generation.md` (Archived)

## 1. User Story

As a WCS DJ, after my session ends, I want Pika! to automatically create a Spotify playlist with all the tracks I played.

## 2. Architecture

### Components
*   **Desktop App**: Handles the OAuth PKCE flow and API calls to Spotify.
*   **No Cloud Component**: To avoid sharing DJ credentials with our server, the Desktop App communicates directly with Spotify API.

### Authentication
*   **Protocol**: OAuth 2.0 with PKCE (Proof Key for Code Exchange).
*   **Reasoning**: Secure for public clients (Desktop Apps) without needing a client secret.

### Search Strategy (The Hard Part)
WCS tracks often have varied naming (e.g. "Song (Radio Edit)", "Song - Remastered").
1.  **Exact Match**: `Artist + Title`.
2.  **Fuzzy Fallback**: Remove `(...)` content.
3.  **Artist Match**: `Artist` search, filter results for `Title` similarity > 80%.

## 3. Implementation Phases

1.  **Phase 1: Manual Export**: A button "Export to Spotify" in the Logbook history view.
2.  **Phase 2: Auto-Publish**: Option to auto-create public playlists on session end.
3.  **Phase 3: Link Sharing**: Send the generated Spotify URL to the Cloud server so it can appear on the Recap page.

## 4. Open Questions

1.  **Apple Music:** Demand exists but API is harder. Prioritize Spotify.
2.  **Matching Accuracy:** Handling remixes/covers is difficult. We might need a "Manual Correction" UI.
