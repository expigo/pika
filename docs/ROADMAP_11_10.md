# Pika! Roadmap to 11/10 Excellence

**Created:** 2026-01-22
**Status:** PRODUCTION READINESS ROADMAP
**Total Issues Identified:** 150+
**Target:** Zero-defect production deployment

---

## Executive Summary

This roadmap consolidates findings from deep code audits across all 4 packages (Desktop, Web, Cloud, Shared). Issues are organized by severity and grouped into sprints for systematic resolution.

### Current State
- **Composite Score:** 8.5/10 (A-)
- **Critical Issues:** 14
- **High Issues:** 47
- **Medium Issues:** 56
- **Low Issues:** 33+

### Target State
- **Composite Score:** 11/10 (Excellence)
- **Critical Issues:** 0
- **High Issues:** 0
- **Medium Issues:** 0 (or documented technical debt)
- **Test Coverage:** >80%

---

## Sprint Overview

| Sprint | Focus | Duration | Priority |
|--------|-------|----------|----------|
| **S0** | Critical Security & Stability | 2-3 days | BLOCKING |
| **S1** | High-Priority Fixes | 1 week | REQUIRED |
| **S2** | Performance & Data Integrity | 1 week | REQUIRED |
| **S3** | Schema Hardening & Validation | 3-4 days | REQUIRED |
| **S4** | Accessibility & UX Polish | 1 week | IMPORTANT |
| **S5** | Test Coverage & Documentation | 1 week | IMPORTANT |
| **S6** | Future Infrastructure | 2 weeks | STRATEGIC |

---

## Sprint 0: Critical Security & Stability (BLOCKING)

**Priority:** MUST complete before any production deployment
**Estimated Duration:** 2-3 days

### S0.1 - Authentication & Authorization (CRITICAL)

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S0.1.1 | Test mode auth bypass | `cloud/src/handlers/dj.ts` | 53-56 | Remove NODE_ENV bypass or use explicit test flag |
| S0.1.2 | Token exposed in DOM | `web/app/dj/register/page.tsx` | 139-147 | Store in HttpOnly cookie, mask display |
| S0.1.3 | Missing CSRF protection | `web/app/dj/login/page.tsx` | 38-45 | Implement CSRF token exchange |
| S0.1.4 | No auth on recap endpoint | `cloud/src/routes/sessions.ts` | 141 | Add authentication middleware |
| S0.1.5 | Weak clientId validation | `cloud/src/routes/client.ts` | 23-26 | Validate format: `/^client_[a-f0-9-]{36}$/` |

**Code Fix - S0.1.1:**
```typescript
// REMOVE this block entirely from dj.ts
// if (process.env.NODE_ENV === "test") {
//   console.log("🧪 TEST MODE: Bypassing auth validation");
//   djUserId = 999;
//   djName = requestedDjName || "Test DJ";
// }

// Replace with proper test fixtures in test setup
```

### S0.2 - Memory Leaks (CRITICAL)

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S0.2.1 | Unbounded cache growth | `cloud/src/lib/cache.ts` | 12, 30-33 | Add periodic cleanup interval |
| S0.2.2 | ResizeObserver not cleaned | `desktop/src/hooks/useLayoutResizer.ts` | 32-45 | Add observer.disconnect() in cleanup |
| S0.2.3 | Module-level socket state | `desktop/src/hooks/useLiveSession.ts` | 76-77 | Move to React state or singleton |
| S0.2.4 | Confetti interval leak | `desktop/src/components/LivePerformanceMode.tsx` | 128-214 | Add cleanup useEffect |

**Code Fix - S0.2.1:**
```typescript
// Add to cache.ts
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of globalCache.entries()) {
    if (entry.expiresAt <= now) {
      globalCache.delete(key);
    }
  }
}, 60000); // Cleanup every minute
```

