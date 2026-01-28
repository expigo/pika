# Pika! Architecture Evolution Roadmap V2 (REVISED)

**Date:** 2026-01-28
**Author:** Principal Lead Architect
**Status:** ACTIONABLE PLAN (Ready for Implementation)
**Previous Version:** [ARCHITECTURE_EVOLUTION_ROADMAP.md](./ARCHITECTURE_EVOLUTION_ROADMAP.md)

---

## 🎯 Executive Summary

This is a **pragmatic revision** of the original roadmap based on critical constraints and domain-specific insights:

### **Key Changes from V1**

| Dimension | V1 (Original) | V2 (Revised) | Impact |
|-----------|---------------|--------------|--------|
| **Duration** | 15 weeks | **9 weeks** | 40% faster |
| **Spotify Dependency** | Hard blocker (Phase 3-4) | **Optional enhancement** | Non-blocking |
| **Redis Migration** | High complexity (dual-write) | **Trivial** (clean abstraction exists) | -5 days |
| **Stage Binding** | Strict enforcement (locking) | **Casual coordination** (social norms) | -3 days |
| **Schedule UI** | Drag-and-drop calendar | **Simple CRUD + notify button** | -5 days |
| **Data Strategy** | Automated fuzzy matching | **DJ-driven crowdsourcing** | 10/10 brilliance |

### **Core Philosophy Shift**

```
V1: Build complete platform features
V2: Build user story outcomes

V1: Architect for scale (Redis clustering, vector search)
V2: Ship for validation (in-memory ok, crowdsource data)

V1: Full-featured dashboards
V2: Minimum viable interfaces
```

---

## 📖 User Stories Framework

All work is organized around **deliverable user outcomes**, not technical tasks.

### **Persona Map**

```
┌─────────────────────────────────────────────────────────┐
│                     THE PIKA! ECOSYSTEM                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  👤 DANCER (Anonymous → Registered)                    │
│  └─ "I want to remember songs without friction"        │
│                                                         │
│  🎧 DJ (Semi-Pro)                                      │
│  └─ "I want to promote my sets on Spotify"             │
│                                                         │
│  📋 ORGANIZER (Event Host)                             │
│  └─ "I want dancers to never miss schedule changes"    │
│                                                         │
│  🔧 PLATFORM OWNER (You)                               │
│  └─ "I want to maintain quality and prevent abuse"     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🎭 Persona 1: The Dancer

**Archetype**: Sarah, 28, intermediate WCS dancer, attends 2-3 events/month

### **US-D1: Instant Access** 🌟 CRITICAL
```
As a dancer arriving at an event,
I want to scan ONE QR code at the entrance,
So that I can see live music for the entire weekend without re-scanning.

Epic: Phase 2 (Stage Architecture)
Effort: 3 days
Value: Solves "QR Fatigue" problem
```

**Acceptance Criteria:**
- [ ] QR code scan takes <3 seconds to load
- [ ] I stay connected when DJs change on the same stage
- [ ] I receive push notifications when music starts
- [ ] Works without creating an account

**Technical Implementation:**
- Stage-level subscriptions (persistent across DJ changes)
- Stage QR codes (not session QR codes)
- WebSocket topic: `topic:stage:{stageId}`

---

### **US-D2: Remember That Song** ⭐ HIGH VALUE
```
As a dancer who heard an amazing song,
I want to tap "❤️ Like" on my phone,
So that I can find it later and add it to my Spotify.

Epic: Phase 3 (Identity) + Phase 4 (Smart Crate)
Effort: 4 days
Value: Core feature for dancer engagement
```

**Acceptance Criteria:**
- [ ] Like button visible on "Now Playing" screen
- [ ] Works without account (stored in browser localStorage)
- [ ] If I create account later, my likes are preserved (claim flow)
- [ ] Can export likes to Spotify playlist in one tap (when verified)

**Technical Implementation:**
```typescript
// Anonymous: localStorage
localStorage.setItem('pika:likes', JSON.stringify([...trackIds]));

// Registered: Database
INSERT INTO user_likes (user_id, played_track_id, liked_at);

// Claim flow: Migrate localStorage → DB
POST /api/auth/claim-guest
  → Copy localStorage likes to user account
