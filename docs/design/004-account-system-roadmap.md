# Design Doc 004: Account System Roadmap

**Status:** APPROVED
**Date:** 2026-01-04
**Author:** Antigravity

---

## 1. Executive Summary

This document outlines the phased approach to user accounts in Pika!. The core principle is **progressive complexity** - solve 80% of the problem with 20% of the effort first, then add complexity only when there's clear demand.

---

## 2. The Core UX Tension

| What Users Want | What We Must Avoid |
|-----------------|-------------------|
| "What was that song from Friday?" | Cluttered live UI |
| "Who DJ'd at that event?" | Login friction during events |
| Reference for practice playlists | Complex account system early |
| Dancer preferences ("more blues!") | GDPR/privacy complexity |

---

## 3. Phased Implementation

### Phase 1: Session Recap (No Accounts) ✅ CURRENT PRIORITY

**Goal**: Let dancers access full set history without accounts.

**Implementation**:
- Cloud stores complete session history (already done)
- Add public `/session/{uuid}` recap page
- Shows: DJ name, date, venue (if set), full tracklist with BPM
- DJ shares link via QR code, social media, or event page
- **No login required to view**

**What This Solves**:
- ✅ "What was that song?"
- ✅ Danceable practice playlist reference
- ✅ Event documentation

**What It Doesn't Solve**:
- ❌ Personal "events attended" history
- ❌ Following favorite DJs
- ❌ Multi-DJ event coordination

---

### Phase 2: DJ Accounts Only

**Goal**: Give DJs control and analytics while keeping dancers anonymous.

**Implementation**:
- DJs create accounts (email + password, or OAuth)
- Event creation with metadata:
  - Event name ("Friday Night @ Venue XYZ")
  - Venue/location
  - Public/private visibility
- Session recap ownership (edit, delete)
- Basic analytics:
  - Peak dancer count
  - Most liked tracks
  - Average session duration

**What This Solves**:
- ✅ DJ branding/identity
- ✅ Event organization
- ✅ Basic analytics
- ✅ Multi-device session management

**What It Doesn't Solve**:
- ❌ Dancer-specific features
- ❌ Personalized recommendations
- ❌ Following/notifications

---

### Phase 3: Full Account System (Future)

**Goal**: Rich social features for both DJs and dancers.

**Only implement if there's clear demand from Phase 2.**

#### 3a. Dancer Accounts
- "Events Attended" history
- Liked tracks saved to profile
- Follow favorite DJs
- Personalized vibe preferences
- Push notifications for followed DJs going live

#### 3b. Enhanced DJ Features
- Multiple DJ identities (aliases)
- Team accounts (crew/collective)
- Revenue features (premium analytics, tips?)
- Competition mode integration

#### 3c. Venue/Organizer Accounts
- Event hosting dashboard
- Multi-DJ scheduling
- Shared event pages
- Attendance analytics

---

## 4. Dancer Identity: Progressive Enhancement

This section outlines how dancer identity evolves through the phases without requiring accounts early on.

### Phase 1a: Anonymous Client ID ✅ IMPLEMENTED

**Current State (2026-01-05)**:
- Each browser gets a unique `client_id` stored in localStorage
- Format: `client_1767210922083_w3xhs6skmrh`
- Created once on first visit, reused forever
- Same browser = Same identity, regardless of URL path

**Database Storage**:
```sql
likes (
  id, session_id, client_id, track_artist, track_title, created_at
)
-- Index on client_id for fast lookups
```

**User-Facing Features**:
- `/my-likes` page shows personal liked songs
- Grouped by session with DJ info
- Link in LivePlayer footer

**Behavior**:
| Scenario | client_id |
|----------|-----------|
| Same browser, any URL | Same ID (merged history ✅) |
| Different browsers | Different IDs (separate histories) |
| Incognito mode | New temporary ID |
| Clear browser data | New ID (history lost) |

**Origin-Awareness** (localStorage security):
`client_id` is stored in `localStorage`, which is **per-origin** (scheme + host + port).