### S0.3 - Race Conditions (CRITICAL)

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S0.3.1 | Session waiter array mutation | `cloud/src/lib/persistence/sessions.ts` | 54-63 | Use Set instead of Array |
| S0.3.2 | TOCTOU in track insert | `desktop/src/db/repositories/trackRepository.ts` | 208-235 | Use INSERT OR IGNORE + SELECT |
| S0.3.3 | Nonce cleanup race | `cloud/src/lib/nonces.ts` | 37, 60-62 | Inline cleanup in checkAndRecordNonce |
| S0.3.4 | Socket reconnection race | `desktop/src/hooks/useLiveSession.ts` | 503-509 | Add connection mutex |

**Code Fix - S0.3.2:**
```typescript
async insertTrack(track: {...}): Promise<number> {
  const sqlite = await getSqlite();
  const trackKey = getTrackKey(track.artist ?? "", track.title ?? "");

  // Use UPSERT to avoid race condition
  await sqlite.execute(
    `INSERT OR IGNORE INTO tracks (file_path, artist, title, bpm, key, track_key, analyzed)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [track.filePath, track.artist ?? null, track.title ?? null,
     track.bpm ?? null, track.key ?? null, trackKey]
  );

  const result = await sqlite.select<{ id: number }[]>(
    `SELECT id FROM tracks WHERE track_key = ?`, [trackKey]
  );

  if (result.length === 0) {
    throw new Error(`Failed to insert or find track: ${track.filePath}`);
  }
  return result[0].id;
}
```

### S0.4 - State Encapsulation (CRITICAL)

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S0.4.1 | sessionListeners exported | `cloud/src/lib/listeners.ts` | 113 | Remove export, provide read-only getter |
| S0.4.2 | tempoVotes exported | `cloud/src/lib/tempo.ts` | 90 | Remove export, provide read-only getter |
| S0.4.3 | likesSent exported | `cloud/src/lib/likes.ts` | 76 | Remove export, provide read-only getter |
| S0.4.4 | activeSessions exported | `cloud/src/lib/sessions.ts` | 49 | Provide controlled access |

---

## Sprint 1: High-Priority Fixes (REQUIRED)

**Priority:** Complete before production traffic
**Estimated Duration:** 1 week

### S1.1 - Rate Limiting & DoS Prevention

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S1.1.1 | No rate limit on BROADCAST_TRACK | `cloud/src/handlers/dj.ts` | 114-186 | Add 1 track/5 seconds limit |
| S1.1.2 | No like spam protection | `cloud/src/handlers/dancer.ts` | 25-81 | Add 10 likes/minute per client |
| S1.1.3 | Poll options unbounded | `cloud/src/handlers/poll.ts` | 47-71 | Limit to 2-10 options |
| S1.1.4 | No recap backpressure | `cloud/src/routes/sessions.ts` | 141-349 | Add LIMIT, timeout |

### S1.2 - Error Boundaries & Resilience

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S1.2.1 | Missing error boundary | `desktop/src/components/LivePerformanceMode.tsx` | 62-597 | Wrap in ErrorBoundary |
| S1.2.2 | No web error boundaries | `web/app/live/[sessionId]/page.tsx` | - | Add ErrorBoundary |
| S1.2.3 | Unhandled promise in flushQueue | `desktop/src/hooks/live/offlineQueue.ts` | 58-135 | Add proper await/catch |
| S1.2.4 | WebSocket send not validated | `cloud/src/lib/protocol.ts` | 28, 44 | Add try-catch wrapper |

### S1.3 - Error Handling Improvements

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S1.3.1 | Missing DB operation errors | `desktop/src/hooks/useActivePlay.ts` | 76-87 | Add try-catch + user notification |
| S1.3.2 | Error type checking incomplete | `desktop/src/hooks/useDjSettings.ts` | 124, 189 | Add proper fallback for non-Error throws |
| S1.3.3 | Silent migration errors | `desktop/src/db/index.ts` | 38-43 | Check error message, rethrow real errors |
| S1.3.4 | Fire-and-forget token update | `cloud/src/lib/auth.ts` | 73-77 | Log errors instead of swallowing |

### S1.4 - Input Validation

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S1.4.1 | Poll/announcement XSS risk | `desktop/src/hooks/useLiveSession.ts` | 682-748 | Sanitize user input |
| S1.4.2 | CSV injection in Logbook | `desktop/src/components/Logbook.tsx` | 75-98 | Escape newlines and special chars |
| S1.4.3 | JSON parse unvalidated | `desktop/src/hooks/useDjSettings.ts` | 50-61 | Validate structure after parse |
| S1.4.4 | Response validation missing | `desktop/src/hooks/useDjSettings.ts` | 113-122 | Type guard API responses |

---

## Sprint 2: Performance & Data Integrity (REQUIRED)

**Priority:** Complete before scale testing
**Estimated Duration:** 1 week

### S2.1 - Database Indexes (HIGH)

| ID | Table | Column(s) | Query Pattern |
|----|-------|-----------|---------------|
| S2.1.1 | plays | session_id | WHERE session_id = ? |
| S2.1.2 | plays | track_id | WHERE track_id = ? |
| S2.1.3 | plays | reaction | WHERE reaction = 'peak' |
| S2.1.4 | plays | played_at | ORDER BY played_at |
| S2.1.5 | sessions | ended_at | WHERE ended_at IS NULL |
| S2.1.6 | sessions | started_at | ORDER BY started_at |
| S2.1.7 | tracks | analyzed | WHERE analyzed = 0 |
| S2.1.8 | saved_set_tracks | set_id | WHERE set_id = ? |
| S2.1.9 | saved_set_tracks | track_id | WHERE track_id = ? |

**Migration Script:**
```sql
CREATE INDEX IF NOT EXISTS idx_plays_session_id ON plays(session_id);
CREATE INDEX IF NOT EXISTS idx_plays_track_id ON plays(track_id);
CREATE INDEX IF NOT EXISTS idx_plays_reaction ON plays(reaction);
CREATE INDEX IF NOT EXISTS idx_plays_played_at ON plays(played_at);
CREATE INDEX IF NOT EXISTS idx_sessions_ended_at ON sessions(ended_at);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_tracks_analyzed ON tracks(analyzed);
CREATE INDEX IF NOT EXISTS idx_saved_set_tracks_set_id ON saved_set_tracks(set_id);
CREATE INDEX IF NOT EXISTS idx_saved_set_tracks_track_id ON saved_set_tracks(track_id);
```

### S2.2 - N+1 Query Fixes (CRITICAL)

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S2.2.1 | Track delete loop | `trackRepository.ts` | 332-339 | Batch delete with WHERE IN |
| S2.2.2 | Saved set insert loop | `savedSetRepository.ts` | 118-123 | Batch insert with VALUES |
| S2.2.3 | Session delete non-atomic | `sessionRepository.ts` | 350-356 | Use transaction |

**Code Fix - S2.2.1:**
```typescript
async deleteTracks(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;

  const placeholders = ids.map(() => '?').join(',');
  const result = await db.execute(
    `DELETE FROM tracks WHERE id IN (${placeholders})`,
    ids
  );
  return result.changes ?? 0;
}
```

### S2.3 - Foreign Key Constraints (CRITICAL)

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S2.3.1 | plays.session_id no cascade | `desktop/src/db/index.ts` | 156-157 | Add ON DELETE CASCADE |
| S2.3.2 | plays.track_id no cascade | `desktop/src/db/index.ts` | - | Add ON DELETE SET NULL |
| S2.3.3 | saved_set_tracks.set_id | `desktop/src/db/index.ts` | 179-180 | Add ON DELETE CASCADE |
| S2.3.4 | saved_set_tracks.track_id | `desktop/src/db/index.ts` | - | Add ON DELETE CASCADE |

### S2.4 - Timestamp Consistency (CRITICAL)

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| S2.4.1 | Template uses milliseconds | `templateRepository.ts` | 83 | Convert to seconds |
| S2.4.2 | Session uses milliseconds | `sessionRepository.ts` | 107 | Standardize to seconds |
| S2.4.3 | Plays uses seconds | `sessionRepository.ts` | 52 | Document as standard |

**Decision:** Standardize ALL timestamps to Unix seconds (not milliseconds).

---

## Sprint 3: Schema Hardening & Validation (REQUIRED)

**Priority:** Complete before API freeze
**Estimated Duration:** 3-4 days

### S3.1 - String Length Validation (CRITICAL)

| Field | Current | Fix |
|-------|---------|-----|
| title | `z.string()` | `z.string().min(1).max(500).trim()` |
| artist | `z.string()` | `z.string().min(1).max(500).trim()` |
| sessionId | `z.string()` | `z.string().min(8).max(64).trim()` |
| clientId | `z.string()` | `z.string().min(8).max(256).trim()` |
| djName | `z.string()` | `z.string().min(1).max(100).trim()` |
| token | `z.string()` | `z.string().min(50).max(2000)` |
| message | `z.string().max(200)` | `z.string().min(1).max(200).trim()` |
| question | `z.string()` | `z.string().min(3).max(300).trim()` |
| options[] | `z.string()` | `z.string().min(1).max(100).trim()` |

### S3.2 - Numeric Constraints (HIGH)

| Field | Current | Fix |
|-------|---------|-----|
| pollId | `z.number()` | `z.number().int().positive()` |
| optionIndex | `z.number()` | `z.number().int().min(0).max(4)` |
| count | `z.number()` | `z.number().int().min(0).max(1000000)` |
| faster/slower/perfect | `z.number()` | `z.number().int().min(0)` |
| totalVotes | `z.number()` | `z.number().int().min(0)` |
| winnerIndex | `z.number()` | `z.number().int().min(0).max(4)` |
| bpm | `z.number().min(0)` | `z.number().min(40).max(300)` |

### S3.3 - Fingerprint Metrics (HIGH)

Add to TrackInfoSchema (currently missing):
```typescript
energy: z.number().min(0).max(100).optional(),
danceability: z.number().min(0).max(100).optional(),
brightness: z.number().min(0).max(100).optional(),
acousticness: z.number().min(0).max(100).optional(),
groove: z.number().min(0).max(100).optional(),
```

### S3.4 - Protocol Versioning (CRITICAL)

Add to all message schemas:
```typescript
const BaseMessageSchema = z.object({
  type: z.string(),
  version: z.literal("0.3.0").optional(),
  timestamp: z.number().optional(),
});
```

---

## Sprint 4: Accessibility & UX Polish (IMPORTANT)

**Priority:** Complete before public launch
**Estimated Duration:** 1 week

### S4.1 - Accessibility (HIGH)

| ID | Issue | File | Fix |
|----|-------|------|-----|
| S4.1.1 | Missing ARIA on radar chart | `TrackFingerprint.tsx` | Add role="img", aria-label |
| S4.1.2 | Missing keyboard nav | `LibraryBrowser.tsx` | Add onKeyDown, tabIndex, role="row" |
| S4.1.3 | Like button no label | `LivePlayer.tsx` | Add aria-label for state |
| S4.1.4 | Canvas has no fallback | `SocialSignalsLayer.tsx` | Add aria-hidden="true" (done) |

### S4.2 - Loading States (MEDIUM)

| ID | Issue | File | Fix |
|----|-------|------|-----|
| S4.2.1 | No track performance loading | `LibraryBrowser.tsx` | Add loading state |
| S4.2.2 | Generic loading text | `dj/[slug]/page.tsx` | Add skeleton screens |
| S4.2.3 | No retry mechanism | `recap/[id]/page.tsx` | Add retry button |

### S4.3 - Memoization (MEDIUM)

| ID | Issue | File | Fix |
|----|-------|------|-----|
| S4.3.1 | VibeBadge not memoized | `ui/VibeBadge.tsx` | Wrap in React.memo |
| S4.3.2 | ProCard not memoized | `ui/ProCard.tsx` | Wrap in React.memo |
| S4.3.3 | Rankings not memoized | `Logbook.tsx` | Use useMemo for rankings |
| S4.3.4 | bpmThresholds object | `useTrackFiltering.ts` | Memoize with useMemo |

### S4.4 - SEO & Meta Tags (MEDIUM)

```typescript
// Add to web/app/layout.tsx
export const metadata: Metadata = {
  title: "Pika! - Real-time DJ Feedback for WCS",
  description: "The intelligent companion for West Coast Swing DJs and Dancers.",
  keywords: "WCS, West Coast Swing, DJ, live, real-time, feedback",
  viewport: "width=device-width, initial-scale=1.0, maximum-scale=5.0",
  robots: "index, follow",
  openGraph: {
    title: "Pika! - Real-time DJ Feedback",
    description: "Live connection between booth and floor",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pika!",
    description: "DJ Feedback Platform",
    images: ["/twitter-image.png"],
  },
};
```

---

## Sprint 5: Test Coverage & Documentation (IMPORTANT)

**Priority:** Complete before feature freeze
**Estimated Duration:** 1 week

### S5.1 - Critical Path Tests

| Component | Current | Target | Tests Needed |
|-----------|---------|--------|--------------|
| useLiveSession | ~20% | 90% | Race conditions, reconnection, offline queue |
| trackRepository | ~30% | 95% | UPSERT, batch ops, constraint handling |
| sessionRepository | ~40% | 95% | Transaction handling, cascade deletes |
| Cloud handlers | ~60% | 95% | Auth bypass, rate limits, poll voting |
| Web hooks | ~5% | 80% | WebSocket lifecycle, like sync |

### S5.2 - Integration Tests

| Scenario | Status | Priority |
|----------|--------|----------|
| DJ goes live → Dancer joins | Needed | HIGH |
| Poll lifecycle (start → vote → end) | Needed | HIGH |
| Offline queue flush on reconnect | Needed | HIGH |
| Session recap data integrity | Needed | MEDIUM |
| Multi-DJ concurrent sessions | Needed | MEDIUM |

### S5.3 - Security Tests

| Test | Description | Priority |
|------|-------------|----------|
| Auth bypass attempts | Test NODE_ENV manipulation | CRITICAL |
| Session ownership spoofing | Test djSessionId validation | HIGH |
| Rate limit enforcement | Test DoS prevention | HIGH |
| XSS in poll options | Test sanitization | HIGH |
| CSRF token validation | Test cross-origin requests | HIGH |

---

## Sprint 6: Future Infrastructure (STRATEGIC)

**Priority:** Strategic investment
**Estimated Duration:** 2 weeks

### S6.1 - Redis Migration

**Current State:** In-memory Maps for sessions, likes, tempo, nonces
**Target State:** Redis with TTL, clustering support

| Component | Current | Redis Structure |
|-----------|---------|-----------------|
| activeSessions | Map<string, LiveSession> | HASH sessions:{id} |
| sessionListeners | Map<string, Map<string, {...}>> | HASH listeners:{sessionId} |
| tempoVotes | Map<string, Map<string, TempoVote>> | HASH tempo:{sessionId} |
| seenNonces | Map<string, NonceEntry> | SET nonces:{sessionId} with TTL |
| likesSent | Map<string, Set<string>> | SET likes:{sessionId}:{clientId} |
| activePolls | Map<number, ActivePoll> | HASH polls:{id} |
| pollTimers | Map<number, Timer> | Redis EXPIRE on poll keys |

### S6.2 - Full Auth System

**Current State:** Basic JWT token for DJs
**Target State:** Complete auth with refresh tokens, OAuth

| Feature | Status | Priority |
|---------|--------|----------|
| JWT refresh tokens | Not implemented | HIGH |
| OAuth (Google, Apple) | Not implemented | MEDIUM |
| Password reset flow | Not implemented | HIGH |
| Email verification | Partial | MEDIUM |
| Rate limiting per user | Not implemented | HIGH |
| Session revocation | Basic | MEDIUM |

### S6.3 - PWA Support

**Current State:** No offline support
**Target State:** Full PWA with service worker

| Feature | Status | Priority |
|---------|--------|----------|
| Service worker | Not implemented | HIGH |
| Offline fallback page | Not implemented | HIGH |
| Cache strategy | Not implemented | MEDIUM |
| Push notifications | Not implemented | LOW |
| Add to home screen | Partial (manifest) | MEDIUM |

### S6.4 - Database Providers

**Current State:** SQLite (Desktop), PostgreSQL (Cloud)
**Target State:** Pluggable providers

| Provider | Desktop | Cloud | Priority |
|----------|---------|-------|----------|
| SQLite | ✅ | - | DONE |
| PostgreSQL | - | ✅ | DONE |
| MySQL | - | - | LOW |
| Turso/LibSQL | - | - | MEDIUM |

---

## Issue Summary by Package

### Desktop Package (67 issues)

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | 4 | Memory leaks, race conditions, array safety |
| HIGH | 12 | Error handling, type safety, cleanup |
| MEDIUM | 14 | Performance, re-renders, polling |
| LOW | 7 | Code quality, magic numbers, JSDoc |

### Web Package (25 issues)

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | 1 | Token exposure |
| HIGH | 5 | CSRF, error boundaries, CSP |
| MEDIUM | 12 | Accessibility, SEO, memoization |
| LOW | 7 | React patterns, unused vars |

### Cloud Package (38 issues)

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | 6 | Auth bypass, memory leaks, state exports |
| HIGH | 11 | Rate limiting, validation, error handling |
| MEDIUM | 13 | Input validation, poll integrity |
| LOW | 8 | Logging, documentation |

### Shared Package (20 issues)

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | 4 | String validation, protocol version |
| HIGH | 8 | Range validation, integer constraints |
| MEDIUM | 6 | Redundancy, defaults |
| LOW | 2 | Documentation |

---

## Success Criteria

### Sprint 0 Complete When:
- [ ] All CRITICAL security issues resolved
- [ ] No memory leaks detectable in 24-hour stress test
- [ ] All race conditions eliminated
- [ ] State encapsulation enforced

### Sprint 1 Complete When:
- [ ] Rate limiting active on all endpoints
- [ ] Error boundaries on all critical paths
- [ ] All error handling reviewed and fixed
- [ ] Input validation complete

### Sprint 2 Complete When:
- [ ] All database indexes created
- [ ] No N+1 queries in critical paths
- [ ] FK constraints with cascades
- [ ] Timestamp format standardized

### Sprint 3 Complete When:
- [ ] All schema fields validated
- [ ] Protocol version in all messages
- [ ] Numeric constraints enforced
- [ ] String length limits active

### Sprint 4 Complete When:
- [ ] WCAG 2.1 AA compliant
- [ ] All loading states implemented
- [ ] Performance budget met
- [ ] SEO optimized

### Sprint 5 Complete When:
- [ ] Test coverage >80%
- [ ] All critical paths tested
- [ ] Security tests passing
- [ ] Integration tests complete

### Production Ready When:
- [ ] All sprint criteria met
- [ ] 442+ tests passing
- [ ] Zero CRITICAL/HIGH issues open
- [ ] Performance benchmarks met
- [ ] Security audit passed

---

## Quick Reference: File → Issue Map

### Most Critical Files (Fix First)

1. `cloud/src/handlers/dj.ts` - Auth bypass, rate limiting
2. `cloud/src/lib/cache.ts` - Memory leak
3. `desktop/src/hooks/useLiveSession.ts` - Race conditions, state
4. `desktop/src/db/repositories/trackRepository.ts` - TOCTOU, N+1
5. `shared/src/schemas.ts` - All validation gaps
6. `web/app/dj/register/page.tsx` - Token exposure

### Files With Most Issues

| File | Issues | Severity Profile |
|------|--------|-----------------|
| useLiveSession.ts | 12 | 2 CRITICAL, 4 HIGH |
| schemas.ts | 20 | 4 CRITICAL, 8 HIGH |
| trackRepository.ts | 8 | 2 CRITICAL, 3 HIGH |
| sessionRepository.ts | 6 | 1 CRITICAL, 3 HIGH |
| dj.ts (handlers) | 5 | 1 CRITICAL, 2 HIGH |
| listeners.ts | 4 | 2 CRITICAL, 2 HIGH |

---

## Appendix: Verification Commands

```bash
# Run all tests
bun test

# Run specific package tests
bun test --filter desktop
bun test --filter cloud
bun test --filter web

# Type check
bun run typecheck

# Lint
bun run lint

# Build all packages
bun run build

# Check for memory leaks (requires clinic.js)
clinic doctor -- node dist/index.js

# Security audit
bun audit
```

---

**Document Version:** 1.0
**Last Updated:** 2026-01-22
**Maintained By:** Engineering Team