```

---

### **US-D3: Don't Miss Anything** (Nice-to-Have)
```
As a dancer who wants to attend specific workshops,
I want to star items in the schedule and get notified 10 mins before,
So that I don't miss events I care about.

Epic: Phase 5 (Dancer Companion)
Effort: 3 days
Priority: Medium (deferred to post-MVP)
```

---

## 🎧 Persona 2: The DJ

**Archetype**: Marcus, 35, semi-pro DJ, plays 2-4 gigs/month, uses VirtualDJ

### **US-DJ1: Go Live in 30 Seconds** ✅ ALREADY WORKS
```
As a DJ starting my set,
I want to click "Go Live" and share a QR code,
So that dancers can join my session without setup complexity.

Epic: Phase 0 (Current - maintain)
Effort: 0 days (already implemented)
```

**No Changes Needed** - This is the "Easy Path" that must be preserved.

---

### **US-DJ2: Link to Event** 🌟 CRITICAL
```
As a DJ playing at an organized event,
I want to link my session to the event stage,
So that dancers who scanned the event QR automatically see my music.

Epic: Phase 2 (Stage Architecture)
Effort: 2 days
Value: Enables Stage persistence
```

**Acceptance Criteria:**
- [ ] Desktop app has TWO modes: "Quick Start" (no event) and "Event Mode" (select stage)
- [ ] Quick Start still works (standalone session) - PRESERVE EASY PATH
- [ ] When I select a stage, dancers already there see my session
- [ ] When I end, next DJ's session auto-appears for dancers

**Desktop App UX:**
```typescript
// packages/desktop/src/pages/GoLive.tsx
<Tabs>
  <Tab value="quick">
    Quick Start (No Setup) ← DEFAULT
  </Tab>
  <Tab value="event">
    Event Mode (Link to Stage)
  </Tab>
</Tabs>
```

---

### **US-DJ3: Track Verification** 🏆 KILLER FEATURE (10/10)
```
As a DJ who wants to promote my setlists,
I want to match my tracks to Spotify after my set,
So that I can export my setlist and share it on social media.

Epic: Phase 4 (Smart Crate)
Effort: 6 days
Value: HIGHEST - Creates irreplaceable data moat
```

**Acceptance Criteria:**
- [ ] After ending session, see "Verify Your Tracks" screen in Desktop app
- [ ] Shows VirtualDJ tracks with Spotify match suggestions (if API available)
- [ ] Can confirm, reject, or manually enter Spotify URI
- [ ] Tracks verified by 3+ DJs show as "Already matched ✓" (instant)
- [ ] When done, get "Export to Spotify" button
- [ ] Exported playlist is public with my name

**The Genius Strategy:**
```
Network Effect Loop:
1. DJ 1 verifies 50 tracks → 50 in global DB
2. DJ 2 plays 30 same tracks → 30 auto-matched, 20 to verify
3. DJ 3 plays 40 same tracks → 40 auto-matched, 10 to verify
...
After 50 DJs: 12,000 unique tracks verified (crowdsourced)

Competitive Moat: DJs can't switch platforms without losing this data
```

**Technical Implementation:**
```typescript
// POST /api/tracks/verify
{
  playedTrackId: number;
  spotifyUri: string;  // Can be manually entered
  vdjFileHash: string; // Link VDJ file to Spotify
}

// Future: When Spotify API available
suggestedMatches = [
  { source: 'internal', confidence: 1.0 },   // 3+ DJs verified
  { source: 'spotify', confidence: 0.85 },   // API suggestion
  { source: 'apple', confidence: 0.78 },     // Fallback
];
```

---

### **US-DJ4: Booking Management** (Future)
```
As a DJ who plays multiple events,
I want to see all my upcoming gigs in one calendar,
So that I don't double-book.

Priority: LOW (post-MVP, use Google Calendar for now)
```

---

## 📋 Persona 3: The Organizer

**Archetype**: Elena, 42, runs annual WCS weekend with 300 attendees, 4 stages

### **US-ORG1: Create Event** ⭐ HIGH VALUE
```
As an organizer planning a WCS weekend,
I want to create an event with multiple stages,
So that I can manage all music/announcements from one place.

