# Design Document 007: MVP Launch Plan

**Version:** 1.1.0
**Created:** 2026-01-07
**Updated:** 2026-01-12
**Status:** Pre-Launch Polish
**Target Event:** ~1 month from now

---

## 1. Executive Summary

This document outlines the complete plan to launch Pika! MVP for a real-world test at a West Coast Swing event. The goal is to deploy a working product that DJ Pikachu can use during a 1-hour session, collect feedback from ~50-100 dancers, and iterate.

**Scope:**
- ✅ Deploy to production VPS (via Cloudflare Tunnel due to mikr.us limitations)
- ✅ DJ-only authentication (email + password + token)
- ✅ Mobile-friendly dancer experience
- ❌ Full account system (post-MVP)
- ❌ Spotify integration (post-MVP)
- ❌ Organizations/Events (post-MVP)

---

## 2. System Architecture

### 2.1 mikr.us VPS Constraints

**Important limitations discovered:**
- ❌ **IPv6 only** - most consumer networks don't support IPv6
- ❌ **No standard ports** - only 10000+ID, 20000+ID, 30000+ID available
- ✅ Can request 7 additional TCP ports (free)

**Solution: Cloudflare Tunnel**
- Bridges IPv4 → IPv6
- Provides standard HTTPS on port 443
- Free SSL certificates
- DDoS protection included

