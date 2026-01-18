/**
 * Client identity management for anonymous dancers
 * Persists client ID in localStorage for session continuity
 */

export const CLIENT_ID_KEY = "pika_client_id";

/**
 * Get or create a persistent client ID
 * Used for anonymous dancer identity (likes, votes, etc.)
 */
export function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    return `server_${Date.now()}`;
  }

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    // Generate a UUID-like ID
    clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

/**
 * Clear client ID (for testing or privacy reset)
 */
export function clearClientId(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(CLIENT_ID_KEY);
  }
}