Epic: Phase 2 (Stage/Event Architecture)
Effort: 3 days
```

**Acceptance Criteria:**
- [ ] Fill form: Event name, dates, timezone
- [ ] Add stages: "Main Floor", "Workshops Room", "Late Night"
- [ ] Each stage gets unique QR code (auto-generated)
- [ ] Can preview event page before publishing
- [ ] DJs can select this event when going live

**Simple UI (not drag-and-drop):**
```typescript
// POST /api/events
{
  name: "WCS Budapest 2026",
  startDate: "2026-03-15",
  endDate: "2026-03-17",
  stages: [
    { name: "Main Floor", capacity: 200 },
    { name: "Workshops Room", capacity: 50 }
  ]
}
```

---

### **US-ORG2: DJ Timetable** (Simplified)
```
As an organizer coordinating DJ schedules,
I want to set a simple timetable of who plays when,
So that DJs know their slots.

Epic: Phase 5 (Organizer Tools)
Effort: 3 days
Priority: Medium
```

**Acceptance Criteria:**
- [ ] Table view: Time | DJ | Stage
- [ ] Add/edit/delete slots (simple forms, NO drag-and-drop)
- [ ] Button: "Notify attendees of schedule change"

**UI Simplification:**
```typescript
// NOT THIS (V1 - too complex):
<DragDropContext onDragEnd={handleDragEnd}>
  <Draggable />
</DragDropContext>

// THIS (V2 - simple):
<table>
  <tr>
    <td>22:00</td>
    <td>DJ Marcus</td>
    <td>Main Floor</td>
    <td><Button>Edit</Button></td>
  </tr>
</table>
<Button onClick={notifyAttendees}>
  📢 Notify: Schedule Updated
</Button>
```

---

### **US-ORG3: Event Announcements** 🌟 CRITICAL
```
As an organizer during the event,
I want to push notifications to all attendees,
So that I can communicate last-minute changes immediately.

Epic: Phase 2.4 (Event Announcements)
Effort: 3 days
Value: Solves real pain point
```

**Acceptance Criteria:**
- [ ] Text box: "Competitions starting in 15 mins!"
- [ ] Priority levels: Info / Important / Urgent
- [ ] Toggle: Send push notification (yes/no)
- [ ] Preview who will receive (number of subscribers)
- [ ] All stage subscribers receive announcement

**Technical Implementation:**
```typescript
// POST /api/events/{eventId}/announcements
{
  message: "Competitions starting in 15 mins!",
  priority: "urgent",
  push: true
}

// Backend broadcasts to all stages
for (stage in event.stages) {
  publish(`topic:stage:${stage.id}`, announcement);
}
```

---

## 🔧 Persona 4: Platform Owner

**Archetype**: Kryspin, founder, ensures quality and prevents abuse

### **US-ADMIN1: Approve Organizers**
```
As the platform owner,
I want to manually approve organizer accounts,
So that I prevent spam events and maintain quality.

Epic: Phase 5 (Platform Admin)
Effort: 3 days
Priority: Medium
```

---

## 🗺️ Revised Implementation Roadmap

### **Timeline Comparison**

| Phase | V1 Duration | V2 Duration | Savings |
|-------|-------------|-------------|---------|
| Phase 0: Fixes | 1 week | 1 week | 0 |
| Phase 1: Infrastructure | 2 weeks | **1 week** | **-1 week** |
| Phase 2: Stage/Event | 3 weeks | **2 weeks** | **-1 week** |
| Phase 3: Identity | 2 weeks | **1 week** | **-1 week** |
| Phase 4: Smart Crate | 3 weeks | **2 weeks** | **-1 week** |
| Phase 5: Dashboards | 4 weeks | **2 weeks** | **-2 weeks** |
| **TOTAL** | **15 weeks** | **9 weeks** | **-6 weeks (40%)** |

---

## Phase 0: Critical Fixes (UNCHANGED)

**Duration:** 1 week
**Goal:** Production stability

### Sprint 0.1: Fix Global Megaphone (2 days)
- Add `subscribed_session_id` to `push_subscriptions` table
- Filter push broadcasts by session
- Test: DJ A's announcement doesn't reach DJ B's listeners

### Sprint 0.2: Fix Security Issues (3 days)
- Verify token storage method
- Add rate limiting to push subscribe endpoint
- Require DJ auth on WebSocket REGISTER_SESSION
- Strengthen CSP (nonce-based)

**User Story Delivered:** None (technical debt cleanup)

---

## Phase 1: Infrastructure Foundation (REVISED: 1 week, was 2 weeks)

**Goal:** Redis + Multi-topic pub/sub
**Complexity Reduction:** No data migration needed (not live)

### Sprint 1.1: Redis Client Integration (1 day)
```bash
cd packages/cloud && bun add redis
```

```typescript
// packages/cloud/src/lib/redis.ts
import { createClient } from 'redis';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

