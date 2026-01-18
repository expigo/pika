# Chaos Testing for Pika! Network Resilience

This directory contains chaos testing tools to simulate adverse network conditions and verify Pika!'s resilience.

## Prerequisites

Install k6 (if not already installed):

```bash
# macOS
brew install k6

# Or download from https://k6.io/docs/get-started/installation/
```

## Usage

### Full Chaos Test Suite

Runs all 4 scenarios sequentially (total ~2.5 minutes):

```bash
k6 run tests/chaos/chaos-test.js
```

### Against Staging

```bash
k6 run tests/chaos/chaos-test.js --env TARGET_URL=wss://staging-api.pika.stream/ws
```

### Single Scenario

Run specific scenarios with k6 options:

```bash
# Normal baseline only
k6 run tests/chaos/chaos-test.js --scenario normal

# High volume stress test only
k6 run tests/chaos/chaos-test.js --scenario high_volume
```

## Scenarios

| Scenario | VUs | Duration | What It Tests |
|----------|-----|----------|---------------|
| `normal` | 10 | 30s | Baseline behavior, message flow |
| `latency` | 10 | 30s | Behavior with 500ms-5s message delays |
| `flapping` | 5 | 30s | Rapid reconnection cycles |
| `high_volume` | 50 | 30s | 250 likes/second under stress |

## Pass Criteria (Thresholds)

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `success_rate` | > 90% | VUs that received at least 1 message |
| `message_latency_ms` | p95 < 5s | 95th percentile message latency |
| `failed_connections` | < 50 | Total failed WebSocket connections |

## Custom Metrics

- `messages_received` - Total messages received by all VUs
- `messages_sent` - Total messages sent (likes, subscribes)
- `reconnections` - Simulated reconnection cycles
- `failed_connections` - Failed WebSocket connections
- `message_latency_ms` - End-to-end message latency

## Example Output

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  scenarios: (100.00%) 4 scenarios, 75 max VUs, 2m45s max duration (incl. graceful stop)

     ✓ success_rate......................: 97.33% ✓ 73 ✗ 2
     ✓ message_latency_ms................: avg=234.12ms p(95)=1823ms
     ✓ failed_connections................: 2 (< 50 threshold)
       messages_received..................: 2847
       messages_sent......................: 1245
       reconnections......................: 42
```

## Troubleshooting

### "Connection refused"
Ensure the Cloud server is running on the target URL.

### High failed_connections
The server may be rate-limiting. Check Cloud logs for 429 responses.

### p95 latency too high
May indicate server performance issues under load. Check Cloud CPU/memory.

## Next Steps

- Execute before each major release
- Add to CI with lightweight thresholds
- Integrate with alerting for production monitoring
