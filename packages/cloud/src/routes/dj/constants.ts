/**
 * Shared constants for the split DJ routers (`routes/dj/*`), composed by `routes/dj.ts`.
 */

// Bound the legacy (anonymous) session scan in the public profile read. Pre-auth sessions have no
// djUserId, so they can only be matched to a profile by slugifying their djName in JS. We cap the
// scan to the most-recent N so this public endpoint can't be made to load every anonymous session
// ever into memory.
export const MAX_LEGACY_SESSION_SCAN = 500;

// Per-DJ Booth caps.
export const MAX_DJ_PLAYLISTS = 24;
export const MAX_DJ_GIGS = 24;
