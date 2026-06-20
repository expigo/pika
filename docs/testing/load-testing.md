# Load Testing Guide

**Last Updated:** June 20, 2026
**Version:** 0.4.6

This document describes how to run load tests against Pika! and documents verified capacity.

---

## Verified Capacity

> **June 2026 update:** WebSocket broadcasting moved to per-session pub/sub
> topics (see [realtime-infrastructure.md](../architecture/realtime-infrastructure.md)
> §2). Fan-out is now O(clients in a session) instead of O(all clients), which
> changes the scaling story below.

### June 2026 — per-session topics (local, single instance)

Validated on a 14-core / 36 GB dev box with the load generator (k6), the cloud
server, and the DJ broadcasters **all co-located on one machine** — so absolute
latency and the ceiling here are *conservative* (client and server compete for
cores). All runs were **local** (`ws://localhost:3001/ws`), never staging or
production. Reproduce with `tests/load/capacity-multi-session.js` +
`tests/load/multi-session-dj-driver.ts`.

| Run | Connections | Conn success | Cross-session leaks | Server RSS | Notes |
|-----|-------------|--------------|---------------------|------------|-------|
| Single session | 100 | 100% | n/a | — | connect p95 2.7 ms |
| 10 sessions × 100 | **1,000** | 100% | **0 / 4.17M msgs** | ~180 MB | ~12% of one core; healthy |
| 10 sessions × 500 | **5,000** | 100% | **0 / 44.2M msgs** | ~286 MB | soft ceiling — see below |

**Healthy zone (this box):** comfortable to **~2,500 concurrent dancers** — CPU
bursts to 25–75% of a single core, `/health` responsive, RSS ~180 MB.

**Soft ceiling (~3,000–5,000, co-located):** the single Bun event loop
saturates (CPU ~90% of one core), connect-time p95 climbs to ~15 s, and
`/health` intermittently exceeds 2 s. **No crashes, no OOM, no dropped
connections, no cross-session leaks** — graceful latency degradation only.
Memory is never the limiter (<300 MB at 5,000 connections). The bottleneck is
**single-core CPU** → the horizontal-scaling work (Redis adapter, multi-instance)
is the lever to go higher.

> A meaningful share of the high-end latency is k6↔server core contention on one
> box. On a dedicated server with load driven from separate hosts, the real
> ceiling is materially higher than ~3,000.

### Jan 2026 — baseline (4 GB production VPS, single session)

| Metric | Tested | Max Recommended |
|--------|--------|-----------------|
| Concurrent Dancers | 300 | 800-1,000 |
| Connection Success Rate | 100% | >99% |
| WS Connect Time (p95) | 204 ms | <500 ms |
| Messages/sec | 486 | ~1,500 |

Infrastructure at 300 VUs (4 GB VPS): CPU 8%, RAM 900 MB, Network 300 KB/s.

### Event Size Mapping

| Event Type | Dancers | Active Users | Status |
|------------|---------|--------------|--------|
| Local social | 50-100 | 20-30 | ✅ Easy |
| Regional workshop | 200-300 | 60-100 | ✅ Verified |
| Major weekend | 500-800 | 150-250 | ✅ Safe |
| Grand Nationals (~1,500) | 1,500 | 400-600 | ✅ Within healthy zone |
| US Open (~2,000+) | 2,000+ | 700+ | 🔶 Near single-instance soft ceiling |

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
1. **Single-core CPU** (the Bun event loop) is the first limiter at high
   concurrency / heavy fan-out — it saturates around ~3,000–5,000 connections on
   one instance. Adding RAM does **not** help here.
2. **RAM** is *not* a constraint: <300 MB at 5,000 connections (the ~900 MB seen
   on the 4 GB VPS baseline was mostly Docker/runtime overhead, flat with load).
3. **Network** is trivial (WebSocket is lightweight).

### Scaling Recommendations
- **Up to ~2,500 dancers:** a single instance is sufficient (CPU has headroom,
  RAM is trivial) — comfortably covers Grand-Nationals-scale events.
- **Beyond ~3,000 dancers:** scale **out**, not up — Redis pub/sub adapter +
  multiple cloud instances behind the load balancer. Per-session topics map 1:1
  onto Redis channels, so this is the natural next step. Bigger RAM alone won't
  move the ceiling; the limiter is single-core CPU.

---

*Last Tested: June 20, 2026 (local, per-session topics — single & multi-session up to 5,000 connections)*
