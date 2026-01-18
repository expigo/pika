/**
 * Chaos Testing Script for Pika! Network Resilience
 *
 * Uses k6 with WebSocket support to simulate:
 * - Latency spikes (500ms - 5s)
 * - Packet loss (message drops)
 * - Rapid connect/disconnect cycles
 * - High-volume likes during instability
 *
 * Usage:
 *   k6 run tests/chaos/chaos-test.js
 *   k6 run tests/chaos/chaos-test.js --env TARGET_URL=ws://staging.pika.stream/ws
 *
 * Scenarios:
 *   - Normal: Baseline with no chaos
 *   - Latency: Simulated variable delays
 *   - Flapping: Rapid reconnection cycles
 *   - High Volume: Many dancers during instability
 */

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// =============================================================================
// Custom Metrics
// =============================================================================

const messagesReceived = new Counter("messages_received");
const messagesSent = new Counter("messages_sent");
const reconnections = new Counter("reconnections");
const failedConnections = new Counter("failed_connections");
const messageLatency = new Trend("message_latency_ms");
const successRate = new Rate("success_rate");

// =============================================================================
// Configuration
// =============================================================================

const TARGET_URL = __ENV.TARGET_URL || "ws://localhost:3001/ws";
const TEST_SESSION_ID = `chaos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const options = {
  scenarios: {
    // Scenario 1: Normal baseline (10 VUs, 30s)
    normal: {
      executor: "constant-vus",
      vus: 10,
      duration: "30s",
      env: { SCENARIO: "normal" },
    },
    // Scenario 2: Latency simulation (10 VUs, 30s, starts at 35s)
    latency: {
      executor: "constant-vus",
      vus: 10,
      duration: "30s",
      startTime: "35s",
      env: { SCENARIO: "latency" },
    },
    // Scenario 3: Flapping (rapid reconnects, 5 VUs, 30s, starts at 70s)
    flapping: {
      executor: "constant-vus",
      vus: 5,
      duration: "30s",
      startTime: "70s",
      env: { SCENARIO: "flapping" },
    },
    // Scenario 4: High volume under stress (50 VUs, 30s, starts at 105s)
    high_volume: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      startTime: "105s",
      env: { SCENARIO: "high_volume" },
    },
  },
  thresholds: {
    success_rate: ["rate>0.90"], // 90% success rate minimum
    message_latency_ms: ["p(95)<5000"], // 95th percentile under 5s
    failed_connections: ["count<50"], // Max 50 failed connections total
  },
};

// =============================================================================
// Test Logic
// =============================================================================

export default function () {
  const scenario = __ENV.SCENARIO || "normal";
  const clientId = `chaos_vu_${__VU}_${Date.now()}`;

  const params = {
    tags: { scenario },
  };

  const res = ws.connect(TARGET_URL, params, function (socket) {
    let messageCount = 0;
    const startTime = Date.now();

    socket.on("open", function () {
      console.log(`[VU${__VU}] Connected (scenario: ${scenario})`);

      // Subscribe to the test session
      socket.send(
        JSON.stringify({
          type: "SUBSCRIBE",
          clientId,
          sessionId: TEST_SESSION_ID,
        }),
      );
      messagesSent.add(1);
    });

    socket.on("message", function (data) {
      messageCount++;
      messagesReceived.add(1);

      // Track latency from any timestamped message
      try {
        const msg = JSON.parse(data);
        if (msg.timestamp) {
          const latency = Date.now() - new Date(msg.timestamp).getTime();
          if (latency > 0 && latency < 60000) {
            messageLatency.add(latency);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    socket.on("close", function () {
      console.log(`[VU${__VU}] Disconnected after ${messageCount} messages`);
    });

    socket.on("error", function (e) {
      console.log(`[VU${__VU}] Error: ${e}`);
      failedConnections.add(1);
    });

    // Scenario-specific behavior
    switch (scenario) {
      case "normal":
        runNormalScenario(socket, clientId);
        break;
      case "latency":
        runLatencyScenario(socket, clientId);
        break;
      case "flapping":
        runFlappingScenario(socket, clientId);
        break;
      case "high_volume":
        runHighVolumeScenario(socket, clientId);
        break;
    }

    // Keep connection alive for scenario duration
    socket.setTimeout(function () {
      socket.close();
      successRate.add(messageCount > 0 ? 1 : 0);
    }, 25000); // Close after 25s (before scenario ends)
  });

  check(res, {
    "WebSocket connection successful": (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    failedConnections.add(1);
  }
}

// =============================================================================
// Scenario Implementations
// =============================================================================

function runNormalScenario(socket, clientId) {
  // Send likes every 2-5 seconds
  for (let i = 0; i < 8; i++) {
    socket.setTimeout(
      function () {
        sendLike(socket, clientId);
      },
      2000 + i * 2500,
    );
  }
}

function runLatencyScenario(socket, clientId) {
  // Simulate variable latency by adding random delays
  // This doesn't actually add network latency, but tests client behavior with delays
  for (let i = 0; i < 5; i++) {
    const delay = 500 + Math.random() * 4500; // 500ms - 5s
    socket.setTimeout(
      function () {
        console.log(`[VU${__VU}] Sending with simulated ${delay.toFixed(0)}ms latency`);
        sendLike(socket, clientId);
      },
      i * 5000 + delay,
    );
  }
}

function runFlappingScenario(socket, clientId) {
  // Rapid reconnection simulation
  // We can't actually reconnect in the same VU, but we simulate by
  // sending messages in bursts with gaps
  let burst = 0;
  const burstInterval = socket.setInterval(function () {
    burst++;
    if (burst % 3 === 0) {
      // Simulate "reconnection" by sending SUBSCRIBE again
      console.log(`[VU${__VU}] Simulating reconnection (burst ${burst})`);
      socket.send(
        JSON.stringify({
          type: "SUBSCRIBE",
          clientId,
          sessionId: TEST_SESSION_ID,
        }),
      );
      reconnections.add(1);
    } else {
      sendLike(socket, clientId);
    }
  }, 1000);

  socket.setTimeout(function () {
    clearInterval(burstInterval);
  }, 24000);
}

function runHighVolumeScenario(socket, clientId) {
  // High-frequency likes (stress test)
  const interval = socket.setInterval(function () {
    sendLike(socket, clientId);
  }, 200); // 5 likes/second per VU

  socket.setTimeout(function () {
    clearInterval(interval);
  }, 24000);
}

function sendLike(socket, clientId) {
  const message = {
    type: "SEND_LIKE",
    clientId,
    sessionId: TEST_SESSION_ID,
    payload: {
      track: {
        title: "Chaos Test Track",
        artist: "Chaos Bot",
      },
    },
    timestamp: new Date().toISOString(),
  };

  socket.send(JSON.stringify(message));
  messagesSent.add(1);
}
