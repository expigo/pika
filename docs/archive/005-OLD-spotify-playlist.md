# Design Document 005: Spotify Playlist Generation

**Status**: Planned (Post-MVP)  
**Created**: 2026-01-04  
**Author**: Antigravity  
**Related**: [011-future-infrastructure-roadmap.md](./011-future-infrastructure-roadmap.md)

## Overview

Automatic Spotify playlist generation after DJ sessions, allowing DJs to share professional playlists with dancers and attendees. This is a common practice in the West Coast Swing community where DJs share their setlists after events.

## User Story

As a WCS DJ, after my session ends, I want Pika! to automatically create a Spotify playlist with all the tracks I played, so I can easily share it with dancers on Facebook, the event page, or dance community groups.

## Architecture

### Components

```
┌─────────────────────┐     ┌─────────────────────┐
│   Desktop App       │     │    Spotify API      │
│  ┌───────────────┐  │     │                     │
│  │ SpotifyAuth   │◄─┼─────┼─► OAuth 2.0 PKCE    │
│  │ (one-time)    │  │     │                     │
│  └───────────────┘  │     │                     │
│  ┌───────────────┐  │     │                     │
│  │ Session End   │──┼─────┼─► Search API        │
│  │ Playlist Gen  │  │     │   /v1/search        │
│  └───────────────┘  │     │                     │
│         │           │     │                     │
│         ▼           │     │                     │
│  ┌───────────────┐  │     │                     │
│  │ Create        │──┼─────┼─► Playlist API      │
│  │ Playlist      │  │     │   /v1/users/{id}/   │
│  └───────────────┘  │     │   playlists         │
└─────────────────────┘     └─────────────────────┘
```

### Authentication Flow

1. **One-time Setup** (Settings screen):
   - DJ clicks "Connect Spotify"
   - Opens OAuth popup: `accounts.spotify.com/authorize`
   - Uses PKCE flow (no client secret needed)
   - Scopes: `playlist-modify-public playlist-modify-private`
   - Callback via deep link or localhost redirect
   - Store refresh token in secure storage

2. **Token Refresh**:
   - Access tokens expire in 1 hour
   - Automatically refresh using stored refresh token
   - If refresh fails, prompt re-authentication

### Playlist Generation Flow

```
Session Ends
    │
    ▼
┌─────────────────────────────────────┐
│ Get all tracks from session         │
│ (from local DB: plays table)        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ For each track:                     │
│   Search Spotify:                   │
│   GET /v1/search?q={artist}+{title} │
│   &type=track&limit=1               │
│                                     │
│   If found: store Spotify URI       │
│   If not found: add to "not found"  │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Create playlist:                    │
│ POST /v1/users/{user_id}/playlists  │
│ {                                   │
│   name: "{DJ Name} @ {Event Date}", │
│   description: "Played via Pika!",  │
│   public: true                      │
│ }                                   │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Add tracks:                         │
│ POST /v1/playlists/{id}/tracks      │
│ { uris: ["spotify:track:xxx", ...] }│
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Show result:                        │
│ "Playlist created! 14/17 tracks"    │
│ [Copy Link] [Open in Spotify]       │
│                                     │
│ Not found:                          │
│ - "RemixName (Special Edit)"        │
│ - "Local File Track"                │
└─────────────────────────────────────┘
```

## Implementation Details

### 1. Spotify App Registration

Register at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):

```
App Name: Pika! WCS DJ Tool
Description: Real-time DJ companion for West Coast Swing events
Redirect URIs:
  - http://localhost:8888/callback (development)
  - pika://spotify-callback (production - deep link)
```

### 2. Data Models

```typescript
// packages/desktop/src/types/spotify.ts

interface SpotifyAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // Unix timestamp
  userId: string;
}

interface SpotifyTrackMatch {
  localTrack: { artist: string; title: string };
  spotifyUri: string | null;  // null if not found
  confidence: number;  // 0-1 match confidence
}

interface PlaylistResult {
  playlistId: string;
  playlistUrl: string;
  tracksAdded: number;
  tracksTotal: number;
  notFound: Array<{ artist: string; title: string }>;
}
```

### 3. Search Strategy

WCS tracks often have variations in naming. Search strategy:

1. **Exact search**: `{artist} {title}`
2. **Fuzzy fallback**: Remove parenthetical content
   - "Song Title (Radio Edit)" → "Song Title"
3. **Artist-only fallback**: Search artist + partial title
4. **Accept best match** if similarity > 0.8

```typescript
async function findSpotifyTrack(
  artist: string, 
  title: string
): Promise<SpotifyTrackMatch> {
  // Try exact search
  const exactQuery = `${artist} ${title}`;
  let result = await spotifySearch(exactQuery, "track", 1);
  
  if (result.tracks.items.length > 0) {
    return {
      localTrack: { artist, title },
      spotifyUri: result.tracks.items[0].uri,
      confidence: calculateSimilarity(result.tracks.items[0], artist, title),
    };
  }
  
  // Try without parenthetical content
  const cleanTitle = title.replace(/\s*\([^)]*\)/g, "").trim();
  if (cleanTitle !== title) {
    result = await spotifySearch(`${artist} ${cleanTitle}`, "track", 1);
    if (result.tracks.items.length > 0) {
      return {
        localTrack: { artist, title },
        spotifyUri: result.tracks.items[0].uri,
        confidence: 0.7, // Lower confidence for fuzzy match
      };
    }
  }
  
  // Not found
  return {
    localTrack: { artist, title },
    spotifyUri: null,
    confidence: 0,
  };
}
```

