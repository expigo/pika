/**
 * Pika! Load Testing Script
 *
 * Tests WebSocket connections for dance event scenarios.
 *
 * Usage:
 *   # Standard Event (100 dancers)
 *   SESSION_ID=<session> k6 run load-test.js
 *
 *   # Big Event (300 dancers)
 *   SESSION_ID=<session> k6 run --env SCENARIO=big load-test.js
 *
 *   # Against local dev
 *   SESSION_ID=<session> WS_URL=ws://localhost:3001/ws k6 run load-test.js
 */

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

// Custom metrics
const messageLatency = new Trend("ws_message_latency", true);
const messagesReceived = new Counter("ws_messages_received");
const messagesSent = new Counter("ws_messages_sent");
const connectionErrors = new Counter("ws_connection_errors");
const connectionSuccess = new Rate("ws_connection_success");

// Environment configuration
const WS_URL = __ENV.WS_URL || "wss://staging-api.pika.stream/ws";
const SESSION_ID = __ENV.SESSION_ID || "load-test-session";
const SCENARIO = __ENV.SCENARIO || "standard";

// Scenario configurations
const scenarios = {
  standard: {
    stages: [
      { duration: "2m", target: 100 }, // Ramp up to 100 dancers
      { duration: "8m", target: 100 }, // Hold for 8 minutes
      { duration: "1m", target: 0 }, // Ramp down
    ],
    thresholds: {
      ws_message_latency: ["p(95)<500"],
      ws_connection_success: ["rate>0.99"],
    },
  },
  big: {
    stages: [
      { duration: "5m", target: 300 }, // Ramp up to 300 dancers
      { duration: "15m", target: 300 }, // Hold for 15 minutes
      { duration: "2m", target: 0 }, // Ramp down
    ],
    thresholds: {
      ws_message_latency: ["p(95)<1000"],
      ws_connection_success: ["rate>0.95"],
    },
  },
  stress: {
    stages: [
      { duration: "5m", target: 500 }, // Extreme stress test
      { duration: "10m", target: 500 },
      { duration: "2m", target: 0 },
    ],
    thresholds: {
      ws_connection_success: ["rate>0.90"],
    },
  },
};

// Export options from selected scenario
export const options = {
  stages: scenarios[SCENARIO].stages,
  thresholds: scenarios[SCENARIO].thresholds,
};

export default function () {
  const clientId = `load-dancer-${__VU}-${__ITER}`;
  let connected = false;

  const res = ws.connect(
    WS_URL,
    { headers: { "X-Pika-Client": "pika-load-test" } },
    function (socket) {
      socket.on("open", () => {
        connected = true;
        connectionSuccess.add(1);

        // Subscribe to session (message type must be "SUBSCRIBE" to register as listener)
        const subscribeMsg = JSON.stringify({
          type: "SUBSCRIBE",
          sessionId: SESSION_ID,
          clientId: clientId,
        });
        socket.send(subscribeMsg);
        messagesSent.add(1);
      });

      socket.on("message", (data) => {
        try {
          const msg = JSON.parse(data);
          messagesReceived.add(1);

          // Calculate latency if server includes timestamp
          if (msg.serverTime) {
            const latency = Date.now() - msg.serverTime;
            if (latency > 0 && latency < 60000) {
              // Sanity check
              messageLatency.add(latency);
            }
          }

          // Simulate dancer behavior based on message type
          switch (msg.type) {
            case "NOW_PLAYING":
              // 50% chance to like the track
              if (Math.random() < 0.5 && msg.track) {
                sleep(Math.random() * 2); // Random delay 0-2s
                socket.send(
                  JSON.stringify({
                    type: "SEND_LIKE",
                    payload: {
                      track: {
                        title: msg.track.title || "Unknown",
                        artist: msg.track.artist || "Unknown",
                      },
                    },
                  }),
                );
                messagesSent.add(1);
              }

              // 60% chance to vote on tempo (slower/perfect/faster)
              if (Math.random() < 0.6) {
                sleep(Math.random() * 10); // Random delay 0-10s (thinking time)
                const tempoOptions = ["slower", "perfect", "faster"];
                const randomTempo = tempoOptions[Math.floor(Math.random() * tempoOptions.length)];
                socket.send(
                  JSON.stringify({
                    type: "SEND_TEMPO_REQUEST",
                    sessionId: SESSION_ID,
                    preference: randomTempo,
                  }),
                );
                messagesSent.add(1);
              }
              break;

            case "POLL_STARTED":
              // 80% participate in polls
              if (Math.random() < 0.8 && msg.options?.length > 0) {
                sleep(Math.random() * 5); // Random delay 0-5s
                const randomOptionIndex = Math.floor(Math.random() * msg.options.length);
                socket.send(
                  JSON.stringify({
                    type: "VOTE_ON_POLL",
                    pollId: msg.pollId,
                    optionIndex: randomOptionIndex,
                    clientId: clientId,
                  }),
                );
                messagesSent.add(1);
              }
              break;

            case "THANK_YOU_TRIGGER":
              // Simulate "Thank You" storm - 80% send thanks
              if (Math.random() < 0.8) {
                sleep(Math.random() * 2); // Burst within 2s
                socket.send(
                  JSON.stringify({
                    type: "SEND_REACTION",
                    sessionId: SESSION_ID,
                    reaction: "thank_you",
                  }),
                );
                messagesSent.add(1);
              }
              break;
          }
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      });

      socket.on("error", (e) => {
        console.error(`[VU ${__VU}] WebSocket error:`, e);
        connectionErrors.add(1);
        if (!connected) {
          connectionSuccess.add(0);
        }
      });

      socket.on("close", () => {
        // Normal close
      });

      // Keep connection alive for the scenario duration
      // The actual duration is controlled by K6 stages
      socket.setTimeout(
        () => {
          socket.close();
        },
        scenarios[SCENARIO].stages.reduce((acc, s) => {
          const duration = parseInt(s.duration);
          const unit = s.duration.replace(/[0-9]/g, "");
          const ms = unit === "m" ? duration * 60000 : duration * 1000;
          return acc + ms;
        }, 0),
      );
    },
  );

  check(res, {
    "WebSocket connected": (r) => r && r.status === 101,
  });
}

export function handleSummary(data) {
  console.log("\n📊 Load Test Summary");
  console.log("=".repeat(50));
  console.log(`Scenario: ${SCENARIO.toUpperCase()}`);
  console.log(`Target: ${WS_URL}`);
  console.log(`Session: ${SESSION_ID}`);
  console.log("=".repeat(50));

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