### 2.2 What Gets Deployed Where

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                    │
│                                                                         │
│   Dancers on IPv4 (phones, laptops)                                     │
│   DJ on IPv4 (MacBook)                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Cloudflare (FREE Tier)                             │
│                                                                         │
│   pika.stream           ──► Web App                                │
│   api.pika.stream       ──► Cloud API + WebSocket                  │
│   status.pika.stream    ──► Uptime Kuma (optional)                 │
│                                                                         │
│   Features:                                                             │
│   • IPv4 → IPv6 bridging (transparent)                                  │
│   • Free SSL/TLS certificates                                           │
│   • Standard HTTPS on port 443                                          │
│   • WebSocket support                                                   │
│   • DDoS protection                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                        (Cloudflare Tunnel / cloudflared)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    mikr.us VPS (IPv6-only, 4GB RAM)                      │
│                                                                         │
│    Available ports: 10XXX, 20XXX, 30XXX + 7 additional                  │
│    (Ports don't matter - Cloudflare Tunnel connects internally)         │
│                                                                         │
│    ┌───────────────────────────────────────────────────────────────┐   │
│    │  cloudflared daemon (Cloudflare Tunnel client)                │   │
│    │      │                                                        │   │
│    │      ├── pika.stream     → localhost:3000 (Web)         │   │
│    │      ├── api.pika.stream → localhost:3001 (Cloud API)   │   │
│    │      └── status.pika.stream → localhost:3003 (Uptime)   │   │
│    └───────────────────────────────────────────────────────────────┘   │
│                                                                         │
│    ┌───────────────────────────────────────────────────────────────┐   │
│    │  Docker Compose                                                │   │
│    │                                                                │   │
│    │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐      │   │
│    │   │  Cloud API   │   │   Web App    │   │ Uptime Kuma  │      │   │
│    │   │  Port 3001   │   │  Port 3000   │   │  Port 3003   │      │   │
│    │   │  Bun + Hono  │   │  Next.js 15  │   │  Monitoring  │      │   │
│    │   │  WebSocket   │   │  Static+SSR  │   │              │      │   │
│    │   └──────────────┘   └──────────────┘   └──────────────┘      │   │
│    │                                                                │   │
│    └───────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Turso (External, Managed)                            │
│                                                                         │
│   Database: libsql://pika-db-*.turso.io                                 │
│                                                                         │
│   Free tier limits (CORRECTED):                                         │
│   • Storage: 5 GB                                                       │
│   • Row reads: 500 Million/month                                        │
│   • Row writes: 10 Million/month                                        │
│   • Monthly syncs: 3 GB                                                 │
│                                                                         │
│   Expected usage: <1% of limits                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow

```
1. DJ Opens Desktop App
   └── App runs locally on DJ's Mac (Apple Silicon supported ✅)
   └── Connects to api.pika.stream/ws (WebSocket via Cloudflare)

2. DJ Clicks "Go Live"  
   └── Desktop sends REGISTER_SESSION with DJ token
   └── Server validates token, creates session
   └── Session stored in Turso DB

3. DJ Plays Track (from Virtual DJ or other software)
   └── The Pika! desktop app reads the currently playing track
   └── Pre-analyzed metadata (BPM, key, fingerprint) already in local DB
   └── Track info sent to server
   └── Server broadcasts NOW_PLAYING to all dancers

4. Dancers Open URL
   └── Phone browser loads pika.stream
   └── Connects to WebSocket  
   └── Receives current track, can like/vote

5. Session Ends
   └── DJ clicks "End"
   └── Recap page generated at /recap/[sessionId]
   └── Analytics available immediately

Note: Audio is NOT played through Pika! 
The DJ uses their normal software (Virtual DJ, Serato, etc.)
Pika! just reads what's playing and displays it to dancers.
```

---

## 3. Audio Analysis (CORRECTED)

### 3.1 How It Works

**IMPORTANT: No microphone or audio capture needed!**

The Python sidecar analyzes **audio files**, not live audio streams:

```python
# audio_processing.py - actual implementation
def analyze_audio_file(file_path: str) -> AnalysisResult:
    y, sr = librosa.load(file_path, ...)  # Loads from FILE
    # ... calculates BPM, key, fingerprint
```

### 3.2 Analysis Workflow

```
Library Import (one-time):
┌─────────────────────────────────────────────────────────────────────────┐
│  1. DJ points Pika! to their music folder or VDJ database              │
│  2. Pika! scans all audio files                                        │
│  3. Python sidecar analyzes each file (BPM, key, fingerprint)          │
│  4. Results stored in LOCAL SQLite database                            │
│  5. Analysis takes ~2-5 seconds per track (first time only)            │
└─────────────────────────────────────────────────────────────────────────┘

During Live Session:
┌─────────────────────────────────────────────────────────────────────────┐
│  1. DJ plays track in Virtual DJ                                       │
│  2. Pika! detects currently playing track (via VDJ API or file watch)  │
│  3. Looks up pre-analyzed metadata in local DB                         │
│  4. Sends metadata to cloud server                                     │
│  5. Dancers see track info + fingerprint instantly                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 What Dancers See

| Metric | Source | Description |
|--------|--------|-------------|
| Artist | Track file | Song artist |
| Title | Track file | Song title |
| BPM | Analysis | Tempo in beats per minute |
| Key | Analysis | Musical key (e.g., "Am", "C#") |
| Danceability | Analysis | Rhythmic consistency (0-100) |
| Energy | Analysis | Loudness/intensity (0-100) |
| Brightness | Analysis | Treble presence (0-100) |

---

## 4. Desktop App Distribution

### 4.1 DJ Pikachu's Mac

- ✅ **Apple Silicon confirmed** - the existing binary works:
  ```
  src-tauri/binaries/api-aarch64-apple-darwin
  ```

### 4.2 Building for Distribution

```bash
# On your Mac (dev machine)
cd packages/desktop

# Build for Apple Silicon (what DJ Pikachu has)
bun run build

# Output:
# src-tauri/target/release/bundle/dmg/Pika_0.0.1_aarch64.dmg
```

### 4.3 No Additional Software Required

DJ Pikachu does NOT need:
- ❌ ~~BlackHole~~ (not needed - we analyze files, not live audio)
- ❌ ~~Python manual install~~ (bundled in the sidecar binary)
- ❌ ~~Any special audio routing~~ (we read files directly)

DJ Pikachu DOES need:
- ✅ macOS 10.15+ (Catalina or newer)
- ✅ Internet connection (WiFi or mobile hotspot)
- ✅ Their normal DJ software (Virtual DJ, Serato, etc.)

### 4.4 First Run on Mac

```
1. Download Pika.dmg from Google Drive link
2. Double-click to mount
3. Drag Pika to Applications folder
4. Right-click Pika.app → Click "Open"
5. On security warning, click "Open" again
6. App launches! Enter DJ token to connect
```

---

## 5. DJ Authentication (SECURE)

### 5.1 Security Design

**Registration requires email AND password:**

```
DJ Pikachu registers:
├── Email: pikachu@email.com
├── Password: StrongPassword123!
└── Result: Account created, token generated

Later, hacker tries:
├── Email: pikachu@email.com       ← Same email!
├── System says: "Email already registered"
├── Hacker clicks "Login" but...
└── Needs PASSWORD to proceed → BLOCKED ✅
```

**The password is hashed (bcrypt) and stored securely.**
**The token is for API/WebSocket authentication only.**

### 5.2 Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DJ Registration Flow                              │
└─────────────────────────────────────────────────────────────────────────┘

Step 1: Register on website
┌─────────────────────────────────┐
│  pika.stream/dj/register   │
│                                 │
│  DJ Name: [DJ Pikachu]          │
│  Email:   [pikachu@email.com]   │ ← UNIQUE, checked
│  Password:[**************]      │ ← Required, hashed with bcrypt
│                                 │
│  [Create Account]               │
└─────────────────────────────────┘
        │
        ▼
Step 2: Account exists? Check!
┌─────────────────────────────────┐
│  Email already exists?          │
│                                 │
│  YES → "Please login instead"   │
│        (hacker can't proceed)   │
│                                 │
│  NO  → Create account           │
│        Generate token           │
│        Hash password            │
└─────────────────────────────────┘
        │
        ▼
Step 3: Show token (after successful registration)
┌─────────────────────────────────┐
│  ✅ Account created!            │
│                                 │
│  Your DJ Token:                 │
│  ┌───────────────────────────┐  │
│  │ pk_dj_7f8a2b4c9d3e1f6a0b5 │  │
│  └───────────────────────────┘  │
│  [📋 Copy]                      │
│                                 │
│  ⚠️ Save this! You'll need it   │
│  to connect the desktop app.    │
│                                 │
│  Lost it? Login to regenerate.  │
└─────────────────────────────────┘
        │
        ▼
Step 4: If DJ forgets token, they LOGIN
┌─────────────────────────────────┐
│  pika.stream/dj/login      │
│                                 │
│  Email:   [pikachu@email.com]   │
│  Password:[**************]      │
│                                 │
│  [Login]                        │
│                                 │
│  → Shows dashboard with token   │
│  → Can regenerate new token     │
└─────────────────────────────────┘
```

### 5.3 Database Schema

```sql
-- DJ Users (secure)
CREATE TABLE dj_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,           -- Unique constraint prevents duplicates
    password_hash TEXT NOT NULL,          -- bcrypt hashed, never plain text
    display_name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,            -- URL-friendly (e.g., 'pikachu')
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DJ Tokens (for desktop app authentication)
CREATE TABLE dj_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dj_user_id INTEGER NOT NULL REFERENCES dj_users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,           -- 'pk_dj_xxxxx'
    name TEXT DEFAULT 'Default',          -- 'MacBook Pro', 'Home PC'
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Link sessions to DJ (modify existing table)
ALTER TABLE sessions ADD COLUMN dj_user_id INTEGER REFERENCES dj_users(id);
```

---

## 6. Network & Venue Considerations

### 6.1 Connection Requirements

| Who | Needs | Fallback |
|-----|-------|----------|
| **DJ** | Stable internet (critical) | Phone hotspot |
| **Dancers** | Any internet (4G fine) | Own mobile data |

### 6.2 Venue WiFi Issues

Common problems:
- Captive portals (require login)
- WebSocket blocking
- Overcrowded bandwidth
- No IPv6 support (solved by Cloudflare)

### 6.3 Recommended Setup

```
Option A: DJ on Hotspot (Recommended for MVP)
┌─────────────────────────────────────────────────────────────────────────┐
│  DJ's iPhone                                                            │
│  (Personal Hotspot)                                                     │
│       │                                                                 │
│       ▼                                                                 │
│  DJ's MacBook ──────► Cloudflare ──────► VPS                           │
│                                                                         │
│  Dancers use their OWN data (4G/5G) ──────► Cloudflare ──────► VPS    │
└─────────────────────────────────────────────────────────────────────────┘

Why this works:
• DJ has reliable connection via hotspot
• Dancers use own data (usually reliable)
• No dependency on venue WiFi
• Cloudflare handles IPv4→IPv6

Option B: Pre-test Venue WiFi
┌─────────────────────────────────────────────────────────────────────────┐
│  Before the event:                                                      │
│  1. Test venue WiFi with the app                                       │
│  2. Check WebSocket connections work                                   │
│  3. Note any captive portal requirements                               │
│  4. Have phone hotspot as backup                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.4 If No Internet at Venue (Worst Case)

Current MVP: **Event cancelled (requires internet)**

Future feature (post-MVP):
- Desktop app continues working offline
- Dancers see "Connection issues, likes may be delayed"
- Data syncs when connection restored

---

## 7. Implementation Checklist (UPDATED)

### Week 1: Infrastructure Setup

- [x] **Day 1-2: VPS + Cloudflare Tunnel**
  - [x] SSH into mikr.us VPS (IPv6)
  - [x] Install Docker + Docker Compose
  - [x] Install `cloudflared` tunnel client
  - [x] Create Cloudflare account (free)
  - [x] Set up tunnel: VPS ← Cloudflare → Internet

- [x] **Day 3-4: Domain + DNS**
  - [x] Purchase domain (check .dance options!)
  - [x] Configure DNS in Cloudflare (free)
  - [x] Point domain to Cloudflare tunnel
  - [x] Test HTTPS works

- [x] **Day 5: Deploy Apps**
  - [x] Docker Compose for cloud API + web app
  - [x] Configure tunnel routing
  - [x] Test WebSocket over wss://
  - [x] Test from phone browser

### Week 2: Security + DJ Auth

- [x] **Day 1-2: Security Fixes** ✅ (Completed 2026-01-08)
  - [x] Add message size limit (10KB) — WebSocket rejects messages > 10KB
  - [x] **Auth/Onboarding cleanup**: The register/login forms are bare-bones. Needs validation and error handling visuals.ages
  - [x] Add input sanitization — Zod schema validation on all messages
  - [x] Fix likesSent per-session scope — Now uses `${sessionId}:${clientId}` key
  - [x] Add session existence check (handles server restarts)
  - [x] Fix frontend API URLs (was using localhost in prod)

- [x] **Day 3-5: DJ Authentication** ✅ (API Completed 2026-01-08)
  - [x] Create dj_users and dj_tokens tables (schema added)
  - [x] Add unique constraint on poll votes
  - [x] Memory cleanup for session state (sessionListeners, persistedSessions)
  - [x] Registration API endpoint (email + password + bcrypt)
  - [x] Login API endpoint
  - [x] Token validation endpoint (/api/auth/me)
  - [x] Token regeneration endpoint
  - [x] Token validation on REGISTER_SESSION
  - [x] Desktop app token settings UI ✅ (Completed 2026-01-08)
  - [x] Web registration/login pages ✅ (Completed 2026-01-08)
  - [x] Token auto-sync: validates token & auto-sets DJ name ✅ (Completed 2026-01-08)

### Week 3: Feature Enhancement (v1.1 → MVP)

*Tagged v0.9.0 as stable baseline on 2026-01-09. Promoting high-value v1.1 features to MVP scope.*

- [x] **Day 1: Quick Wins** (~4 hours) ✅ (Completed 2026-01-09)
  - [x] Show BPM to dancers (under track title)
  - [x] Session picker for multiple DJs
  - [x] Improve mobile responsiveness

- [x] **Landing Page Refinement** (High Priority)
  - [x] Clear value prop for DJs vs. Dancers vs. Organizers.
  - [x] "How it works" visual section (simple 1-2-3 steps).
  - [x] SEO basics (meta tags, open graph).

- [ ] **Day 2: Poll Notifications** (~4 hours)
  - [ ] Browser Notification API integration
  - [ ] Permission prompt on first visit
  - [ ] Fallback: visual pulse/shake animation

- [ ] **Day 3: DJ Announcements** (~4-6 hours)
  - [ ] Desktop: "Push Announcement" UI
  - [ ] WebSocket: BROADCAST_ANNOUNCEMENT message
  - [ ] Web: Announcement overlay/toast for dancers

- [ ] **Day 4: Password Protection** (~4-6 hours)
  - [ ] Desktop: Session PIN toggle + input
  - [ ] Cloud: Validate PIN on SUBSCRIBE
  - [ ] Web: PIN entry UI for protected sessions

### Week 4: Testing + Polish

- [ ] **Day 1-2: Load Testing**
  - [ ] Simulate 50+ concurrent connections
  - [ ] Test on various mobile devices
  - [ ] Test WebSocket reconnection
  - [ ] Test via Cloudflare tunnel

- [x] **Day 3-4: UX Polish** ✅ (Started 2026-01-08)
  - [x] Landing page with branding (marketing homepage, no WebSocket)
  - [x] Live session discovery (REST-based "Live Now" banner)
  - [x] Secure URL structure: /, /live, /live/{sessionId}
  - [x] QR codes → /live/{sessionId} (direct WebSocket)
  - [ ] Error messages
  - [ ] Final mobile testing

- [ ] **Day 5: Desktop Build**
  - [ ] Build for Apple Silicon (aarch64)
  - [ ] Test on DJ Pikachu's Mac type
  - [ ] Upload to Google Drive
  - [ ] Write install instructions

### Week 4: DJ Training + Dry Run

- [ ] **Day 1-2: DJ Pikachu Training**
  - [ ] Install app on her Mac
  - [ ] Register account, get token
  - [ ] Practice going live
  - [ ] Create template polls

- [ ] **Day 3-4: Dry Run**
  - [ ] 30-minute test session
  - [ ] 5-10 real people testing
  - [ ] Fix any issues found

- [ ] **Day 5: Final Prep**
  - [ ] Print QR code cards
  - [ ] Prepare backup hotspot
  - [ ] Rest before event!

### Week 5: Pre-Launch Polish (In Progress)
- [x] **Security Hardening**:
  - [x] **Secure Token Generation**: Switch from `Math.random()` to `crypto.randomUUID()` in `cloud`.
  - [x] **Hash Tokens**: Store `SHA-256` hash of tokens in DB; do not store raw tokens.
  - [x] **API Auth Middleware**: Protect all sensitive endpoints (e.g. `/api/auth/me` verifies tokens).
  - [x] **Clear Auth on Switch**: Prevent cross-environment pollution in Desktop App.
  - [x] **Credential Cleanup**: Removed hardcoded secrets from `docker-compose.staging.yml`.
  

- [ ] **Connectivity & Offline Resilience**:
  - [ ] **Socket Recovery (Reconnect Logic)**: Implement exponential backoff for WebSocket reconnection handling (client-side).
  - [ ] **Data Sync (State Reconciliation)**: Fetch authoritative state from API after socket reconnection to resolve any missed events (likes, votes).
  - [ ] **Offline Mode (Queueing)**: Implement local queue for "Likes" and "Votes" to support offline interaction; sync when connectivity restores.

- [ ] **Data Hygiene & Stability**:
  - [ ] **DB Ghost Track Hygiene**: Normalize Artist/Title (trim, casing) before `findOrCreateTrack` to strictly prevent duplicate entries.
  - [ ] **Poll State Robustness**: Fix race condition/logic where `id: -1` (idle state) incorrectly overrides an active poll state on client update.

- [ ] **Session & UX**:
  - [ ] **Session Resume (UI Persistence)**: Store `currentSessionId` in `localStorage`. If DJ restarts app/refreshes within 5 mins, automatically rejoin the existing session instead of creating a new one.
  - [ ] **QR Code Safety**: Force Desktop App to generate QR codes using the public URL (`https://pika.stream`) instead of potentially private/unreachable LAN IPs.

- [ ] **Production Prep**:
  - [x] Database Backup Scripts (`scripts/backup-db.sh`).
  - [ ] Final "Go / No-Go" decision.


---

## 7.5 Technical Debt & Known Issues

*Added 2026-01-08 after code review. Updated 2026-01-09 after production deployment fixes.*

### 🔴 Critical (Fix Before MVP Event)

| Issue | Status | Location | Notes |
|-------|--------|----------|-------|
| DJ Token Validation | ✅ Fixed | `index.ts:1191` | Token validated on REGISTER_SESSION |
| Poll Vote Unique Constraint | ✅ Fixed | `schema.ts:145` | Added unique(pollId, clientId) |
| Database Migration System | ✅ Fixed | `drizzle/0002_*.sql` | Created idempotent recovery migration |
| Session Persistence | ✅ Fixed | `drizzle/0002_*.sql` | Added missing dj_user_id column |
| Docker db:push → db:migrate | ✅ Fixed | `docker-compose.prod.yml` | Non-interactive migrations |

### 🟢 Resolved in Staging (2026-01-12)

| Issue | Status | Location | Notes |
|-------|--------|----------|-------|
| **Recap Duration** | ✅ Fixed | `cloud/index.ts` | "0 min" and Zombie session fix |
| **Recap Privacy Links** | ✅ Fixed | `web`, `desktop` | Public vs DJ Analytics differentiation |
| **WebSocket Crash** | ✅ Fixed | `cloud/index.ts` | Missing `djName` in payload |
| **Hydration Error** | ✅ Fixed | `web/layout.tsx` | Suppressed body attributes (extensions) |
| **Live Player Recap** | ✅ Fixed | `web/LivePlayer.tsx` | "View Recap" button after session ends |

### 🟡 Important (Fix Soon After)

| Issue | Status | Location | Notes |
|-------|--------|----------|-------|
| Memory: `sessionListeners` not cleaned | ✅ Fixed | `index.ts:1008` | Cleaned on END_SESSION |
| Memory: `persistedSessions` not cleaned | ✅ Fixed | `index.ts:1009` | Cleaned on END_SESSION |
| Missing DB Indexes | ⏳ Pending | `schema.ts` | Performance at scale |
| **Redundant Metadata** | 🔴 Todo | `schema.ts` | Link `likes` to `played_tracks.id` (Fix orphan data) |
| **JSON Schema Type** | 🔴 Todo | `schema.ts` | Use `json` type for Polls options (Prevent dirty data) |

### 🟢 Nice to Have

| Issue | Status | Location | Notes |
|-------|--------|----------|-------|
| WebSocket Rate Limiting | ⏳ Pending | `index.ts:830` | DoS protection |
| DJ Profile Query Optimization | ⏳ Pending | `index.ts:1055` | Loads all sessions |
| **Old Token Cleanup Job** | ⏳ Pending | `cron task` | Delete tokens where `lastUsed` > 30 days to keep DB light |

---

## 7.6 Future Roadmap (Post-MVP)

*Ideas discussed 2026-01-09. Prioritized by value and effort.*

### 🚀 v1.1 - Quick Wins (After First Event)

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **Show BPM to Dancers** | 🔥 High | Low | Display BPM under track title in listener view |
| **Session Picker** | 🔥 High | Low | Show "Choose a room" if multiple DJs are live |
| **Push Notifications for Polls** | 🔥 High | Medium | Alert dancers when poll starts (browser notifications) |
| **Password-Protected Sessions** | Medium | Medium | DJ sets PIN, dancers must enter to join |

### 🎯 v1.2 - Organizer Features

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **Organizer Announcements** | 🔥 High | Medium | Push messages to all dancers (schedule changes, room info) |
| **Event Branding** | Medium | Low | Custom logo/colors for event organizers |
| **Analytics Dashboard** | Medium | Medium | Event-wide stats (peak listeners, most liked tracks) |

### 🌟 v2.0 - Platform Features

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **Cloud Track Sync** | High | High | Sync analyzed tracks to cloud (survives reinstalls) |
| **Shared Analysis Database** | Medium | High | Crowdsourced WCS music database from all DJs |
| **DJ Profiles & Following** | Low | Medium | Dancers can follow DJs, get notifications |
| **Mobile App (Native)** | Low | Very High | iOS/Android apps with push notifications |
| **Global Track Identity** | High | Very High | "Pika! Pulse" Charts (Canonical Track IDs) |

### 💡 Feature Details

#### Push Notifications for Polls
When DJ creates a poll, dancers get a notification:
```
┌─────────────────────────────────────┐
│ 🔔 DJ Pikachu                       │
│    "What vibe next?" - Vote now!    │
└─────────────────────────────────────┘
```
- Uses browser Notification API
- Requires user permission (prompt on first visit)
- Fallback: Visual pulse/shake animation on poll card

#### Password Protection
```
DJ sets PIN: 1234
QR code still works normally (pika.stream/live/session123)
But on join, dancer sees:

┌─────────────────────────┐
│ 🔒 Protected Session    │
│                         │
│ Enter PIN: [____]       │
│                         │
│ [Join Session]          │
└─────────────────────────┘
```

#### Organizer Announcements
```
Organizer Portal                     All Dancers
───────────────                     ────────────
[📢 New Announcement]               ┌──────────────────────┐
"Strictly at 11pm!"          →      │ 📢 EVENT ANNOUNCEMENT│
[Send to 342 dancers]               │ "Strictly at 11pm!"  │
                                    │ - Organizer          │
                                    └──────────────────────┘
```

---

## 8. Cloudflare Tunnel Setup

### 8.1 Installation on VPS

```bash
# SSH into mikr.us (IPv6)
ssh user@your-vps-ipv6

# Install cloudflared
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Login to Cloudflare
cloudflared tunnel login
# Opens browser, authorize

# Create tunnel
cloudflared tunnel create pika-tunnel
# Saves credentials to ~/.cloudflared/

# Configure tunnel routing
cat > ~/.cloudflared/config.yml << EOF
tunnel: pika-tunnel
credentials-file: /home/user/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: pika.stream
    service: http://localhost:3000
  - hostname: api.pika.stream  
    service: http://localhost:3001
  - hostname: status.pika.stream
    service: http://localhost:3003
  - service: http_status:404
EOF

# Add DNS records (auto)
cloudflared tunnel route dns pika-tunnel pika.stream
cloudflared tunnel route dns pika-tunnel api.pika.stream

# Run as service
sudo cloudflared service install
sudo systemctl start cloudflared
```

### 8.2 Docker Compose (Updated - No Nginx!)

```yaml
version: '3.8'

services:
  cloud:
    build:
      context: .
      dockerfile: ./packages/cloud/Dockerfile
    container_name: pika-cloud
    environment:
      - DATABASE_URL=${DATABASE_URL}
    ports:
      - "127.0.0.1:3001:3001"  # Only localhost (Cloudflare tunnel connects here)
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: ./packages/web/Dockerfile
    container_name: pika-web
    environment:
      - NEXT_PUBLIC_CLOUD_WS_URL=wss://api.pika.stream/ws
      - NEXT_PUBLIC_CLOUD_API_URL=https://api.pika.stream
    ports:
      - "127.0.0.1:3000:3000"  # Only localhost
    restart: unless-stopped

  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: pika-uptime
    volumes:
      - ./uptime-kuma-data:/app/data
    ports:
      - "127.0.0.1:3003:3001"  # Only localhost
    restart: unless-stopped

# Note: No Nginx needed! Cloudflare handles SSL and routing.
# Note: No Redis for MVP (using in-memory state is fine for <100 users)
```

---

## 9. Future Feature: Cloud Track Library (Post-MVP)

### 9.1 Vision

After MVP, sync track library to cloud so DJs can:
- View library from any device
- Prepare sets on phone/tablet
- Never lose track analysis data
- (Future) Get instant BPM/key for tracks other DJs analyzed

### 9.2 Implementation Phases

**Phase 1 (MVP+1 month): Read-only cloud backup**
```
Desktop → Analyze → Save locally → Upload to cloud
Phone → View library (read-only)
```

**Phase 2 (MVP+2 months): Set builder on web**
```
Phone/Tablet → Create playlist → Sync to desktop
```

**Phase 3 (MVP+3 months): Global track database**
```
Any DJ plays track → Cloud stores analysis
New DJ plays same track → Instant metadata (no re-analysis)
```

Complexity: Medium. Value: High. **Worth doing after MVP validated.**

---

## 10. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-07 | Initial document |
| 1.1.0 | 2026-01-07 | - Added Cloudflare Tunnel (mikr.us IPv6 limitation) |
| | | - Corrected: No BlackHole needed (file analysis, not live audio) |
| | | - Corrected: Turso free tier limits (5GB, 500M reads) |
| | | - Added: Email + password security flow |
| | | - Added: Network/venue recommendations |
| | | - Removed: Nginx (Cloudflare handles SSL) |
| | | - Added: Future cloud library feature notes |
| 1.2.0 | 2026-01-10 | - Completed Staging Environment Setup |
| | | - Completed Security Hardening (Hashing, Rotation, Secure Envs) |
| | | - Added Connectivity Resilience Plan |
