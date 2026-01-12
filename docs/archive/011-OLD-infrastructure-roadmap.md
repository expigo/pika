# Design Document 011: Future Infrastructure & Security Roadmap

**Version:** 1.1.0
**Created:** 2026-01-07
**Updated:** 2026-01-12
**Status:** Planning (Post-MVP)

---

## 1. Executive Summary

This document identifies security and architectural enhancements for the **Post-MVP** phase. It outlines the path to a robust multi-role platform (Organizers, Dance Schools).

**Tech Stack (Current):**
- **Desktop App:** Tauri v2 + React + Vite
- **Web App:** Next.js 16.1 (WebSockets + REST)
- **Cloud Server:** Bun + Hono
- **Database:** PostgreSQL (via Docker/VPS)

---

## 2. Current Architecture Assessment

### 2.1 WebSocket Infrastructure Status

| Component | Status | Notes |
|-----------|--------|-------|
| Message Schema Validation | ✅ Implemented | Zod schemas for all messages |
| Listener Count Tracking | ✅ Implemented | Reference counting for tabs |
| Rate Limiting (Likes/Votes) | ✅ Implemented | In-memory tracking |
| Optimistic Updates | ✅ Implemented | With server confirmation |
| Auto-Reconnection | ✅ Implemented | ReconnectingWebSocket library |
| Pub/Sub Broadcasting | ✅ Implemented | Bun native pub/sub |
| **DJ Authentication** | ✅ Implemented | Token-based (Bcrypt + SHA-256) |

### 2.2 Identified Issues Checklist

#### 🔴 Critical Priority (Post-MVP)

| Issue | Status | Effort | Description |
|-------|--------|--------|-------------|
| ClientId Spoofable | ⬜ TODO | High | localStorage-based ID can be cleared/spoofed |
| No Input Sanitization | ⬜ TODO | Low | XSS risk in poll questions |
| No Connection Limits | ⬜ TODO | Low | DoS via connection flooding |

#### 🟠 High Priority

| Issue | Status | Effort | Description |
|-------|--------|--------|-------------|
| In-Memory State Loss | ⬜ TODO | High | Server restart loses active sessions/polls |
| Global `likesSent.clear()` | ⬜ TODO | Low | Affects all sessions on end (Scope needed) |
| Poll Timer `setTimeout` | ⬜ TODO | Medium | Timer lost on restart |

#### ✅ Completed / Resolved

| Issue | Status | When | Description |
|-------|--------|------|-------------|
| **Message Size Limit** | ✅ Fixed | 2026-01-12 | 10KB limit enforced in WebSocket handler |
| **No DJ Authentication** | ✅ Fixed | 2026-01-08 | Full email/pass/token auth system added |
| Likes not in recap | ✅ Fixed | 2026-01-07 | Session ID mismatch resolved |
| Poll vote after refresh | ✅ Fixed | 2026-01-07 | Added VOTE_REJECTED/CONFIRMED |
| New user sees no track | ✅ Fixed | 2026-01-07 | NOW_PLAYING on subscribe |

---

## 3. Account System Architecture

### 3.1 Proposed Role Hierarchy

```
                    ┌─────────────┐
                    │    Admin    │
                    │ (Platform)  │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │  Organizer  │ │ Dance School│ │     DJ      │
    │   (Event)   │ │  (Academy)  │ │  (Artist)   │
    └──────┬──────┘ └──────┬──────┘ └─────────────┘
           │               │
           ▼               ▼
    ┌─────────────┐ ┌─────────────┐
    │   Events    │ │   Classes   │
    └──────┬──────┘ └──────┬──────┘
           │               │
           └───────┬───────┘
                   ▼
            ┌─────────────┐
            │   Dancer    │
            │ (Attendee)  │
            └─────────────┘
```