| URL | Origin | localStorage |
|-----|--------|--------------|
| `http://localhost:3002` | localhost:3002 | Storage A |
| `http://192.168.1.5:3002` | 192.168.1.5:3002 | Storage B |
| `https://pika.example.com` | pika.example.com | Storage C |

**Implications**:
- Development: Mixing `localhost` and LAN IP creates different identities
- Production: Single domain = Single identity (no issue)
- Design: This is correct browser security behavior, not a bug

### Phase 1b: Email Claiming (Future)

**Goal**: Let dancers access their history on new devices without full accounts.

**Implementation**:
```sql
client_claims (
  email, client_id, claimed_at
)
```

**Flow**:
1. Dancer enters email on `/my-likes` → "Save my history"
2. We store `(email, their_client_id)` 
3. On new device: enter email → receive magic link
4. Link associates new device's `client_id` with email
5. Query: All likes where `client_id IN (SELECT client_id FROM client_claims WHERE email = ?)`

**Benefits**:
- Cross-device sync without passwords
- No behavior change for anonymous users
- Easy upgrade path to full accounts

### Phase 3: Full Dancer Accounts

**Only when there's demand from Phase 1b.**

**Migration**:
1. Add `user_id` column to likes table
2. When dancer creates account with email:
   - Look up all `client_id`s claimed with that email
   - Update likes: `SET user_id = ? WHERE client_id IN (?)`
3. All historical data is preserved!

---

## 5. Technical Considerations

### Authentication Options
| Option | Pros | Cons |
|--------|------|------|
| Email + Password | Simple, no dependencies | Password reset complexity |
| Magic Link (email) | No passwords | Requires email access |
| OAuth (Google/Apple) | Fast onboarding | Vendor lock-in |
| Anonymous + Upgrade | Zero friction start | Complex state migration |

**Recommendation**: Start with **Magic Link** for DJs - simple, secure, no passwords to manage.

### Data Model Preview (Phase 2+)

```sql
-- Users table
users (
  id, email, name, role, created_at
)

-- DJ profiles extend users
dj_profiles (
  user_id, display_name, avatar_url, bio
)

-- Events group sessions
events (
  id, dj_user_id, name, venue, date, visibility
)

-- Sessions link to events
sessions (
  id, event_id, ...existing_fields
)
```

### Privacy & GDPR

- **Phase 1**: No PII stored, fully anonymous
- **Phase 2**: DJs only, clear consent for email
- **Phase 3**: Dancer consent, data export, deletion rights

---

## 6. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-05 | Implement Phase 1a (client_id) | Enables "My Likes" without accounts |
| 2026-01-04 | Start with Phase 1 (Session Recap) | Solves core need without accounts |
| 2026-01-04 | Dancers stay anonymous through Phase 2 | Reduces friction, privacy-friendly |
| 2026-01-04 | Magic Link preferred over passwords | Simpler for DJs, no password resets |

---

## 7. Success Metrics

### Phase 1 Success
- Recap pages are viewed (analytics)
- DJs share recap links (track via referrer)
- Positive user feedback

### Phase 2 Trigger
- >50% of sessions get recap views
- DJ requests for "event naming" feature
- Requests for analytics/insights

### Phase 3 Trigger
- Dancer requests for "save my history"
- Clear demand for DJ following
- Competition mode requirements

---

## 8. Open Questions

1. **Recap expiration**: Should recaps be permanent or expire after N days?
   - Recommendation: Permanent (storage is cheap, value is high)

2. **Spotify/Apple Music integration**: Generate playlist links?
   - Recommendation: Phase 2+ feature (requires API integrations)

3. **Competition mode**: Separate account tier or integrated?
   - Recommendation: Defer until competition requirements are clearer

---

## Document Changelog

| Date | Changes |
|------|---------|
| 2026-01-05 | Added Section 4: Dancer Identity with Phase 1a (client_id) implementation |
| 2026-01-04 | Initial creation with 3-phase roadmap |
