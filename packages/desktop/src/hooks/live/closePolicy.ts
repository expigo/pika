/**
 * WebSocket close policy
 *
 * Decides whether a socket close should END the live session (terminal) or be
 * treated as a transient drop that ReconnectingWebSocket should auto-recover.
 *
 * IMPORTANT: code 1000 (normal closure) is NOT terminal. WKWebView surfaces
 * transient connection losses ("The network connection was lost"), benign server
 * cycles, and our own socket cleanups as 1000 — treating it as fatal made every
 * blip a permanently-dead session. Server-*intentional* termination arrives as
 * the SESSION_EXPIRED application message, not via the close code.
 *
 * @package @pika/desktop
 */

/**
 * @param code        WebSocket close code from the close event.
 * @param intentional True when the client itself is ending the session
 *                    (DJ "End Set" or final app teardown).
 * @returns true → do NOT reconnect (terminal); false → let RWS reconnect.
 */
export function isTerminalClose(code: number, intentional: boolean): boolean {
  if (intentional) return true; // DJ ended the set / app shutting down
  if (code >= 4000 && code < 5000) return true; // app-defined fatal codes
  if (code === 1013) return true; // server busy / max sessions reached — don't hammer
  return false; // 1000 / 1006 / transient → reconnect
}
