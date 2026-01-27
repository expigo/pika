# Pika! Next Architecture: The "Stage" & "Redis" Era

**Date:** 2026-01-27
**Status:** Approved / In Progress
**Context:** Result of the "Global Megaphone" audit and strategic planning session.

## 1. The Core Problems

### Problem A: The "Global Megaphone" (Push Notifications)
*   **Issue:** The initial implementation broadcasted push notifications to *all* subscribers in the database.
*   **Result:** A user attending an event in London would receive alerts about a DJ playing in Tokyo.
*   **Requirement:** Strict scoping of notifications to the relevant context.

### Problem B: The "QR Fatigue" (Event Lifecycle)
*   **Issue:** Pika! was designed around "Sessions" (tied to a DJ).
*   **Result:** In a real WCS event, DJs rotate every 2 hours. A Dancer would need to re-scan a QR code or visit a new link 4-5 times a night to stay "connected" to the current music.
*   **Requirement:** A persistent context that outlives individual DJ sets.

---

## 2. The Solution: "The Stage"

We are introducing a new abstraction layer: **The Stage**.

*   **Concept:** A Stage represents a physical location (e.g., "Main Floor", "Hotel Lobby", "WCS Budapest 2026").
*   **Persistence:** A Stage exists independently of who is playing.
*   **Flow:**
    1.  **Dancer:** Scans one QR code for the "Main Floor" upon arrival.
    2.  **System:** Dancer is subscribed to the **Stage Topic**.
    3.  **DJ:** When starting a set, selects "Broadcasting to: Main Floor".
    4.  **Transition:** When DJ A stops and DJ B starts on the same Stage, the Dancer (without touching their phone) automatically sees the new tracklist and receives the "DJ B is live" notification.

### Problem C: The "Information Gap" (Event Logistics)
*   **Issue:** Dancers often miss last-minute schedule changes, workshop announcements, or competition calls because they rely on static Facebook posts or loud PA announcements.
*   **Opportunity:** Pika! is already in their pocket during the event.
*   **Requirement:** A direct channel for Organizers to push non-music updates.

---

## 3. The Solution: "The Event Subscription" (New)

We are elevating the architecture to support **Event-Level Subscriptions**.

*   **Concept:** An "Event" is a collection of Stages (e.g., "WCS Budapest 2026" contains "Main Floor" and "Workshops Room").
*   **Flow:**
    1.  **Implicit Subscription:** When a Dancer joins *any* Stage (e.g., "Main Floor"), they are automatically subscribed to the parent **Event Topic**.
    2.  **Explicit Value:** Dancers receive logistical updates ("Workshop B starting now") without needing to "Follow" a separate page.
    3.  **Organizer Power:** The Organizer has an "Announcement Center" to broadcast messages like:
        *   "Competitions starting in 15 mins!"
        *   "Social dancing extended until 4 AM!"
    4.  **Technology:** Utilizes the same Redis Topic architecture (`topic:event:{eventId}`), requiring zero additional infrastructure complexity.

---

## 4. Technical Strategy: Redis-First

To enable this real-time, topic-based routing efficiently, we are adopting **Redis** as the core infrastructure for ephemeral state.

### 4.1 Infrastructure Responsibilities

| Component | Technology | Responsibility |
| :--- | :--- | :--- |
| **Routing Layer** | **Redis (Pub/Sub & Sets)** | Managing active `Topic` subscribers. Mapping `SessionID` -> `StageID`. |
| **Hot State** | **Redis** | Current Track, Listener Counts, Active Polls, Rate Limits. |
| **Persistence** | **Postgres** | User Accounts, Session History, Song Logs, Analytics. |
| **Identity** | **Postgres** | Storing Push Keys (p256dh/auth), User Profiles. |

### 4.2 The Push Notification Architecture

We will use a **Hybrid Storage** model:

1.  **Postgres (`push_subscriptions`):** The **Registry**.
    *   Stores `endpoint`, `keys`, `created_at`.
    *   Source of truth for "How to talk to this device".
2.  **Redis (`sets`):** The **Router**.
    *   Key: `topic:stage:{stageId}` -> Set of `endpoints`.
    *   Key: `topic:event:{eventId}` -> Set of `endpoints` (Implicit Parent).
    *   Operation: `SADD` (Subscribe), `SREM` (Unsubscribe), `SMEMBERS` (Broadcast).

**Verification of "Global Megaphone" Fix:**
*   Broadcast = `SMEMBERS topic:stage:{activeStage}`
*   This is inherently isolated. A user in "Stage A" is not in the set for "Stage B".

---

## 5. The Roles Hierarchy

The system moves from a binary (DJ/Guest) to a 4-tier model.

### 1. The Guest (Anonymous)
*   **Identity:** Browser Cookie (`clientId`) + Push Endpoint.
*   **Permissions:** Read-Only + Ephemeral Writes (Votes, Likes).
*   **Value:** Zero friction. Scan & Dance.

### 2. The Dancer (Registered)
*   **Identity:** Spotify Account (via OAuth).
*   **Permissions:** Guest + **Library Write**.
*   **Killer Feature:** "Heart" a track on Pika! -> Auto-saves to "Pika! Likes" playlist on Spotify.
*   **Data:** Likes & History persist across devices.

### 3. The DJ
*   **Identity:** Pika Account (Email/Pass).
*   **Permissions:** Broadcast Tracks, Manage Polls.
*   **Interface:** Desktop App.

### 4. The Organizer
*   **Identity:** Pika Account.
*   **Permissions:** Create Stages, Assign DJs to Stages, View Aggregate Analytics.
*   **Value:** "Who kept the floor full?"

---

## 6. Implementation Roadmap

### Phase 1: Infrastructure (Immediate)
*   [ ] Add Redis to `docker-compose`.
*   [ ] Install `ioredis` in Cloud package.
*   [ ] Create `RedisClient` singleton.

### Phase 2: The "Stage" & Topics
*   [ ] Refactor Push Logic: Implement Hybrid Model (Postgres Registry + Redis Topics).
*   [ ] Define "Static Stages" (e.g., manual DB entries for now).
*   [ ] Define "Static Events" (Parent Topics).
*   [ ] Update Client to subscribe to `topic:stage:{id}` + `topic:event:{id}`.

### Phase 3: Identity & Spotify
*   [ ] Integrate `Auth.js` (NextAuth) with Spotify Provider.
*   [ ] Create `users` table unification (DJs are just Users with a Role).
*   [ ] Implement "Link Account" flow for existing anonymous Dancers.

---

## 7. Migration Strategy

*   **Database:** Existing `push_subscriptions` will be treated as "Legacy". We will likely wipe them or migrate them to a default topic on first deploy.
*   **DJs:** Existing `dj_users` will be migrated to the new `users` table via a migration script.
