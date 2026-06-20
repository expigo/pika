/**
 * Pika! multi-session capacity test.
 *
 * Spreads VUs across NUM_SESSIONS live sessions (cap-session-{0..N-1}) to
 * exercise the per-session pub/sub fan-out at festival scale AND assert that
 * cross-session isolation holds under load: a dancer must NEVER receive a
 * NOW_PLAYING / POLL_STARTED for a session it isn't subscribed to. The
 * `cross_session_leaks` threshold (== 0) fails the run if isolation breaks.
 *
 * Companion broadcaster: multi-session-dj-driver.ts (run it first).
 *
 * Usage:
 *   # Start 10 DJs in one terminal:
 *   NUM_SESSIONS=10 WS_URL=ws://localhost:3001/ws bun run tests/load/multi-session-dj-driver.ts
 *
 *   # Then drive 1000 dancers across those 10 sessions:
 *   WS_URL=ws://localhost:3001/ws NUM_SESSIONS=10 TARGET=1000 HOLD=150s \
 *     k6 run tests/load/capacity-multi-session.js
 *
 * Tip: raise the server's WS connect-rate limit when hammering from one IP,
 * e.g. WS_RATE_LIMIT=1000000.
 */
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const messagesReceived = new Counter("app_msgs_received");
const messagesSent = new Counter("app_msgs_sent");
const crossSessionLeaks = new Counter("cross_session_leaks");
const connectionSuccess = new Rate("ws_connection_success");
const _subscribeAck = new Trend("subscribe_ack_ms", true);

const WS_URL = __ENV.WS_URL || "ws://localhost:3001/ws";
const NUM_SESSIONS = Number(__ENV.NUM_SESSIONS || "10");
const TARGET = Number(__ENV.TARGET || "1000");
const HOLD = __ENV.HOLD || "180s";

export const options = {
  stages: [
    { duration: "90s", target: TARGET }, // ramp to TARGET dancers
    { duration: HOLD, target: TARGET }, // hold
    { duration: "30s", target: 0 }, // ramp down
  ],
  thresholds: {
    ws_connection_success: ["rate>0.95"],
    cross_session_leaks: ["count==0"], // a dancer must NEVER see another session's traffic
  },
};

export default function () {
  // Distribute this VU onto one of the sessions.
  const mySession = `cap-session-${__VU % NUM_SESSIONS}`;
  const clientId = `cap-dancer-${__VU}-${__ITER}`;
  let connected = false;

  ws.connect(WS_URL, { headers: { "X-Pika-Client": "pika-load-test" } }, (socket) => {
    socket.on("open", () => {
      connected = true;
      connectionSuccess.add(1);
      socket.send(JSON.stringify({ type: "SUBSCRIBE", sessionId: mySession, clientId }));
      messagesSent.add(1);
      // Heartbeat so the server's idle-timeout doesn't reap the connection mid-run.
      socket.setInterval(() => socket.send(JSON.stringify({ type: "PING" })), 20000);
    });

    socket.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      messagesReceived.add(1);

      switch (msg.type) {
        case "NOW_PLAYING":
          // ISOLATION CHECK: a NOW_PLAYING for a different session = a leak.
          if (msg.sessionId && msg.sessionId !== mySession) {
            crossSessionLeaks.add(1);
          }
          if (Math.random() < 0.5 && msg.track) {
            sleep(Math.random() * 2);
            socket.send(
              JSON.stringify({
                type: "SEND_LIKE",
                sessionId: mySession,
                clientId,
                payload: { track: { title: msg.track.title, artist: msg.track.artist } },
              }),
            );
            messagesSent.add(1);
          }
          if (Math.random() < 0.6) {
            sleep(Math.random() * 8);
            const t = ["slower", "perfect", "faster"][Math.floor(Math.random() * 3)];
            socket.send(
              JSON.stringify({ type: "SEND_TEMPO_REQUEST", sessionId: mySession, preference: t }),
            );
            messagesSent.add(1);
          }
          break;
        case "POLL_STARTED":
          if (msg.sessionId && msg.sessionId !== mySession) crossSessionLeaks.add(1);
          break;
      }
    });

    socket.on("error", () => {
      if (!connected) connectionSuccess.add(0);
    });

    // Hold the connection open for the whole run.
    socket.setTimeout(() => socket.close(), 300000);
  });

  check(null, { connected: () => connected });
}

export function handleSummary(data) {
  const m = data.metrics;
  const g = (k, f = "count") => (m[k] && m[k].values[f] != null ? m[k].values[f] : 0);
  const line = (l, v) => `${l.padEnd(28)}${v}`;
  const out = [
    "",
    "================ CAPACITY TEST SUMMARY ================",
    line("Target VUs:", TARGET),
    line("Sessions:", NUM_SESSIONS),
    line("Max VUs reached:", g("vus_max", "max")),
    line("WS sessions opened:", g("ws_sessions")),
    line("Conn success rate:", `${(g("ws_connection_success", "rate") * 100).toFixed(2)}%`),
    line("App msgs received:", g("app_msgs_received")),
    line("App msgs sent:", g("app_msgs_sent")),
    line("CROSS-SESSION LEAKS:", g("cross_session_leaks")),
    line("ws_connecting p95:", `${(g("ws_connecting", "p(95)") || 0).toFixed(1)}ms`),
    line("data received:", `${(g("data_received") / 1048576).toFixed(1)} MB`),
    line("data sent:", `${(g("data_sent") / 1048576).toFixed(1)} MB`),
    "======================================================",
    "",
  ].join("\n");
  return { stdout: out };
}