### 3.2 Role Definitions

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Admin** | Full platform access, manage all users, view all analytics | Pika! team |
| **Organizer** | Create/manage events, invite DJs, view event analytics | Event host |
| **Dance School** | Manage school profile, classes, recurring events, students | Academy owner |
| **DJ** | Go live, manage sessions, view session analytics, library | Performing DJ |
| **Dancer** | Like tracks, vote on polls, tempo feedback, view likes | Attendee |
| **Guest** | View currently playing (no voting/liking) | Unauthenticated |

### 3.3 Database Schema (New Tables)

```sql
-- Core User Table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    email_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP
);

-- Role Assignments (many-to-many)
CREATE TABLE user_roles (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL, -- 'admin', 'organizer', 'dance_school', 'dj', 'dancer'
    granted_at TIMESTAMP DEFAULT NOW(),
    granted_by UUID REFERENCES users(id)
);

-- Organizations (for Dance Schools and Event Organizers)
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'dance_school', 'event_organizer'
    website TEXT,
    logo_url TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Organization Membership
CREATE TABLE organization_members (
    id SERIAL PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL, -- 'owner', 'admin', 'member'
    joined_at TIMESTAMP DEFAULT NOW()
);

-- Events (linked to Organizations)
CREATE TABLE events (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    venue TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    is_recurring BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Event-DJ Association
CREATE TABLE event_djs (
    id SERIAL PRIMARY KEY,
    event_id UUID REFERENCES events(id),
    dj_user_id UUID REFERENCES users(id),
    slot_start TIMESTAMP,
    slot_end TIMESTAMP
);

-- DJ Profiles (extended info for DJ users)
CREATE TABLE dj_profiles (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE,
    slug VARCHAR(100) UNIQUE, -- URL-friendly name (e.g., 'dj-kryspin')
    bio TEXT,
    genres TEXT[], -- ['West Coast Swing', 'Blues']
    website TEXT,
    social_links JSONB
);

-- Sessions now linked to DJ user
ALTER TABLE sessions ADD COLUMN dj_user_id UUID REFERENCES users(id);
ALTER TABLE sessions ADD COLUMN event_id UUID REFERENCES events(id);
```

### 3.4 Authentication Strategy

**Recommended: Auth.js (NextAuth) + JWT**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Web Client │────▶│  Auth.js    │────▶│   Database  │
│   (Next.js) │     │  (Session)  │     │   (Turso)   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────▼──────┐
                    │     JWT     │
                    │   Token     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌───▼───┐ ┌──────▼──────┐
       │  Cloud API  │ │  WS   │ │Desktop App  │
       │  (REST)     │ │Server │ │   (Tauri)   │
       └─────────────┘ └───────┘ └─────────────┘