export async function initRedis() {
  await redis.connect();
}
```

**Acceptance Criteria:**
- [ ] Redis client connects on cloud startup
- [ ] Health check includes Redis status

---

### Sprint 1.2: Multi-Topic Pub/Sub (2 days)

**Problem:** Single `"live-session"` topic broadcasts to ALL clients
**Solution:** Topic-per-context routing

```typescript
// packages/cloud/src/lib/topics.ts
export const TOPIC_PREFIX = {
  SESSION: 'topic:session:',
  STAGE: 'topic:stage:',
  EVENT: 'topic:event:',
  SYSTEM: 'topic:system'
} as const;

export function getSessionTopic(sessionId: string): string {
  return `${TOPIC_PREFIX.SESSION}${sessionId}`;
}

export function getStageTopic(stageId: string): string {
  return `${TOPIC_PREFIX.STAGE}${stageId}`;
}
```

**Acceptance Criteria:**
- [ ] Clients only receive messages for subscribed topics
- [ ] Test: 100 sessions, 1000 clients, correct routing

---

### Sprint 1.3: Session State Migration (2 days, was 7 days)

**V1 Complexity:** Dual-write, feature flags, canary rollout
**V2 Complexity:** Direct replacement (clean abstraction, not live)

```typescript
// packages/cloud/src/lib/sessions.ts
// Change implementation, interface stays same

// BEFORE (in-memory):
const activeSessions = new Map<string, LiveSession>();
export function getSession(sessionId: string): LiveSession | undefined {
  return activeSessions.get(sessionId);
}

