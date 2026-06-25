/**
 * Secure-context-safe UUID.
 *
 * `crypto.randomUUID()` is ONLY available in secure contexts (HTTPS or
 * localhost/127.0.0.1). Pika's LAN test flow serves the web app over plain
 * `http://<LAN-IP>:3002`, where `crypto.randomUUID` is `undefined` →
 * "crypto.randomUUID is not a function" (works on localhost, crashes on a phone
 * hitting the LAN IP).
 *
 * `crypto.getRandomValues()` *is* available in insecure contexts, so we prefer
 * `randomUUID`, fall back to a v4 built from `getRandomValues`, and finally to
 * `Math.random` (last resort for ancient/locked-down environments). The id is an
 * anonymous client/message identifier, so the weakest fallback is acceptable.
 */
export function safeRandomUUID(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 v4 version + variant bits.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
