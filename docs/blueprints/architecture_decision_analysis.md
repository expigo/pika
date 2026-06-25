# Pika! V2 Architecture Decision: Principal Engineer Analysis

**Date:** 2026-06-24  
**Author:** Principal Lead Engineer (Deep Review)  
**Scope:** [pika-next-architecture.md](file:///Users/kryspin/personal/projects/djwcs/pika/pika/docs/blueprints/pika-next-architecture.md) vs. Second Opinion  
**Verdict:** ⬇️ Jump to [Final Recommendation](#final-recommendation-the-1110-path)

---

## 1. Fact-Check: Claims Against the Real Codebase

Before any opinions, I verified every factual claim both sides make against the actual source code.

### Claim: "Redis/Valkey is not wired — not in docker-compose" (Second Opinion)

> **PARTIALLY WRONG.** The dev [docker-compose.yml](file:///Users/kryspin/personal/projects/djwcs/pika/pika/docker-compose.yml#L20-L30) **does** include a `valkey/valkey:8-alpine` service on port 6379 with healthchecks. However, it is **not present** in [docker-compose.prod.yml](file:///Users/kryspin/personal/projects/djwcs/pika/pika/docker-compose.prod.yml) or [docker-compose.staging.yml](file:///Users/kryspin/personal/projects/djwcs/pika/pika/docker-compose.staging.yml), and **zero application code** imports or connects to it.

| File | Has Valkey? |
|:--|:--|
| `docker-compose.yml` (dev) | ✅ Yes — `valkey/valkey:8-alpine` |
| `docker-compose.prod.yml` | ❌ No |
| `docker-compose.staging.yml` | ❌ No |
| `packages/cloud/src/**/*.ts` | ❌ Zero imports of `ioredis`, `redis`, or `valkey` |

**Verdict:** The infra container exists in dev (someone added it anticipatorily), but there is **no application integration**. The blueprint's "Already Have: Redis/Valkey" is **aspirational, not factual**. The second opinion's blanket "not in docker-compose" is also inaccurate. Both sides have minor factual errors here.

---

### Claim: "lib/topics.ts already abstracts pub/sub 1:1 onto Redis channels" (Second Opinion)

> **CORRECT, AND WELL-DOCUMENTED.**

The actual [topics.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/lib/topics.ts) is elegant and minimal — 48 lines. The critical comment on line 22-24:

```
NOTE: Bun topics are per-instance (in-memory). This is correct for the
current single-instance deployment and maps 1:1 onto Redis pub/sub channels
if/when multi-instance horizontal scaling is introduced.
```

The [realtime-infrastructure.md](file:///Users/kryspin/personal/projects/djwcs/pika/pika/docs/architecture/realtime-infrastructure.md#L54) echoes this: *"they map 1:1 onto Redis pub/sub channels when multi-instance scaling lands."*

**Verdict:** The codebase was already designed with Redis as a future swap target. The abstraction is clean. This **reduces** the urgency of adding Redis now because the migration cost is low.

---

### Claim: "Every in-memory Map maps to a Redis structure" (Second Opinion)

> **CORRECT.** I verified every in-memory state module:

| Module | Data Structure | Redis Equivalent | Difficulty |
|:--|:--|:--|:--|
| [sessions.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/lib/sessions.ts#L42) | `Map<string, LiveSession>` | `HSET session:{id}` | Trivial |
| [listeners.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/lib/listeners.ts#L10) | `Map<string, Map<clientId, {count, lastSeen}>>` | `HSET listeners:{sessionId}` | Easy |
| [nonces.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/lib/nonces.ts#L38) | `Map<string, NonceEntry>` + TTL cleanup | `SET nonce:{id} EX 300` | Trivial (SETEX is built-in TTL) |
| [polls.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/lib/polls.ts#L44) | `Map<number, ActivePoll>` | `HSET poll:{id}` | Moderate (votedClients sub-map) |
| [cache.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/lib/cache.ts#L13) | `Map<string, CacheEntry>` | Not needed (Redis IS the cache) | N/A |
| [rate-limit.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/lib/rate-limit.ts) | `Map<string, ...>` | `INCR` + `EXPIRE` | Trivial |

Every module header even says "FUTURE: Can swap Map for Redis..." — this was planned from day one. The migration is mechanical, not architectural.

---

### Claim: "The push notification 'Global Megaphone' fix needs a foreign key, not Redis" (Second Opinion)

> **CORRECT. This is the most important technical insight in the entire debate.**

I read the actual [push routes](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/routes/push.ts#L112-L119). The "Global Megaphone" bug is right here:

```typescript
// Line 114-118: The ACTUAL broadcast logic
const targets = await db
  .select()
  .from(pushSubscriptions)
  .where(isNull(pushSubscriptions.unsubscribedAt))
  .limit(filter === "debug" ? 5 : 1000)
  .orderBy(desc(pushSubscriptions.createdAt));
```

This query selects **ALL active subscriptions** with zero scoping. The fix is adding a `stage_id` or `session_id` column to [push_subscriptions](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/db/schema.ts#L290-L298) and filtering the query:

```sql
-- The fix: one WHERE clause, zero new infrastructure
WHERE unsubscribed_at IS NULL AND stage_id = $1
```

The blueprint proposes Redis `SADD`/`SMEMBERS` for this same routing. That would create a **dual-write problem**: you'd have the durable subscription registry in Postgres and an ephemeral routing set in Redis that can drift on restart. This is strictly worse from a correctness standpoint.

> [!IMPORTANT]
> **The "Global Megaphone" — the blueprint's headline problem — is a Postgres query bug, not an infrastructure gap.** The fix is a column + WHERE clause, not a new datastore.

---

### Claim: "Bun handles ~2,500 concurrent dancers comfortably" (Second Opinion)

> **PLAUSIBLE.** Online research confirms Bun's uWebSockets backend handles 1M+ synthetic connections. Real-world with app logic (DB calls, JSON serialization, pub/sub fan-out) is much lower, but 2,500 with Pika's lightweight JSON payloads is well within range. Your target is ≤300. That's ~8× headroom on a single process.

---

### Claim: "Status says 'Approved / In Progress' but nothing is implemented" (Second Opinion)

> **CORRECT.** The blueprint says "Status: Approved / In Progress" (2026-01-27). That was **5 months ago**. Zero implementation exists:
> - No Stage table in schema
> - No Event table
> - No Redis client code
> - No `ioredis` in package.json
> - `CLAUDE.md` line 69 explicitly states: *"Redis/Valkey integration is planned (Strategic Priority S8) but not yet implemented."*

This is a documentation hygiene issue. A stale "In Progress" signal is dangerous for planning.

---

## 2. Claim-by-Claim Scoring

| # | Claim | Blueprint | Second Opinion | Winner |
|:--|:--|:--|:--|:--|
| 1 | Redis already in docker-compose | ❌ Aspirational | ❌ Said "not in docker-compose" (it IS in dev) | **Draw** (both partially wrong) |
| 2 | Topics abstraction is Redis-ready | ✅ Implicitly assumed | ✅ Explicitly verified | **Second Opinion** (verified) |
| 3 | Push scoping needs Redis | ❌ Wrong (needs FK) | ✅ Correct (needs FK) | **Second Opinion** |
| 4 | Stage/Event is the right model | ✅ Correct product insight | ✅ Agrees | **Draw** (both right) |
| 5 | Redis needed for hot state | ❌ Not at current scale | ✅ Correct (Maps fine at ≤2,500) | **Second Opinion** |
| 6 | Doc status is accurate | ❌ Stale | ✅ Called it out | **Second Opinion** |
| 7 | Spotify/identity should be coupled | ❌ Bundles too much | ✅ Correctly says decouple | **Second Opinion** |
| 8 | Redis migration is cheap when needed | ✅ Implicitly true | ✅ Explicitly argued | **Draw** |

**Score: Second Opinion 4, Blueprint 0, Draw 4.**

---

## 3. Dimensional Analysis (Scored 1-10)

### 3.1 Correctness & Data Integrity

| Approach | Score | Rationale |
|:--|:--|:--|
| Blueprint (Redis Sets as Router) | 5/10 | Creates a dual-write problem. PG has the registry, Redis has the routing set. On restart, Redis is empty but PG has subscriptions → **silent delivery failure** until Redis is rehydrated. TTL drift between the two stores is a correctness hazard. |
| PG-First (FK on push_subscriptions) | 9/10 | Single source of truth. Atomic. `WHERE stage_id = $1` is correct by construction. No rehydration needed. Proven pattern for notification routing at this scale (see [best practices research](#references)). |

### 3.2 Operational Simplicity

| Approach | Score | Rationale |
|:--|:--|:--|
| Blueprint | 4/10 | Adds Redis to prod docker-compose. New service to monitor, secure, backup (even though it's ephemeral). On your 4GB VPS, that's another `mem_limit` container competing for RAM. |
| PG-First | 9/10 | Zero new moving parts. Your ops manual, monitoring, backups, SSH tunnel debugging — all unchanged. The [ops-manual.md](file:///Users/kryspin/personal/projects/djwcs/pika/pika/docs/ops-manual.md) doesn't need a Redis section. |

### 3.3 Performance at Target Scale (1 DJ / ≤300 dancers)

| Approach | Score | Rationale |
|:--|:--|:--|
| Blueprint | 7/10 | Redis would be fast, but it's solving a problem that doesn't exist at 300 dancers. The push broadcast to 300 endpoints is a ~50ms Postgres query. |
| PG-First | 9/10 | Postgres handles this trivially. Bun's in-memory pub/sub is already O(session subscribers). No additional latency from a Redis hop. |

### 3.4 Security

| Approach | Score | Rationale |
|:--|:--|:--|
| Blueprint | 6/10 | Redis requires network security configuration, ACLs, possibly TLS. Another attack surface. Your [security.md](file:///Users/kryspin/personal/projects/djwcs/pika/pika/docs/architecture/security.md) threat model would need updating. |
| PG-First | 9/10 | Postgres security is already hardened (parameterized queries, bcrypt, SHA-256 tokens, CORS, CSP). No new attack surface. |

### 3.5 Future Scalability (When the Signal Comes)

| Approach | Score | Rationale |
|:--|:--|:--|
| Blueprint | 8/10 | Would have Redis ready. But building it now means maintaining it during the months before you need it. |
| PG-First + Deferred Redis | 9/10 | Topics.ts abstraction makes the swap mechanical (~1-2 days). Valkey is a drop-in. The architecture is *designed* for this swap. Deferring costs nothing architecturally. |

### 3.6 Shipping Velocity

| Approach | Score | Rationale |
|:--|:--|:--|
| Blueprint | 4/10 | Phase 1-3 is massive: Redis infra + Stage model + push rework + Spotify OAuth + users table unification. This is a multi-month monolith that blocks shipping anything. |
| PG-First (Staged) | 9/10 | Stage/Event data model is a focused ~1 week effort. Push scoping is a half-day FK migration. Each is independently shippable and testable. |

### 3.7 Best Practices Alignment

| Approach | Score | Rationale |
|:--|:--|:--|
| Blueprint | 5/10 | Violates YAGNI. Introduces infrastructure before the signal demands it. The "Redis-First" framing leads with a solution rather than the problem. |
| PG-First | 10/10 | Textbook signal-driven architecture. Matches the project's own guiding principle in [persistence-hardening-backlog.md](file:///Users/kryspin/personal/projects/djwcs/pika/pika/docs/persistence-hardening-backlog.md#L8-L9): *"deferral here is signal-driven, not calendar-driven."* |

### 3.8 Licensing & Vendor Risk (Valkey vs Redis)

| Approach | Score | Rationale |
|:--|:--|:--|
| Blueprint (says "Redis") | 6/10 | The doc says "Redis" and "ioredis" throughout. Redis's SSPL/RSALv2 relicensing (2024) makes this a legal consideration for any future cloud hosting. |
| Second Opinion (says "use Valkey when ready") | 10/10 | Correctly identifies Valkey (BSD-licensed, Linux Foundation governed) as the right fork. AWS ElastiCache and Google Cloud Memorystore have both standardized on Valkey. Wire-compatible, `ioredis` works unchanged. |

---

## 4. Aggregate Score

| Dimension | Blueprint | PG-First + Deferred | Weight |
|:--|:--|:--|:--|
| Correctness & Data Integrity | 5 | 9 | ×3 |
| Operational Simplicity | 4 | 9 | ×2 |
| Performance at Target Scale | 7 | 9 | ×2 |
| Security | 6 | 9 | ×2 |
| Future Scalability | 8 | 9 | ×1 |
| Shipping Velocity | 4 | 9 | ×3 |
| Best Practices Alignment | 5 | 10 | ×2 |
| Licensing & Vendor Risk | 6 | 10 | ×1 |
| **Weighted Total** | **82/160** | **144/160** | |
| **Normalized** | **5.1/10** | **9.0/10** | |

---

## 5. What the Blueprint Gets RIGHT (Don't Lose This)

> [!TIP]
> The blueprint's **product thinking** is excellent. The second opinion agrees.

1. **The Stage abstraction** — a persistent context that outlives a DJ set — is the correct domain model for multi-DJ events. This is genuine product insight.

2. **QR Fatigue** (Problem B) is a real WCS-event pain point. Dancers shouldn't re-scan 4-5× per night.

3. **Scoped push** (Problem A) correctly identifies the "Global Megaphone" as a real bug.

4. **Event-level subscriptions** (Problem C) for organizer announcements are a natural, high-value, low-cost feature once Stage/Event exists.

5. **The 4-tier role hierarchy** (Guest → Dancer → DJ → Organizer) is a sound identity model.

---

## 6. What the Blueprint Gets WRONG

> [!WARNING]
> The blueprint conflates two independent concerns and leads with infrastructure rather than the domain model.

1. **Redis-First framing is backwards.** The Stage/Event model is a data + routing problem. Redis is an infrastructure choice. The blueprint leads with the infrastructure (Phase 1: "add Redis") when the features don't require it.

2. **The Hybrid Push Model (§4.2) creates a dual-write hazard.** Storing subscriptions in PG and routing sets in Redis means two sources of truth that can drift. A Postgres FK is simpler, more correct, and sufficient.

3. **Phase 3 (Identity/Spotify) should be its own blueprint.** It carries Spotify app-review, OAuth scope, quota constraints, and a real auth migration (`dj_users` → unified `users`). Coupling it to Stages/Redis makes the whole thing unshippable as a unit.

4. **The doc is stale.** "Approved / In Progress" for 5 months with zero implementation is a planning hazard.

---

## Final Recommendation: The 11/10 Path

> [!IMPORTANT]
> **Keep the Stage/Event product model. Drop Redis-First. Ship in focused, independently valuable phases.**

### Phase 0: Doc Hygiene (30 minutes)
- [ ] Fix blueprint status: "Approved / Not Started"
- [ ] Fix the false "Already Have: Redis/Valkey in docker-compose" claim
- [ ] Add deferral rationale to persistence backlog
- [ ] Note: Valkey (not Redis) when the time comes (licensing)

### Phase 1: Stage/Event Data Model (~1 week)
- [ ] Add `stages` and `events` tables to [schema.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/db/schema.ts)
- [ ] Add `stage_id` FK to `sessions` table
- [ ] Add `stage_id` FK to `push_subscriptions` table
- [ ] Extend [topics.ts](file:///Users/kryspin/personal/projects/djwcs/pika/pika/packages/cloud/src/lib/topics.ts) with `getStageSessionTopic()` and `getEventTopic()`
- [ ] Update push broadcast query: `WHERE stage_id = $1` (kills the Global Megaphone)
- [ ] Static stage creation (manual DB entries or admin endpoint)

### Phase 2: Client Integration (~1 week)
- [ ] Update Web client to subscribe to `topic:stage:{id}` + `topic:event:{id}`
- [ ] DJ selects Stage when starting a set
- [ ] Dancer scans Stage QR → auto-subscribed to Stage + parent Event
- [ ] Seamless DJ transitions within a Stage (dancer sees new DJ, no re-scan)

### Phase 3: Organizer Features (~1 week, independently shippable)
- [ ] Organizer announcement endpoint scoped to Event
- [ ] "Announcement Center" UI for organizers

### Phase 4: Valkey Swap (Signal-Driven, ~1-2 days when triggered)
**Trigger:** Sustained load a single Bun process can't hold (>2,500 concurrent), OR zero-downtime deploys become a requirement during live events.
- [ ] Add Valkey to prod/staging docker-compose
- [ ] Implement `ValkeyAdapter` for topics.ts
- [ ] Migrate in-memory Maps to Valkey structures (HSET, SETEX)
- [ ] **Use Valkey, not Redis** (BSD license, Linux Foundation governance)

### Phase 5: Identity & Spotify (Separate Blueprint)
- [ ] Split into its own blueprint document
- [ ] Spotify OAuth, 4-tier identity, users table unification
- [ ] Carries its own timeline, review, and rollout plan

---

## References

| Topic | Finding | Source |
|:--|:--|:--|
| Bun WS scaling | uWebSockets backend; 1M+ synthetic connections; real-world limited by app logic | Web search: Bun WebSocket benchmarks 2026 |
| Valkey vs Redis licensing | Valkey = BSD 3-Clause (Linux Foundation). Redis = SSPL/RSALv2/AGPLv3. AWS/GCP standardized on Valkey. | Web search: Valkey vs Redis 2025/2026 |
| PG LISTEN/NOTIFY vs Redis | PG fine for low-moderate volume; Redis for massive fan-out. "Start with PostgreSQL" is consensus recommendation. | Web search: PostgreSQL vs Redis pub/sub 2025 |
| Push notification routing | FK-based scoping in PG is standard practice. Redis Sets only warranted at massive scale. | Web search: push notification topic routing best practices |
| YAGNI/MVP infrastructure | "Build for the users you have today, not the ones you imagine having in two years." | Web search: YAGNI startup MVP 2025 |

---

## TL;DR

The blueprint's **product vision** (Stages, Events, scoped push, DJ rotation) is excellent and should be preserved. The blueprint's **technical strategy** (Redis-First) is premature, creates a dual-write hazard for push routing, and bundles too much into one monolithic plan.

The second opinion is **substantially correct**: build Stage/Event on Postgres + topics.ts, fix the Global Megaphone with a FK, and treat Valkey as a triggered scale-out swap. The one nuance: the dev docker-compose already has Valkey (contrary to the second opinion's claim), but no application code uses it.

**The 11/10 path is: brilliant product model + boring infrastructure + signal-driven scaling.**
