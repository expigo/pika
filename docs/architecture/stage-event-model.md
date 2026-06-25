# Stage / Event Model

**Status:** Implemented (cloud + web + desktop) — June 2026. Event-wide announcements:
infrastructure in place, trigger deferred (see [§8](#8-whats-deferred)).

The canonical design for Pika!'s multi-DJ venue model. Companion to
[realtime-infrastructure.md](realtime-infrastructure.md) (topic routing) and the decision
record [blueprints/architecture_decision_analysis.md](../blueprints/architecture_decision_analysis.md)
(why Postgres + Bun pub/sub, not Redis).

---

## 1. Why

Pika! was built around per-DJ **Sessions**. Two real WCS-event problems broke that, plus a bug:

- **QR fatigue** — DJs rotate every ~2h; a dancer shouldn't re-scan 4–5×/night to follow a floor.
- **Seamless rotation** — DJ A → DJ B on the same floor should be invisible to the dancer.
- **The "Global Megaphone"** (bug) — push was broadcast to *all* subscriptions unscoped, so a
  dancer at one event could get another event's alert.

## 2. The model

- **Event** — a collection of stages (e.g. "WCS Budapest 2026"). Owns event-wide announcements.
- **Stage** — a persistent venue floor (e.g. "Main Floor") that **outlives any single DJ set**.
  Dancers subscribe to a *stage*.
- **Session** — unchanged: one DJ's set. Now optionally runs *under* a stage. Remains the unit
  of persistence, recap, likes, polls, tempo.

A session with **no** `stageId` behaves exactly as before — every FK and field is additive and
nullable, so the legacy `/live/[sessionId]` path is untouched.

## 3. Data model (`packages/cloud/src/db/schema.ts`, migration `0001`)

| Table | Key columns | Notes |
|---|---|---|
| `events` | `id` (text PK), `name`, `ownerUserId → dj_users` (set null), `archivedAt` | soft-delete |
| `stages` | `id` (text PK), `eventId → events` (cascade, **nullable**), `name`, `archivedAt` | stand-alone stage allowed |
| `stage_subscriptions` | `(stageId → stages cascade, clientId)` unique | durable membership → arms scoped push |
| `sessions` | + `stageId → stages` (**set null**, nullable) | a stage-less session = legacy behavior |

`stage_subscriptions` is the single source of truth for push routing — it records *which client
is at which stage* durably, so push reaches **backgrounded/disconnected** devices (in-memory
listener state can't).

## 4. Topic routing (`lib/topics.ts`)

Four-tier hierarchy; per-audience topics make cross-audience delivery physically impossible:

| Topic | Carries | Who subscribes |
|---|---|---|
| `DISCOVERY_TOPIC` (`live-session`) | lifecycle (SESSION_STARTED/ENDED/EXPIRED, shutdown) | every connection |
| `event:{id}` | event-wide announcements | dancers on any stage of the event |
| `stage:{id}` | a staged session's high-frequency traffic | dancers via `SUBSCRIBE_STAGE` |
| `session:{id}` | a stage-less session's traffic (legacy) | dancers via `SUBSCRIBE` |

**The resolver is the load-bearing piece** (`lib/sessions.ts`):
- `getSessionBroadcastTopic(sessionId)` → `stage:{stageId}` if the session is staged, else
  `session:{id}`. Every dancer-facing publish site uses this (1:1 swap from `getSessionTopic`).
- `getSessionAudienceKey(sessionId)` → the **listener-count** key: `stage:{id}` when staged, else
  the raw `sessionId` (byte-identical to pre-stage behavior, so counting never regressed).

`lib/stages.ts` holds `stageActiveSession: Map<stageId, sessionId>` (which session is live on a
stage now) with a **rotation guard**: clearing only removes the mapping if it still points at the
clearing session, so DJ A's late teardown can't wipe DJ B's claim.

## 5. Lifecycle flows

**DJ go-live on a stage** (`handlers/dj.ts` `REGISTER_SESSION`): validate the `stageId` exists →
set `session.stageId` → `setStageActiveSession` → subscribe + broadcast on the resolved topic →
persist `sessions.stage_id`. SESSION_STARTED carries `stageId` so stage dancers can follow.

**Dancer joins a stage** (`handlers/subscriber.ts` `handleSubscribeStage`): subscribe to
`stage:{id}` + parent `event:{id}` → sync the current live session's now-playing/poll/announcement
→ count under the stage key → upsert a `stage_subscriptions` row (arms scoped push).

**Seamless rotation:** the dancer stays on `stage:{id}`. DJ B's session resolves to the *same*
topic, so B's broadcasts arrive with **no re-subscribe**. The web client
(`useLiveListener`) follows via: `NOW_PLAYING` (reveals the live DJ), `SESSION_STARTED(stageId)`
(swap DJ, reset track/history/poll), `SESSION_ENDED(stageId)` (show "waiting for next DJ" — *not*
"over" — and keep the audience count).

**Session end on a stage:** stage listeners **persist** across rotation; only a stage-less session
clears its listeners on end. The audience topic + stageId are captured *before* `deleteSession`.

## 6. Scoped push (the Global Megaphone fix) — `lib/persistence/push-targets.ts`

```
getStagePushTargets(stageId)  = push_subscriptions ⋈ stage_subscriptions ON client_id WHERE stage_id = $1
getEventPushTargets(eventId)  = … ⋈ stages WHERE event_id = $1   (dedup by endpoint)
getAllActivePushTargets()     = legacy global broadcast
```

A DJ announcement scopes to the session's stage (`getAnnouncementPushTargets`) and **falls back to
global only for stage-less sessions** — correct, since there's no concurrent context to leak across
without stages. `/api/push/send` stays global (documented admin/debug tool).

## 7. Provisioning

No full organizer UI yet (deferred — see §8), but a DJ can self-serve as the de-facto organizer
of their own events. Endpoints (`routes/stages.ts`): `POST /api/events`, `POST /api/stages` (DJ
bearer token; owner = the token's DJ), public `GET /api/stages/:id` + `GET /api/events/:id/stages`,
owner-scoped `GET /api/events`.

The desktop Go-Live modal's `StageSelector` (collapsed by default → standalone) offers three modes
via `services/stageApi.ts`:
- **Pick** — choose one of the DJ's *owned* events → stages (`fetchDjEvents`/`fetchEventStages`).
- **Create** — make an Event + Stage (`createEvent`/`createStage`) — the DJ-as-organizer path.
- **Join by code** — paste a stage **id** (its share-link id) → `fetchStageById` validates it →
  the DJ broadcasts onto a stage they **don't own** (guest-DJ / cross-owner rotation). This works
  because `REGISTER_SESSION` validates stage *existence*, not ownership.

**Seed:** `bun run db:seed:stages -- dj@example.com` owns the seeded events to that DJ (so they show
in the owner-scoped picker); without an email they're created unowned (reachable by stage id only).

**Known limitation:** a join-by-code stage isn't owned, so it won't appear in that DJ's *picker*
next time — they re-enter the code. Owner-side discovery of shared stages is the Organizer role's job.

**Safety net:** while live, the chosen stage is shown prominently — a badge in the LiveControl panel
and the full-screen `LiveHUD`, plus a "Broadcasting to: {stage}" line in the QR header — so a
wrong-stage pick is obvious immediately. (`currentStageId`/`currentStageName` live in `useLiveStore`,
set by `goLive`, cleared on end.)

## 8. What's deferred

- **Event-wide announcements (feature):** the *infrastructure* exists — dancers auto-subscribe to
  `event:{id}`, and `getEventPushTargets` scopes the push. What's missing is the **trigger** and
  its auth: who may broadcast to a whole event. Cleanest path: an event-owner REST endpoint
  (`POST /api/events/:id/announce`) gated on `events.ownerUserId`, broadcasting `ANNOUNCEMENT_RECEIVED`
  to `event:{id}` + `getEventPushTargets`, plus a small web change to route an event-scoped
  announcement into the existing banner. Gated on the **organizer-identity** decision below.
- **Organizer identity / 4-tier roles, Spotify:** their own blueprint (per the decision analysis).
- **Stale-cleanup SESSION_ENDED `stageId`:** the 4h-idle cleanup omits `stageId` (no live dancers
  by then); harmless, noted in `index.ts`.

## 9. Backward-compatibility rules (invariants)

1. Every new FK/column is nullable; a stage-less session is byte-identical to pre-stage behavior.
2. `getSessionAudienceKey` keeps stage-less counting on the raw `sessionId` (no test/broadcaster drift).
3. Listener removal is **sticky** (`PARTICIPANT_TTL`) — a switched/closed dancer decays over ~5min;
   assert routing, not an instant 0.

## 10. Tests

Automated coverage spans all three packages (the logic is in pure, unit-tested units so the
hooks/components stay thin):

- **Cloud** — unit `__tests__/stage-routing.test.ts` (resolvers, rotation guard,
  `handleSubscribeStage`, seamless handover) + `routes/stages.test.ts` (auth/validation);
  integration `db.integration.test.ts` (gated `RUN_DB_TESTS`): FK set-null + cascade, scoped-push
  isolation, real-DB `handleSubscribeStage` arming push, `GET /api/events`.
- **Web** — `hooks/live/joinMessage.test.ts` (SUBSCRIBE_STAGE/SUBSCRIBE/GET_SESSIONS choice) +
  `hooks/live/stageRotation.test.ts` (NOW_PLAYING peek + dedup, SESSION_STARTED follow / ignore,
  SESSION_ENDED → waiting and *never* terminal).
- **Desktop** — `config.test.ts` (`getStageListenerUrl` prod vs LAN), `services/stageApi.test.ts`
  (fetch + **create** + **fetchStageById** join-code, with graceful null/empty fallback),
  `hooks/useLiveStore.test.ts` (`setCurrentStage` set + cleared on reset),
  `hooks/live/registerMessage.test.ts` (REGISTER_SESSION includes `stageId`/`token` only when present).

## 11. Manual verification (event-readiness checklist)

Automated tests cover the units; this confirms the wired end-to-end behavior before relying on it
live. Needs a non-test cloud + Postgres, the web app, and the desktop app.

1. **Seed + provision** — `bun run db:seed:stages -- <your-dj-email>` (owns the events so they show
   in your picker). Or skip and use the modal's **Create** mode below. Note a stage id (`main-floor`).
2. **DJ A on the stage** — desktop Go-Live → expand "Broadcast to a stage" →
   **Pick** the seeded stage, or **Create** an Event+Stage, or **Join by code** (paste a stage id) →
   go live. Confirm the QR points to `/stage/{id}` (not `/live/{session}`) and the **stage badge**
   shows in the control panel + full-screen HUD + QR header.
3. **Dancer joins** — scan the stage QR (or open `/stage/{id}`). Confirm now-playing, likes, tempo,
   listener count all work; the like/reaction lands (check the DJ's feedback).
4. **Seamless rotation** — DJ A ends; DJ B goes live on the **same** stage. The dancer's phone
   should switch to DJ B's name + track **with no reload/re-scan**, history resets, listener count
   stays stable. Verify in the dancer's network panel that **no new SUBSCRIBE_STAGE** was sent.
5. **Lull** — end DJ B with no replacement. The dancer shows a "waiting for the next DJ" state, not
   "session over"; reconnects/wake-ups (background the tab ~10s, return) re-sync cleanly.
6. **Scoped push** — with the dancer subscribed, the DJ sends an announcement *with push*. Confirm
   the push arrives. Confirm a dancer on a *different* stage/event does **not** receive it
   (the Global Megaphone fix). A stage-less session's announcement still reaches its audience.
7. **Backward-compat** — a normal `/live/{sessionId}` session (no stage) behaves exactly as before.
