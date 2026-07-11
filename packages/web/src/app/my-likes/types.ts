export interface LikedTrack {
  id: number;
  sessionId: string | null;
  djName: string | null;
  sessionDate: string | null;
  artist: string;
  title: string;
  albumArtUrl: string | null;
  spotifyUrl: string | null;
  likedAt: string;
}

export interface JournalPlaylist {
  url: string;
  trackCount: number;
  updatedAt: string;
}

export interface ClaimedDevice {
  clientId: string;
  label: string | null;
  claimedAt: string;
}

/** A followed DJ (Slice C) — slug is the Booth path; nextGig powers the night-planning chip. */
export interface FollowedDj {
  slug: string | null;
  djName: string;
  followedAt: string;
  nextGig: string | null;
}

export interface LikesResponse {
  clientId?: string; // device read only
  claimedCount?: number; // account read only
  devices?: ClaimedDevice[]; // account read only
  totalLikes: number;
  limit: number;
  offset: number;
  likes: LikedTrack[];
  playlist: JournalPlaylist | null;
}

export interface ExportResponse {
  playlistUrl: string;
  trackCount: number;
  matchedCount: number;
  totalLiked: number;
  updated: boolean;
}

export type ExportState =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "success"; updated: boolean }
  | { phase: "error"; message: string };
