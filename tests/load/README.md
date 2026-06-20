# Pika! Load Testing

Load testing suite for validating WebSocket performance under real-world dance event conditions.

## Prerequisites

```bash
# Install K6
brew install k6
```

## Quick Start

```bash
# 1. Create a test session (via web or desktop app)

# 2. Run standard event test (100 dancers)
SESSION_ID=<your-session-id> k6 run tests/load/load-test.js

# 3. Run big event test (300 dancers)
SESSION_ID=<your-session-id> k6 run --env SCENARIO=big tests/load/load-test.js
```

## Test Scenarios

| Scenario | Command | VUs | Duration | Use Case |
|----------|---------|-----|----------|----------|
| Standard | `k6 run load-test.js` | 100 | 11 min | Social dance night |
| Big | `--env SCENARIO=big` | 300 | 22 min | Competition weekend |
| Stress | `--env SCENARIO=stress` | 500 | 17 min | Breaking point test |

## Multi-Session Capacity Test (festival / fan-out)

`load-test.js` drives a **single** session. To validate the **per-session topic
routing** — fan-out efficiency and cross-session isolation — at festival scale,
use the multi-session pair. It spreads dancers across N concurrent sessions and
**fails the run if any dancer receives another session's traffic**
(`cross_session_leaks == 0`).

```bash
# 1. Start the server with a high WS connect-rate limit (one IP, many VUs)
WS_RATE_LIMIT=1000000 NODE_ENV=development PORT=3001 MAX_SESSIONS=1000 \
  bun run --filter @pika/cloud start

# 2. Register N DJ sessions that broadcast tracks (separate terminal)
NUM_SESSIONS=10 WS_URL=ws://localhost:3001/ws bun run tests/load/multi-session-dj-driver.ts

# 3. Drive 1000 dancers across those sessions (separate terminal)
WS_URL=ws://localhost:3001/ws NUM_SESSIONS=10 TARGET=1000 HOLD=150s \
  k6 run tests/load/capacity-multi-session.js
```

| Variable | Default | Description |
|----------|---------|-------------|
| `NUM_SESSIONS` | `10` | Concurrent sessions; dancers spread via `__VU % NUM_SESSIONS` |
| `TARGET` | `1000` | Peak concurrent dancers across all sessions |
| `HOLD` | `180s` | Hold duration at peak |

**Verified (June 2026, 14-core dev box):** 1000 dancers × 10 sessions → 100%
connection success, **0 cross-session leaks** across 4.17M delivered messages,
server ~12% of one core / ~180 MB RSS, connect p95 2.7ms.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_URL` | `wss://staging-api.pika.stream/ws` | WebSocket endpoint |
| `SESSION_ID` | `load-test-session` | Target session ID |
| `SCENARIO` | `standard` | Test scenario (standard/big/stress) |

## Running Against Different Environments

### Local Development
```bash
SESSION_ID=test-session WS_URL=ws://localhost:3001/ws k6 run tests/load/load-test.js
```

### Staging
```bash
SESSION_ID=<session-id> WS_URL=wss://staging-api.pika.stream/ws k6 run tests/load/load-test.js
```

### Production (⚠️ Use with caution)
```bash
SESSION_ID=<session-id> WS_URL=wss://api.pika.stream/ws k6 run tests/load/load-test.js
```

## Success Criteria

### Standard Event (100 dancers)
- ✅ Connection success rate: >99%
- ✅ Message latency p95: <500ms
- ✅ Memory usage: <512MB

### Big Event (300 dancers)
- ✅ Connection success rate: >95%
- ✅ Message latency p95: <1000ms
- ⚠️ Memory usage: <1GB

## Monitoring During Tests

### Kuma Dashboard
Watch for:
- `/health` endpoint response time
- Uptime drops during ramp-up

### Beszel Dashboard
Watch for:
- CPU spikes (expected during ramp)
- Memory growth (watch for leaks)
- Network I/O patterns

### Docker Stats
```bash
docker stats pika-cloud pika-db
```

## Interpreting Results

### Good Result
```
checks.........................: 100.00% ✓ 100 ✗ 0
ws_message_latency.............: avg=142ms p(95)=312ms
ws_connection_success..........: 99.00%
```

### Warning Signs
- `ws_connection_success` < 95% → Connection handling issues
- `ws_message_latency p(95)` > 1000ms → Performance bottleneck
- Increasing latency over time → Memory leak or connection limit

## Troubleshooting

### "Connection refused"
- Check if cloud server is running
- Verify WS_URL is correct

### "Rate limited"
- Auth rate limiter may block test IPs
- Temporarily increase limits or whitelist test IP

### High memory usage
- Restart cloud container: `docker restart pika-cloud`
- Check for connection leaks in code
