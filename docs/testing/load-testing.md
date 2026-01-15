# Load Testing Guide

**Last Updated:** January 15, 2026
**Version:** 0.1.9

This document describes how to run load tests against Pika! and documents verified capacity.

---

## Verified Capacity (Jan 2026)

| Metric | Tested | Max Recommended |
|--------|--------|-----------------|
| **Concurrent Dancers** | 300 | **800-1,000** |
| **Connection Success Rate** | 100% | >99% |
| **WS Connect Time (p95)** | 204ms | <500ms |
| **Messages/sec** | 486 | ~1,500 |

### Infrastructure (4GB VPS)

| Resource | At 300 VUs | Headroom |
|----------|------------|----------|
| CPU | 8% | ~12x |
| RAM (Docker) | 900 MB | ~4x |
| Network | 300 KB/s | ~333x |

### Event Size Mapping

| Event Type | Dancers | Active Users | Status |
|------------|---------|--------------|--------|
| Local social | 50-100 | 20-30 | ✅ Easy |
| Regional workshop | 200-300 | 60-100 | ✅ Tested |
| Major weekend | 500-800 | 150-250 | ✅ Safe |
| Grand Nationals (~1,500) | 1,500 | 400-600 | ⚠️ Monitor |
| US Open (~2,000+) | 2,000+ | 700+ | 🔶 Upgrade RAM |

---

## Running Load Tests

### Prerequisites

1. **k6 installed:** `brew install k6`
2. **Active session:** Start a DJ session first (creates a session ID)
3. **Rate limit raised:** Set `WS_RATE_LIMIT=1000` (1000 default on staging)

### Standard Test (100 Users)

```bash
SESSION_ID=<your-session-id> WS_URL=ws://localhost:3001/ws k6 run tests/load/load-test.js
```

### Big Event Test (300 Users)

```bash
SESSION_ID=<your-session-id> SCENARIO=big WS_URL=ws://localhost:3001/ws k6 run tests/load/load-test.js
```

### Staging Test

```bash
SESSION_ID=<your-session-id> SCENARIO=big WS_URL=wss://staging-api.pika.stream/ws k6 run tests/load/load-test.js
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_ID` | `load-test-session` | Session to subscribe to |
| `SCENARIO` | `standard` | `standard` (100), `big` (300), `stress` (500) |
| `WS_URL` | `wss://staging-api.pika.stream/ws` | WebSocket endpoint |
| `WS_RATE_LIMIT` | `20` (server) | Server-side connection limit |

---

## Test Scenarios

### standard (100 VUs, 11 mins)
- Ramp: 2m → 100 users
- Hold: 8m
- Ramp down: 1m
- Thresholds: p95 latency < 500ms, success > 99%

### big (300 VUs, 22 mins)
- Ramp: 5m → 300 users
- Hold: 15m
- Ramp down: 2m
- Thresholds: p95 latency < 1000ms, success > 95%

### stress (500 VUs, 17 mins)
- Ramp: 5m → 500 users
- Hold: 10m
- Ramp down: 2m
- Thresholds: success > 90%

---

## Simulated Dancer Behavior

The load test simulates realistic dancer behavior:

1. **Subscribe to session** (100%)
2. **Like tracks** (50% probability, 0-2s delay)
3. **Vote on tempo** (60% probability, 0-10s delay)
4. **Participate in polls** (80% probability, 0-5s delay)
5. **Send Thank You** (80% probability, 0-2s burst)

---

## Key Findings

### WCS Dancer Behavior
- Dancers spend ~5 seconds on the app per song
- ~10-20% of dancers are active at any moment
- Most interactions are simple (like, tempo vote)

### Bottlenecks
1. **RAM** is the primary constraint on 4GB VPS
2. **CPU** is barely touched (event loop efficient)
3. **Network** is trivial (WebSocket is lightweight)

### Scaling Recommendations
- **Up to 1,000 dancers:** Current VPS (4GB) is sufficient
- **1,500+ dancers:** Upgrade to 8GB RAM VPS
- **2,000+ dancers:** Consider Redis + horizontal scaling

---

*Last Tested: January 15, 2026*
