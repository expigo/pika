# Design Document 007: MVP Launch Plan

**Version:** 1.1.0
**Created:** 2026-01-07
**Updated:** 2026-01-07
**Status:** Active
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
│   yourdomain.dance           ──► Web App                                │
│   api.yourdomain.dance       ──► Cloud API + WebSocket                  │
│   status.yourdomain.dance    ──► Uptime Kuma (optional)                 │
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
│    │      ├── yourdomain.dance     → localhost:3000 (Web)         │   │
│    │      ├── api.yourdomain.dance → localhost:3001 (Cloud API)   │   │
│    │      └── status.yourdomain.dance → localhost:3003 (Uptime)   │   │
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
   └── Connects to api.yourdomain.dance/ws (WebSocket via Cloudflare)

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
   └── Phone browser loads yourdomain.dance
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
│  yourdomain.dance/dj/register   │
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
│  yourdomain.dance/dj/login      │
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

- [ ] **Day 1-2: VPS + Cloudflare Tunnel**
  - [ ] SSH into mikr.us VPS (IPv6)
  - [ ] Install Docker + Docker Compose
  - [ ] Install `cloudflared` tunnel client
  - [ ] Create Cloudflare account (free)
  - [ ] Set up tunnel: VPS ← Cloudflare → Internet

- [ ] **Day 3-4: Domain + DNS**
  - [ ] Purchase domain (check .dance options!)
  - [ ] Configure DNS in Cloudflare (free)
  - [ ] Point domain to Cloudflare tunnel
  - [ ] Test HTTPS works

- [ ] **Day 5: Deploy Apps**
  - [ ] Docker Compose for cloud API + web app
  - [ ] Configure tunnel routing
  - [ ] Test WebSocket over wss://
  - [ ] Test from phone browser

### Week 2: Security + DJ Auth

- [ ] **Day 1-2: Security Fixes**
  - [ ] Add message size limit (10KB)
  - [ ] Add input sanitization
  - [ ] Fix likesSent per-session scope

- [ ] **Day 3-5: DJ Authentication**
  - [ ] Create dj_users and dj_tokens tables
  - [ ] Registration page (email + password + bcrypt)
  - [ ] Login page
  - [ ] Token generation and display
  - [ ] Token validation on REGISTER_SESSION
  - [ ] Desktop app token settings UI

### Week 3: Testing + Polish

- [ ] **Day 1-2: Load Testing**
  - [ ] Simulate 50+ concurrent connections
  - [ ] Test on various mobile devices
  - [ ] Test WebSocket reconnection
  - [ ] Test via Cloudflare tunnel

- [ ] **Day 3-4: UX Polish**
  - [ ] Mobile responsiveness fixes
  - [ ] QR code landing page
  - [ ] Error messages

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
  - hostname: yourdomain.dance
    service: http://localhost:3000
  - hostname: api.yourdomain.dance  
    service: http://localhost:3001
  - hostname: status.yourdomain.dance
    service: http://localhost:3003
  - service: http_status:404
EOF

# Add DNS records (auto)
cloudflared tunnel route dns pika-tunnel yourdomain.dance
cloudflared tunnel route dns pika-tunnel api.yourdomain.dance

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
      - NEXT_PUBLIC_CLOUD_WS_URL=wss://api.yourdomain.dance/ws
      - NEXT_PUBLIC_CLOUD_API_URL=https://api.yourdomain.dance
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