```

**OAuth Providers:**
- Google (primary - most dancers have Gmail)
- Apple (for iOS users)
- Email/Password (fallback)

---

## 4. Implementation Roadmap

### Phase 0: Current State (MVP)
**Status:** ✅ Complete
- [x] Live session broadcasting
- [x] Likes, tempo feedback, polls
- [x] Session recap with analytics
- [x] Desktop DJ app (Tauri v2)
- [x] Web dancer app (Next.js)

### Phase 1: Security Hardening (2-3 weeks)
**Priority:** 🔴 Critical

| Task | Effort | Status |
|------|--------|--------|
| Add message size limits | 1 day | ⬜ |
| Add input sanitization | 1 day | ⬜ |
| Fix likesSent per-session | 1 day | ⬜ |
| Add connection limits per IP | 2 days | ⬜ |
| Add DJ authentication (API key) | 3 days | ⬜ |
| Add rate limiting middleware | 2 days | ⬜ |

### Phase 2: Account System Foundation (4-6 weeks)
**Priority:** 🟠 High

| Task | Effort | Status |
|------|--------|--------|
| Set up Auth.js with Turso adapter | 1 week | ⬜ |
| User registration/login UI | 1 week | ⬜ |
| Database schema migration | 2 days | ⬜ |
| Role-based access control (RBAC) | 1 week | ⬜ |
| DJ profile creation | 3 days | ⬜ |
| JWT token for WebSocket auth | 3 days | ⬜ |
| Tauri desktop app login flow | 1 week | ⬜ |

### Phase 3: Organization Features (4-6 weeks)
**Priority:** 🟡 Medium

| Task | Effort | Status |
|------|--------|--------|
| Organization CRUD | 1 week | ⬜ |
| Event creation/management | 2 weeks | ⬜ |
| DJ invitation system | 1 week | ⬜ |
| Event-specific analytics | 1 week | ⬜ |
| Dance school features | 2 weeks | ⬜ |

### Phase 4: Production Infrastructure (2-3 weeks)
**Priority:** 🟠 High

| Task | Effort | Status |
|------|--------|--------|
| VPS setup (Docker/PM2) | 3 days | ⬜ |
| Nginx reverse proxy + SSL | 2 days | ⬜ |
| Redis for hot state | 3 days | ⬜ |
| Database backup automation | 1 day | ⬜ |
| CI/CD pipeline | 2 days | ⬜ |
| Monitoring (Uptime Kuma) | 1 day | ⬜ |

---

## 5. Difficulty Scoring

### Account System Implementation

| Component | Difficulty | Reasoning |
|-----------|------------|-----------|
| Basic Auth (email/password) | ⭐⭐ Easy | Auth.js provides this out-of-box |
| OAuth (Google/Apple) | ⭐⭐ Easy | Auth.js providers |
| Role-Based Access | ⭐⭐⭐ Medium | Need middleware + DB schema |
| Organization Management | ⭐⭐⭐⭐ Hard | Complex relationships |
| Tauri Desktop Login | ⭐⭐⭐ Medium | Tauri v2 supports deep links & OAuth |
| WebSocket Auth with JWT | ⭐⭐⭐ Medium | Token refresh handling |

### Migration Difficulty

| Migration | Difficulty | Notes |
|-----------|------------|-------|
| Add `dj_user_id` to sessions | ⭐ Trivial | Nullable, add later |
| Migrate clientId to user_id | ⭐⭐⭐ Medium | Need to map historical data |
| Link likes to users | ⭐⭐ Easy | clientId -> user_id mapping |
| Move state to Redis | ⭐⭐⭐⭐ Hard | Significant refactor |

---

## 6. VPS Deployment Strategy (mikr.us)

### 6.1 Server Specifications
- **RAM:** 4GB
- **Storage:** 150GB
- **Suitable for:** ~200-500 concurrent WebSocket connections

### 6.2 Recommended Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    mikr.us VPS (4GB)                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │     Nginx       │───▶│      Docker Compose         │ │
│  │  (Reverse Proxy)│    │                             │ │
│  │  + Let's Encrypt│    │  ┌───────────┐ ┌─────────┐  │ │
│  └─────────────────┘    │  │ Cloud API │ │  Redis  │  │ │
│                         │  │ (Bun/Hono)│ │  (64MB) │  │ │
│                         │  │   512MB   │ └─────────┘  │ │
│                         │  └───────────┘              │ │
│                         │                             │ │
│                         │  ┌───────────┐              │ │
│                         │  │  Web App  │              │ │
│                         │  │ (Next.js) │              │ │
│                         │  │   512MB   │              │ │
│                         │  └───────────┘              │ │
│                         └─────────────────────────────┘ │
│                                                         │
│  ┌─────────────────┐    ┌─────────────────┐            │
│  │  Uptime Kuma    │    │     Backups     │            │
│  │  (Monitoring)   │    │  (Restic/Turso) │            │
│  │      128MB      │    │                 │            │
│  └─────────────────┘    └─────────────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘

External Services:
  - Turso DB (managed SQLite edge database)
  - Cloudflare (DNS + DDoS protection, optional)
```

### 6.3 Resource Allocation