### 4. Rate Limiting

Spotify API has rate limits:
- ~100 requests per minute for search
- Batch playlist additions (max 100 tracks per request)

```typescript
// Throttle search requests
const searchQueue = new PQueue({ 
  concurrency: 1, 
  interval: 600,  // 100 requests per minute
  intervalCap: 1 
});

// Batch track additions
function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  );
}

async function addTracksToPlaylist(playlistId: string, uris: string[]) {
  const chunks = chunkArray(uris, 100);
  for (const chunk of chunks) {
    await spotify.addTracksToPlaylist(playlistId, chunk);
  }
}
```

### 5. Desktop App UI

#### Settings Screen (Spotify Connection)

```
┌─────────────────────────────────────────────┐
│ Spotify Integration                         │
│                                             │
│ ○ Not connected                             │
│                                             │
│ [Connect Spotify Account]                   │
│                                             │
│ Auto-create playlists after sessions: [✓]   │
│ Make playlists public: [✓]                  │
└─────────────────────────────────────────────┘
```

#### Connected State

```
┌─────────────────────────────────────────────┐
│ Spotify Integration                         │
│                                             │
│ ✓ Connected as: dj_kryspin                  │
│                                             │
│ [Disconnect]                                │
│                                             │
│ Auto-create playlists after sessions: [✓]   │
│ Make playlists public: [✓]                  │
└─────────────────────────────────────────────┘
```

#### Session End - Playlist Created

```
┌─────────────────────────────────────────────┐
│ Session Ended                               │
│                                             │
│ ✅ Spotify Playlist Created!                │
│                                             │
│ "DJ Kryspin @ Jan 4, 2026"                  │
│ 14 of 17 tracks added                       │
│                                             │
│ [Copy Playlist Link]  [Open in Spotify]     │
│                                             │
│ ⚠️ 3 tracks not found:                      │
│   • "Special Edit" by Local Artist          │
│   • "Mashup Track" by DJ XYZ                │
│   • "Rare B-Side" by Obscure Band           │
└─────────────────────────────────────────────┘
```

### 6. Playlist on Recap Page

The recap page (web) should also show the Spotify playlist link if available:

```
┌─────────────────────────────────────────────┐
│ 🎧 Pika! Recap                              │
│                                             │
│ DJ Kryspin                                  │
│ Friday, January 4, 2026                     │
│                                             │
│ 17 tracks • 1h 23min • ❤️ 42 likes          │
│                                             │
│ [🎵 Open Spotify Playlist]                  │
│                                             │
│ Tracklist:                                  │
│ 1. Song One - Artist One                    │
│ 2. Song Two - Artist Two                    │
│ ...                                         │
└─────────────────────────────────────────────┘
```

## Security Considerations

1. **Token Storage**: 
   - Store refresh token in OS secure storage (Keychain on macOS)
   - Never expose tokens in logs

2. **PKCE Flow**: 
   - No client secret needed
   - Secure for desktop apps

3. **Scope Minimization**: 
   - Only request playlist modification scopes
   - Don't request user's library or playback control

## Testing Strategy

1. **Unit Tests**:
   - Search query normalization
   - Similarity scoring
   - Rate limiting logic

2. **Integration Tests**:
   - Mock Spotify API responses
   - Test full playlist creation flow

3. **Manual Testing**:
   - Real Spotify account (test user)
   - Verify playlist appears correctly
   - Test with WCS-specific track names

## Rollout Plan

### Phase 1: Manual Trigger (MVP)
- "Create Spotify Playlist" button on session end
- Basic search, no fuzzy matching
- Show results modal

### Phase 2: Automatic + Improved Matching
- Auto-create on session end (if connected)
- Fuzzy search fallbacks
- Store playlist URL in cloud DB

### Phase 3: Recap Integration
- Show Spotify link on recap page
- Allow dancers to open directly

### Phase 4: Manual Track Matching
- Allow DJ to manually match "not found" tracks
- Learn from corrections for future matching

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1 | 2-3 days | Spotify App registration |
| Phase 2 | 1-2 days | Phase 1 |
| Phase 3 | 0.5 day | Cloud schema update |
| Phase 4 | 2-3 days | Learning algorithm |

## Open Questions

1. **Playlist naming convention**: What format do DJs prefer?
   - `{DJ Name} @ {Event Name}` 
   - `{Date} - {Session Name}`
   - Customizable template?

2. **Duplicate detection**: If session is replayed (e.g., mistake), should we detect existing playlist for that session?

3. **Offline support**: What if Spotify is down when session ends? Queue for later?

4. **Apple Music**: Should we support Apple Music in the future? (Similar API structure)

## References

- [Spotify Web API Reference](https://developer.spotify.com/documentation/web-api)
- [Authorization Code Flow with PKCE](https://developer.spotify.com/documentation/general/guides/authorization/code-flow/)
- [Playlist API](https://developer.spotify.com/documentation/web-api/reference/playlists)