// AFTER (Redis):
import { redis } from './redis';
export async function getSession(sessionId: string): Promise<LiveSession | undefined> {
  const data = await redis.hGetAll(`session:${sessionId}`);
  if (!data.sessionId) return undefined;
  return JSON.parse(data.json);
}
```

**Why This is Trivial:**
1. ✅ Clean abstraction already exists ([sessions.ts:13](packages/cloud/src/lib/sessions.ts#L13))
2. ✅ All handlers import functions, not Map directly
3. ✅ Not live = no migration risk, just swap implementation
4. ✅ Tests validate both implementations work

**Acceptance Criteria:**
- [ ] All existing tests pass with Redis implementation
- [ ] Session TTL automatically expires inactive sessions (24h)
- [ ] Performance: <5ms for session operations

**User Story Delivered:** None (infrastructure)

---

## Phase 2: Stage & Event Architecture (REVISED: 2 weeks, was 3 weeks)

**Goal:** Deliver US-D1, US-DJ2, US-ORG1, US-ORG3

### Sprint 2.1: Schema Evolution (3 days)

**New Tables:**
```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  organizer_id INTEGER REFERENCES users(id),
  timezone TEXT DEFAULT 'UTC',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stages (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER,
  status TEXT DEFAULT 'active',
  qr_code_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE sessions ADD COLUMN stage_id TEXT REFERENCES stages(id);

CREATE TABLE stage_subscriptions (
  id SERIAL PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  push_endpoint TEXT REFERENCES push_subscriptions(endpoint),
  subscribed_at TIMESTAMP DEFAULT NOW(),
  unsubscribed_at TIMESTAMP,
  UNIQUE(stage_id, client_id)
);
```

**Acceptance Criteria:**
- [ ] Migration runs successfully on dev/staging
- [ ] Existing sessions continue working (backward compatible)

---

### Sprint 2.2: Stage CRUD API (3 days)

**Endpoints:**
```typescript
POST   /api/stages              → Create stage
GET    /api/stages/:stageId     → Get stage + active session
GET    /api/events/:eventId/stages → List stages
POST   /api/stages/:stageId/subscribe → Subscribe to stage
```

**Acceptance Criteria:**
- [ ] Organizer can create stages for event
- [ ] Dancer can subscribe to stage (via QR scan)
- [ ] Stage subscription persists across DJ changes

**User Story Delivered:** US-ORG1 (Create Event)

---

### Sprint 2.3: Session-Stage Binding (2 days, was 5 days)

**V1 Complexity:** Distributed locking, conflict resolution
**V2 Complexity:** Simple binding (WCS social norms, not technical enforcement)

```typescript
// handlers/dj.ts - REGISTER_SESSION
export async function handleRegisterSession(ctx: WSContext) {
  const { msg } = ctx;

  // EASY PATH: No stage required (standalone mode)
  if (!msg.stageId) {
    const session = await persistSession(sessionId, msg.djName, djUserId, null);
    sendAck(ws, messageId, { sessionId: session.id });
    return;
  }

  // EVENT MODE: Link to stage
  const stage = await db.query.stages.findFirst({
    where: eq(stages.id, msg.stageId),
  });

  if (!stage) {
    sendNack(ws, messageId, "Stage not found");
    return;
  }

  // NO LOCKING: Just bind (DJs coordinate socially)
  const session = await persistSession(sessionId, msg.djName, djUserId, msg.stageId);

  // Subscribe to stage topic
  rawWs.subscribe(getStageTopic(msg.stageId));

  // Notify stage subscribers: "DJ Marcus is now live"
  rawWs.publish(getStageTopic(msg.stageId), JSON.stringify({
    type: "DJ_LIVE",
    djName: msg.djName,
    sessionId,
  }));

  sendAck(ws, messageId, { sessionId: session.id });
}
```

**Key Decision:** No "stage already occupied" check (trust DJs to coordinate)

**Acceptance Criteria:**
- [ ] Desktop app has "Quick Start" and "Event Mode" tabs
- [ ] Quick Start still works without stage selection
- [ ] When DJ links to stage, stage subscribers receive updates
- [ ] When DJ ends, stage stays active (waiting for next DJ)

**User Story Delivered:** US-DJ2 (Link to Event), US-D1 (Instant Access)

---

### Sprint 2.4: Event-Level Announcements (3 days)

```typescript
// POST /api/events/{eventId}/announcements
{
  message: "Competitions starting in 15 mins!",
  priority: "urgent" | "info" | "warning",
  push: boolean
}
```

**Handler:**
```typescript
// Broadcast to all stages in event
for (const stage of event.stages) {
  rawWs.publish(getEventTopic(event.id), announcement);
}

// Send push to all stage subscribers
if (msg.push) {
  const subscribers = await getEventSubscribers(eventId);
  await broadcastPush(subscribers, {
    title: event.name,
    body: msg.message,
  });
}
```

**Acceptance Criteria:**
- [ ] Organizer can send event-wide announcements
- [ ] All stage subscribers receive announcement
- [ ] Push notifications respect subscription state

**User Story Delivered:** US-ORG3 (Event Announcements)

---

## Phase 3: Role-Based Identity (REVISED: 1 week, was 2 weeks)

**Goal:** Deliver US-D2 (Remember Songs)
**Spotify Removed:** Email/password primary, Spotify optional future enhancement

### Sprint 3.1: User Table Unification (2 days)

```sql
-- Rename dj_users to users
ALTER TABLE dj_users RENAME TO users;

-- Add role field
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'dj';

-- Add optional Spotify fields (for future)
ALTER TABLE users
  ADD COLUMN spotify_id TEXT,
  ADD COLUMN spotify_refresh_token TEXT,
  ADD COLUMN avatar_url TEXT;

-- Update foreign keys
ALTER TABLE dj_tokens RENAME COLUMN dj_user_id TO user_id;
ALTER TABLE sessions RENAME COLUMN dj_user_id TO user_id;
```

**Role Enum:**
```typescript
export const UserRole = {
  GUEST: 'guest',       // Anonymous (no DB record)
  DANCER: 'dancer',     // Email/password listener
  DJ: 'dj',             // Can broadcast
  ORGANIZER: 'organizer',
  ADMIN: 'admin',
} as const;
```

---

### Sprint 3.2: Dancer Email/Password Auth (3 days)

**NOT SPOTIFY OAUTH - Use simple email/password**

```typescript
// POST /api/auth/register/dancer
{
  email: string;
  password: string;
  displayName: string;
}

// POST /api/auth/login/dancer
{
  email: string;
  password: string;
}
```

**Implementation Options:**
1. **Use Lucia Auth** (recommended): Modern, lightweight, TypeScript-first
2. **Use Auth.js (NextAuth)**: Heavier but more features
3. **Roll your own**: bcrypt + JWT (simplest)

**Recommendation: Lucia Auth**
```bash
bun add lucia @lucia-auth/adapter-drizzle
```

---

### Sprint 3.3: Guest Account Claiming (2 days)

```typescript
// POST /api/auth/claim-guest
{
  clientId: string;       // From localStorage
  email: string;
  password: string;
  displayName: string;
}

// Backend logic:
1. Create dancer account
2. Find all likes/history with clientId
3. Update records: clientId → userId
4. Return: "5 liked songs transferred to your account"
```

**Acceptance Criteria:**
- [ ] Anonymous dancers can like tracks (localStorage)
- [ ] Creating account preserves likes
- [ ] Likes sync across devices after login

**User Story Delivered:** US-D2 (Remember Songs)

---

## Phase 4: Data Strategy - Smart Crate (REVISED: 2 weeks, was 3 weeks)

**Goal:** Deliver US-DJ3 (Track Verification)
**Strategy Shift:** DJ-driven crowdsourcing (not automated fuzzy matching)

### Sprint 4.1: Global Track Repository (3 days)

```sql
CREATE TABLE global_tracks (
  id SERIAL PRIMARY KEY,

  -- Identifiers
  spotify_uri TEXT UNIQUE,
  apple_music_id TEXT,
  isrc TEXT,

  -- Metadata
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_ms INTEGER,

  -- VDJ linkage (critical for crowdsourcing)
  vdj_track_id TEXT,
  file_hash TEXT,       -- SHA256 of audio file

  -- Verification
  verified_by INTEGER REFERENCES users(id),
  verified_at TIMESTAMP,
  verification_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE played_tracks
  ADD COLUMN global_track_id INTEGER REFERENCES global_tracks(id);
```

**Acceptance Criteria:**
- [ ] Global tracks table created
- [ ] Played tracks can link to global tracks
- [ ] Verification count tracks how many DJs confirmed

---

### Sprint 4.2: DJ Verification UI (5 days)

**Desktop App Enhancement:**

```typescript
// packages/desktop/src/pages/Logbook/SpotifyIntegrator.tsx

export function SpotifyIntegrator({ sessionId }: Props) {
  const { data: tracks } = useSWR(`/api/sessions/${sessionId}/unverified-tracks`);

  return (
    <div className="integrator">
      <h2>🎵 Verify Your Tracks</h2>
      <p>Match {tracks?.length} tracks to unlock Spotify export</p>

      {tracks?.map(track => (
        <TrackMatchCard
          key={track.id}
          vdjTrack={{
            title: track.title,
            artist: track.artist,
            fileHash: track.fileHash,
          }}
          suggestions={track.suggestions}  // From internal DB
          onConfirm={(spotifyUri) => confirmMatch(track.id, spotifyUri)}
          onManualEntry={() => openManualEntryModal(track)}
          onSkip={() => skipTrack(track.id)}
        />
      ))}

      {allVerified && (
        <Button onClick={exportToSpotify}>
          ✅ Export Setlist to Spotify
        </Button>
      )}
    </div>
  );
}
```

**Backend - Match Suggestions:**
```typescript
// GET /api/sessions/{sessionId}/unverified-tracks
export async function getUnverifiedTracks(sessionId: string) {
  const tracks = await db.query.playedTracks.findMany({
    where: and(
      eq(playedTracks.sessionId, sessionId),
      isNull(playedTracks.globalTrackId)
    ),
  });

  // For each track, find suggestions
  for (const track of tracks) {
    track.suggestions = [];

    // 1. Internal DB (instant, high confidence)
    if (track.fileHash) {
      const match = await db.query.globalTracks.findFirst({
        where: eq(globalTracks.fileHash, track.fileHash),
      });

      if (match && match.verificationCount >= 3) {
        track.suggestions.push({
          source: 'internal',
          confidence: 1.0,
          spotifyUri: match.spotifyUri,
          verifiedBy: match.verificationCount,
        });
      }
    }

    // 2. Spotify API (if available - future)
    if (FEATURE_FLAGS.SPOTIFY_AVAILABLE) {
      const spotify = await searchSpotify(track.title, track.artist);
      track.suggestions.push(...spotify);
    }
  }

  return tracks;
}
```

**Acceptance Criteria:**
- [ ] DJs see verification screen after ending session
- [ ] Tracks with 3+ verifications show as "Already matched ✓"
- [ ] Can manually enter Spotify URI
- [ ] Can skip tracks (not all need Spotify links)
- [ ] Verification count increments per DJ confirmation

**User Story Delivered:** US-DJ3 (Track Verification) - Part 1

---

### Sprint 4.3: Spotify Playlist Export (3 days)

```typescript
// POST /api/tracks/export-to-spotify
{
  sessionId: string;
  playlistName?: string;
}

// Backend:
export async function exportSetlistToSpotify(userId: number, sessionId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  // Require Spotify linked (future - when API available)
  if (!user?.spotifyRefreshToken) {
    throw new Error('Link Spotify account first');
  }

  // Get verified tracks
  const tracks = await db
    .select({ spotifyUri: globalTracks.spotifyUri })
    .from(playedTracks)
    .innerJoin(globalTracks, eq(playedTracks.globalTrackId, globalTracks.id))
    .where(and(
      eq(playedTracks.sessionId, sessionId),
      isNotNull(globalTracks.spotifyUri)
    ))
    .orderBy(asc(playedTracks.playedAt));

  // Create Spotify playlist
  const playlist = await createSpotifyPlaylist(
    user.spotifyRefreshToken,
    `DJ ${user.displayName}'s Set - ${formatDate(new Date())}`
  );

  // Add tracks
  await addTracksToPlaylist(playlist.id, tracks.map(t => t.spotifyUri));

  return { playlistUrl: playlist.external_urls.spotify };
}
```

**Acceptance Criteria:**
- [ ] Export creates public Spotify playlist
- [ ] Playlist includes all verified tracks
- [ ] Missing tracks noted in export report
- [ ] Returns shareable playlist URL

**User Story Delivered:** US-DJ3 (Track Verification) - Part 2

---

## Phase 5: UX Strategy - Dashboards (REVISED: 2 weeks, was 4 weeks)

**Goal:** Polish persona experiences
**Scope Reduction:** Simple interfaces, no drag-and-drop

### Sprint 5.1: Organizer Tools (4 days)

**Simple Schedule Manager (not drag-and-drop):**
```typescript
// packages/web/src/app/organizer/events/[eventId]/schedule/page.tsx

export default function SimpleSchedule({ eventId }: Props) {
  const { data: slots } = useSWR(`/api/events/${eventId}/schedule`);

  return (
    <div>
      <h2>DJ Timetable</h2>
      <Button onClick={openAddSlotModal}>+ Add Slot</Button>

      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>DJ</th>
            <th>Stage</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {slots?.map(slot => (
            <tr key={slot.id}>
              <td>{formatTime(slot.startTime)}</td>
              <td>{slot.djName}</td>
              <td>{slot.stageName}</td>
              <td>
                <Button onClick={() => editSlot(slot)}>Edit</Button>
                <Button onClick={() => deleteSlot(slot.id)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer>
        <Button onClick={notifyScheduleChange} variant="primary">
          📢 Notify Attendees: Schedule Updated
        </Button>
      </footer>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Organizer can add/edit/delete schedule slots
- [ ] One-click notify all attendees of changes
- [ ] No drag-and-drop needed (use forms)

**User Story Delivered:** US-ORG2 (DJ Timetable)

---

### Sprint 5.2: DJ Career Hub (Deferred)
**Priority:** LOW - Focus on core features first

---

### Sprint 5.3: Dancer Event Companion (3 days)

```typescript
// packages/web/src/app/dancer/likes/page.tsx

export default function MyLikes() {
  const { data: likes } = useSWR('/api/dancer/likes');

  return (
    <div>
      <h1>My Music Journal</h1>
      {likes?.byEvent.map(event => (
        <section key={event.id}>
          <h2>{event.name}</h2>
          <TrackList tracks={event.tracks} />
          <Button onClick={() => exportToSpotify(event.tracks)}>
            Export to Spotify
          </Button>
        </section>
      ))}
    </div>
  );
}
```

---

### Sprint 5.4: Platform Admin (3 days)

**Organizer Approval Inbox:**
```typescript
// packages/web/src/app/admin/applications/page.tsx

export default function AdminApprovals() {
  const { data: applications } = useSWR('/api/admin/applications?status=pending');

  return (
    <div>
      <h1>Pending Organizer Applications</h1>
      {applications?.map(app => (
        <ApplicationCard
          key={app.id}
          application={app}
          onApprove={() => approveOrganizer(app.id)}
          onReject={() => rejectOrganizer(app.id)}
        />
      ))}
    </div>
  );
}
```

**User Story Delivered:** US-ADMIN1 (Approve Organizers)

---

## 📊 Success Metrics (Revised)

| Phase | KPI | Target |
|-------|-----|--------|
| 0 | Push notification bugs | 0 complaints |
| 1-2 | Dancers scan once per event | >90% retention across DJ changes |
| 3 | Dancer account signups | 50 in first month |
| 4 | Track verification rate | >80% of played tracks verified |
| 4 | Global track database growth | 10,000 unique tracks in 3 months |
| 5 | Organizer NPS | >50 |

---

## 🎯 MVP Delivery Strategy

### **Week 1-3: MVP 1 (Foundation)**
✅ Phase 0: Fixes
✅ Phase 1: Infrastructure
✅ Phase 2: Stage/Event

**Outcome:** Dancers scan once, Organizers can announce

---

### **Week 4-5: MVP 2 (Identity & Data)**
✅ Phase 3: Email auth + guest claiming
✅ Phase 4.1-4.2: Track verification UI

**Outcome:** Dancers remember songs, DJs verify tracks

---

### **Week 6-7: MVP 3 (Export & Polish)**
✅ Phase 4.3: Spotify export
✅ Phase 5: Simple dashboards

**Outcome:** DJs export to Spotify, Organizers manage events

---

### **Week 8-9: Beta Testing**
- Deploy to staging
- 1 beta event (Elena's event)
- Collect feedback
- Fix critical issues

---

## 🚨 Risk Mitigation

| Risk | V1 Likelihood | V2 Likelihood | Mitigation |
|------|---------------|---------------|------------|
| Redis breaks features | Medium | **Low** | Clean abstraction, easy rollback |
| Spotify API blocks us | High | **Zero** | Spotify is optional enhancement |
| Stage conflicts (2 DJs) | High | **Low** | Social coordination, not technical enforcement |
| DJs won't verify tracks | Medium | **Low** | Incentive: Export to Spotify requires verification |

---

## 📦 Dependencies & Prerequisites

### **External Services**
- ✅ **NOT REQUIRED:** Spotify API (optional future enhancement)
- ✅ **Already Have:** Redis/Valkey (in docker-compose)
- ✅ **Already Have:** Postgres (in docker-compose)

### **New Dependencies**
```bash
# Phase 1
bun add redis

# Phase 3
bun add lucia @lucia-auth/adapter-drizzle  # Email/password auth

# Phase 4
# No new dependencies (Spotify SDK only needed when API available)
```

---

## 🎬 Next Steps (Immediate Actions)

### **This Week:**
1. ✅ **Approve this roadmap** → Get team alignment
2. ✅ **Create Sprint 0 tickets** → GitHub issues for Phase 0
3. ✅ **Set up environments** → Document dev/staging/prod .env files

### **Next Week (Phase 0):**
1. Sprint 0.1: Fix Global Megaphone (2 days)
2. Sprint 0.2: Security fixes (3 days)
3. **Ship to staging** → Validate fixes work

---

## 📚 Reference Documents

- [Original Roadmap V1](./ARCHITECTURE_EVOLUTION_ROADMAP.md)
- [Pika! Next Architecture](./pika-next-architecture.md)
- [Data Strategy](./data-strategy.md)
- [UX Strategy](./ux-strategy.md)

---

**Document Status:** ✅ READY FOR IMPLEMENTATION
**Recommended Start Date:** 2026-01-29 (Tomorrow)
**Target Completion:** 2026-03-28 (9 weeks)

---

**Confidence Level:** 9/10

**Why Confident:**
- ✅ Spotify no longer blocking
- ✅ Clean abstractions reduce risk
- ✅ WCS domain knowledge applied
- ✅ User stories drive implementation
- ✅ Descoped unnecessary features
- ✅ No live data migration risk

**The ONE Risk:**
- DJ adoption of track verification feature
- **Mitigation:** Make export to Spotify require verification (forcing function)

---

Let's ship this. 🚀