| Service | Memory | Purpose |
|---------|--------|---------|
| Nginx | 64MB | Reverse proxy, SSL termination |
| Cloud API (Bun) | 512MB | WebSocket server, REST API |
| Web App (Next.js) | 512MB | Static + SSR pages |
| Redis | 64MB | Session cache, rate limiting |
| Uptime Kuma | 128MB | Health monitoring |
| System/Buffer | ~2GB | OS, spikes, safety margin |
| **Total** | ~3.3GB | Leaves ~700MB buffer |

### 6.4 Docker Compose Example

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/letsencrypt
    depends_on:
      - cloud
      - web

  cloud:
    build: ./packages/cloud
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    deploy:
      resources:
        limits:
          memory: 512M
    depends_on:
      - redis

  web:
    build: ./packages/web
    environment:
      - NEXT_PUBLIC_CLOUD_WS_URL=wss://api.pika.dance/ws
      - NEXT_PUBLIC_CLOUD_API_URL=https://api.pika.dance
    deploy:
      resources:
        limits:
          memory: 512M

  redis:
    image: redis:alpine
    command: redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru
    deploy:
      resources:
        limits:
          memory: 64M

  uptime-kuma:
    image: louislam/uptime-kuma:1
    volumes:
      - ./uptime-kuma:/app/data
    ports:
      - "3003:3001"
    deploy:
      resources:
        limits:
          memory: 128M
```

### 6.5 Domains (Suggested)

| Domain | Points To | Purpose |
|--------|-----------|---------|
| `pika.dance` | Web app | Main dancer interface |
| `api.pika.dance` | Cloud API | REST + WebSocket |
| `dj.pika.dance` | Desktop download | DJ app downloads |
| `status.pika.dance` | Uptime Kuma | Public status page |

---

## 7. Quick Wins (Can Do This Week)

| Task | Time | Impact |
|------|------|--------|
| Add message size limit (10KB) | 1 hour | Security |
| Add basic input sanitization | 2 hours | Security |
| Fix likesSent to be per-session | 1 hour | Bug fix |
| Set up VPS with basic Docker | 4 hours | Infrastructure |
| Deploy current app to VPS | 2 hours | Get online |

---

## 8. Open Questions

1. **OAuth vs Email/Password First?**
   - OAuth is faster to implement but requires domain setup
   - Email/Password is simpler but needs email verification

2. **Mobile App?**
   - Current web app works on mobile
   - Native app would require significant effort (React Native?)
   - Consider PWA first?

3. **Monetization?**
   - Free tier for dancers
   - Paid tier for DJs (analytics, branding)?
   - Paid tier for organizers (event management)?

4. **Data Retention?**
   - How long to keep session data?
   - GDPR compliance for EU users?

---

## 9. Next Steps

1. **Immediate:** Create VPS with Docker Compose
2. **This Week:** Deploy MVP to production
3. **Next 2 Weeks:** Security hardening (Phase 1)
4. **Month 1-2:** Account system foundation (Phase 2)

---

## Appendix A: Environment Variables (Production)

```env
# Database
DATABASE_URL=libsql://your-db.turso.io?authToken=xxx

# Auth (Phase 2)
AUTH_SECRET=generate-secure-random-string
AUTH_GOOGLE_ID=xxx
AUTH_GOOGLE_SECRET=xxx

# Redis
REDIS_URL=redis://localhost:6379

# App URLs
NEXT_PUBLIC_CLOUD_WS_URL=wss://api.pika.dance/ws
NEXT_PUBLIC_CLOUD_API_URL=https://api.pika.dance

# Security (Phase 1)
DJ_API_KEY=generate-secure-key-for-dj-auth
MAX_CONNECTIONS_PER_IP=10
MAX_MESSAGE_SIZE_BYTES=10000
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-07 | Claude | Initial document |
| 1.0.1 | 2026-01-07 | Claude | Fixed Electron→Tauri, added tech stack |
