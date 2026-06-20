/**
 * Multi-session DJ driver (companion to capacity-multi-session.js).
 *
 * Opens NUM_SESSIONS DJ WebSocket connections, registers `cap-session-{i}` on
 * each, and broadcasts a fresh track every 6s. This gives the k6 dancers
 * something to react to (NOW_PLAYING → likes / tempo votes) so the per-session
 * fan-out path is exercised across many concurrent sessions at once.
 *
 * Usage:
 *   NUM_SESSIONS=10 WS_URL=ws://localhost:3001/ws bun run tests/load/multi-session-dj-driver.ts
 *
 * Run this in one terminal, then run capacity-multi-session.js (k6) in another.
 */
const WS_URL = process.env.WS_URL || "ws://localhost:3001/ws";
const NUM_SESSIONS = Number(process.env.NUM_SESSIONS || "10");

function startDj(i: number) {
  const sessionId = `cap-session-${i}`;
  let n = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function connect() {
    const ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          type: "REGISTER_SESSION",
          sessionId,
          djName: `DJ-${i}`,
          clientId: `cap-dj-${i}`,
        }),
      );
    });
    ws.addEventListener("message", (e: MessageEvent) => {
      const m = JSON.parse(String(e.data));
      if (m.type === "SESSION_REGISTERED") {
        if (timer) clearInterval(timer);
        // Stagger broadcasts across sessions so they don't all fire at once.
        setTimeout(() => {
          timer = setInterval(() => {
            n++;
            ws.send(
              JSON.stringify({
                type: "BROADCAST_TRACK",
                sessionId,
                track: { artist: `Artist-${i}`, title: `Track ${n}` },
                messageId: `dj${i}-${Date.now()}-${n}`,
              }),
            );
          }, 6000);
        }, i * 200);
      }
    });
    ws.addEventListener("close", () => {
      if (timer) clearInterval(timer);
      setTimeout(connect, 1000);
    });
    ws.addEventListener("error", () => {});
  }
  connect();
}

for (let i = 0; i < NUM_SESSIONS; i++) startDj(i);
console.log(`[multi-DJ] registering ${NUM_SESSIONS} sessions, broadcasting every 6s`);
setInterval(() => {}, 1 << 30); // keep alive
