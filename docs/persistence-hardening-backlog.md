# Persistence-Layer Hardening — Remaining Work

**Purpose:** a durable backlog of persistence work we deliberately deferred, so we don't
lose it. Consult this when a real event, real usage data, or a reported bug gives us the
*signal* that one of these is now worth doing.

**Guiding principle:** deferral here is **signal-driven, not calendar-driven**. Go-live is
undated (could be a week or a year out). Most items below are scale/perf/cosmetic — build
them when usage shows they bite, not speculatively. The exception is anything that touches
**migrations or stored-data shape**: that is cheapest *pre-launch while data is disposable*,
so it jumps the queue (that's why the desktop migrator was done already).

Companion: the empirical audit lives in the agent memory `storage-layer-audit.md`.

---

## Done already (context — June 2026)

All **C-tier resilience** is complete and tested, plus two structural wins:

- **W1** — ACK-gated, idempotent offline-like flush (web). Queue cleared only on server ACK.
- **W2** — bounded localStorage (liked-sessions capped to 30; stale `pika_tempo_*` swept).
- **C3** — go-live track buffer (cloud): a play broadcast before its session row persists is
  buffered + flushed, never silently dropped.
- **Cloud real-DB test coverage** — `db.integration.test.ts` now exercises the real
  `persist*` functions (was ~10–40%).
- **Desktop drizzle migrator adoption** — `schema.ts` is the single source of truth;
  versioned migrations applied at startup; baseline-adopts existing DBs.

Everything below is what's **left**.

---

## Remaining work

Effort: **S** ≈ <½ day · **M** ≈ 1–2 days · **L** ≈ multi-day. "Trigger" = the signal that
makes it worth doing.

### Cloud (Postgres)

| # | Item | What / where | Trigger | Effort |
|---|------|--------------|---------|--------|
| 1 | **PG retention / partitioning** | `session_events` gets a row per connect/disconnect/reconnect (`lib/protocol.ts` `logSessionEvent`); `played_tracks`/`likes`/`*_votes` never pruned. `cleanupStaleSessions` (`index.ts`) only clears in-memory state. | Tables grow across many events / weeks of real use. | M |
| 2 | **C4 — like→latest-play attribution** | `persistLike` resolves the play via `ORDER BY played_at DESC LIMIT 1` (`lib/persistence/tracks.ts`). A song repeated in one set mis-attributes the first like to the second instance. Session like-*count* is correct; only the recap instance is wrong. | Recaps show wrong per-instance attribution for repeated tracks. | M (protocol change — client must send a play-instance id) |
| 3 | **C5 — per-session queue head-of-line blocking** | `enqueuePersistence` (`lib/persistence/queue.ts`) serializes *all* persistence per session; a slow op delays that session's later ops. Serialization is load-bearing for ordering + dedup, so don't remove it casually. | Sustained high write volume per session (won't happen at ≤300). | L |
| 4 | **ACK = "accepted", not "committed"** | `handleSendBulkLike` (`handlers/dancer.ts`) sends the ACK after enqueuing the *fire-and-forget* `persistLike`; a cloud crash between ACK and the queued DB write loses a few likes. | Observed like loss after a crash (very rare on one monitored server). | S–M (await persist before ACK; trades ACK latency) |

### Web (PWA)

| # | Item | What / where | Trigger | Effort |
|---|------|--------------|---------|--------|
| 5 | **Half-open online-like loss** ⭐ | A like sent while the socket *reports* `OPEN` but is actually dead (the ~30 s window before the heartbeat notices) is `send()`-and-forget, **not** queued → lost. W1 fixed the socket-reports-closed case; this is the long tail. `sendLike` online branch (`hooks/live/useLikeQueue.ts`). | First event shows lost likes on bad venue wifi. | M (ACK-gate single online likes / route all likes through the queue) |
| 6 | **Offline history (IndexedDB)** | Track history is memory-only; lost on reload when offline. PWA audit: ❌ Offline History (`hooks/live/useTrackHistory.ts`). | Offline history becomes a desired feature. | M |
| 7 | **Offline voting (background queue)** | Tempo votes are UI-only when offline — `sendTempoRequest` no-ops if the socket isn't open (`hooks/live/useTempoVote.ts`); no queue. PWA audit: ❌ Offline Voting. | Offline voting becomes a desired feature. | M |

⭐ = top resilience follow-up if we want one more before relying on the system at a live event.

### Desktop (SQLite)

| # | Item | What / where | Trigger | Effort |
|---|------|--------------|---------|--------|
| 8 | **savedSets true atomicity** (confirmed) | `savedSetRepository.ts` uses raw `BEGIN/COMMIT` over the tauri-plugin-sql connection **pool** — statements can land on different connections, so it isn't reliably atomic (a partial set-save is possible). **Confirmed real** during the migrator work (same reason the migrator avoids `BEGIN/COMMIT` and uses idempotent `IF NOT EXISTS`). Off the live event path (local set editor); a partial save is recoverable by re-saving. | Partial/corrupt set-save observed, or before the set editor is heavily used. | M (needs a Rust-side single-connection tx command; or make ops idempotent/recoverable) |
| 9 | **`synchronous=NORMAL` + `ANALYZE`** | SQLite tuning in `db/index.ts` `initializeDb`. `NORMAL` (safe under WAL) cuts fsyncs; `ANALYZE` gives the planner stats. No problem observed; `NORMAL` changes durability semantics, so do it deliberately. | Local write/query slowness during analysis or library browsing. | S |
| 10 | **Library-load pagination** | `trackRepository.getAllTracks` loads ≤10k rows at once. Virtual scrolling handles rendering; this is startup memory only. | DJs with >10k-track libraries report slow startup. | M |

### Cross-cutting / process

| # | Item | What / where | Trigger | Effort |
|---|------|--------------|---------|--------|
| 11 | **Dedupe drizzle-orm versions** | Both `drizzle-orm@0.45.1` and `0.45.2` resolve in the lockfile (a transitive pulls 0.45.1; our deps want `^0.45.2`). Harmless but untidy. | Next dependency cleanup. | S |
| 12 | **Redis/Valkey scale-out swap** | All hot relay state is per-process in-memory Maps + Bun pub/sub (`lib/topics.ts`, which already maps 1:1 onto pub/sub channels). A `valkey` container exists in dev `docker-compose.yml` but is **unused by app code** and absent from prod/staging. Swapping enables multi-instance horizontal scale and/or sessions surviving a restart (zero-downtime deploys). **Use Valkey, not Redis** (BSD/Linux-Foundation vs Redis SSPL/RSALv2 relicensing). NOT feature infra — the Stage/Event model is built on Postgres + Bun pub/sub, not this. See `blueprints/architecture_decision_analysis.md`. | Sustained load one Bun process can't hold (>~2,500 concurrent), OR zero-downtime deploys become required *during* live events. Neither holds at 1-DJ / ≤300. | L |

---

## Recommended order (when signal arrives)

1. **#5 half-open online-like ACK-gating** — only if the first live event shows lost likes; it
   completes the W1 story and is the most event-relevant.
2. **#1 PG retention** — once cloud rows accumulate over real use.
3. **#8 savedSets Rust-tx atomicity** — when the set editor sees real use (it's a confirmed gap).
4. **#4 ACK-commit window**, **#2 C4 attribution** — only if observed.
5. **#9 / #10 / #6 / #7 / #11** — perf/feature/cleanup, as demand appears.

Nothing here blocks a 1-DJ / ≤300-dancer first event.

---

## Pending validation (not code TODOs — confirm before trusting this session's work live)

- **Migrator live smoke** — `tauri dev` on a machine with an existing `pika.db` → confirm it
  starts, `__drizzle_migrations` shows `0000` adopted, library/sessions intact; then delete
  `pika.db`, restart → fresh full schema. (Unit/integration tests pass; this is the real-app
  confirmation.)
- **Cloud drizzle 0.38→0.45 bump** — run a live cloud smoke at event-readiness (the bump is
  test-green but hasn't been exercised against a live session end-to-end).
- **W1 e2e against the current build** — re-run the gated `tests/e2e/specs/w1-offline-like.spec.ts`
  (`RUN_W1_E2E=1`, non-test cloud + Postgres) before an event.
