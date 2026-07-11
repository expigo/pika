import type { LikedTrack } from "./types";

// Get a stable client ID — READ-ONLY: the journal never mints an identity
// (an id is only created when the dancer actually interacts on /live).
export function getClientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pika_client_id");
}

// Format date nicely
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Format time
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Group likes by session
export function groupBySession(likes: LikedTrack[]): Map<string | null, LikedTrack[]> {
  const groups = new Map<string | null, LikedTrack[]>();
  for (const like of likes) {
    const key = like.sessionId;
    const existing = groups.get(key) || [];
    groups.set(key, [...existing, like]);
  }
  return groups;
}

// Convert DJ name to slug
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function exportErrorCopy(status: number, retryAfterSec?: number): string {
  switch (status) {
    case 401:
      return "Your sign-in expired — sign in again to update";
    case 409:
      return "Playlist export isn't set up yet — try again after the next update";
    case 429:
      return retryAfterSec
        ? `Hold on — try again in ${retryAfterSec}s`
        : "Hold on — try again in a minute";
    case 422:
      return "None of your likes have a Spotify match yet";
    case 503:
      return "Spotify is busy — try again in a minute";
    default:
      return "Export failed — try again";
  }
}
