# Blueprint: Progressive Web App (PWA) Architecture

**Status:** 📋 Planning  
**Priority:** Post-MVP (V1)  
**Estimated Effort:** 2-3 days  
**Created:** January 13, 2026

---

## Executive Summary

This blueprint documents the strategy to evolve Pika! Web into a Progressive Web App (PWA), unlocking critical capabilities for dance event notifications - particularly for iOS users.

---

## 1. Problem Statement

### Current Limitations

| Limitation | Impact | Affected Users |
|------------|--------|----------------|
| No push notifications on iOS Safari | Dancers miss poll announcements, DJ messages | All iOS dancers (~50% of audience) |
| No background sync | Likes not queued when page backgrounded | Mobile users |
| No offline access | Session dies if briefly disconnected | Spotty venue WiFi |
| No "installable" presence | Dancers forget to re-open during event | All mobile dancers |

### Future Feature Unlocked: Competition Notifications

A **killer feature** for WCS events:

> "Division X marshalling at Floor 2 in 15 minutes"

This requires push notifications that:
- Work when phone is locked/in pocket
- Persist across DJ set changes
- Target specific users by WSDC number

**Without PWA:** This feature is impossible on iOS.
**With PWA:** This feature becomes possible.

---

## 2. What PWA Enables

### 2.1 Push Notifications (iOS 16.4+)

| Scenario | Regular Web | PWA (Installed) |
|----------|:-----------:|:---------------:|
| iOS Safari push | ❌ | ✅ |
| Screen locked delivery | ❌ | ✅ |
| Browser closed delivery | ❌ | ✅ |
| Persistent subscription | ❌ | ✅ |

**Requirement:** User must "Add to Home Screen" on iOS.

### 2.2 Offline Resilience

- **Service Worker caching** of static assets
- **Background sync** for queued likes/votes
- **Offline indicator** with graceful degradation

### 2.3 App-Like Experience

- **Home screen icon** with custom splash
- **Standalone mode** (no browser chrome)
- **Faster subsequent loads** (cached assets)

---

## 3. Technical Implementation

### 3.1 Required Components

```
┌─────────────────────────────────────────────────┐
│                 PWA Stack                        │
├─────────────────────────────────────────────────┤
│  Web App Manifest     → manifest.json           │
│  Service Worker       → sw.js (via next-pwa)    │
│  HTTPS               → ✅ Already have           │
│  Push Subscription   → Browser Push API         │
│  VAPID Keys          → Server-side for signing  │
│  Push Service        → Cloud sends to devices   │
└─────────────────────────────────────────────────┘
```

### 3.2 Next.js Integration

```bash
# Install next-pwa plugin
bun add next-pwa
```

```javascript
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

module.exports = withPWA({
  // existing config...
});
```

### 3.3 Manifest (Already Partial)

```json
{
  "name": "Pika! Live Session",
  "short_name": "Pika!",
  "start_url": "/live/[sessionId]",
  "display": "standalone",
  "background_color": "#1e293b",
  "theme_color": "#a855f7",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" }
  ]
}
```

### 3.4 Push Notification Flow

```
┌─────────┐      ┌─────────────┐      ┌─────────────┐
│  Cloud  │──────│ Push Service│──────│   Device    │
│ Backend │      │  (FCM/APNs) │      │   (PWA)     │
└─────────┘      └─────────────┘      └─────────────┘
     │                                      │
     │  1. Event occurs (marshalling)       │
     │  2. Lookup subscriptions by WSDC#    │
     │  3. Send push via web-push library   │
     │                                      │
     │                                      ▼
     │                              ┌──────────────┐
     │                              │ Notification │
     │                              │ "Marshalling │
     │                              │  in 15 min"  │
     └──────────────────────────────└──────────────┘
```

---

## 4. User Experience

### 4.1 Installation Prompt

When dancer joins a session, show subtle prompt:

```
┌─────────────────────────────────────────┐
│ 📱 Add Pika! to your home screen for   │
│    notifications & faster access        │
│                                         │
│    [Maybe Later]  [Add to Home Screen]  │
└─────────────────────────────────────────┘
```

**iOS:** Links to Safari share menu instructions.
**Android:** Native install prompt via `beforeinstallprompt`.

### 4.2 Permission Request

Only request notification permission when relevant:
- After user likes 3+ tracks (shows engagement)
- When user clicks "Notify me of polls"
- When user enters WSDC number (for competition)

**Never:** Request permission on page load.

---

## 5. Database Schema Additions

```sql
-- Push subscriptions (one per device)
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES dj_users(id),  -- NULL for anonymous dancers
  client_id TEXT NOT NULL,                  -- For anonymous tracking
  wsdc_number TEXT,                         -- Optional, for competition targeting
  endpoint TEXT NOT NULL,                   -- Push service URL
  p256dh TEXT NOT NULL,                     -- Encryption key
  auth TEXT NOT NULL,                       -- Auth secret
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

-- Notification log
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  session_id TEXT,
  type TEXT NOT NULL,  -- 'poll', 'announcement', 'marshalling'
  payload JSONB NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  delivered_count INTEGER DEFAULT 0
);
```

---

## 6. Phased Rollout

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 1** | Service Worker + Manifest (installable) | 1 day |
| **Phase 2** | Offline caching + background sync | 1 day |
| **Phase 3** | Push notifications (polls, announcements) | 1-2 days |
| **Phase 4** | Competition targeting (WSDC number) | TBD |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| iOS users won't install PWA | Clear value prop + gentle prompts |
| Push permission fatigue | Only ask when relevant |
| Service worker bugs | Careful testing, easy bypass |
| Vendor push service costs | FCM is free; use web-push |

---

## 8. Decision: MVP vs PWA Notifications

For MVP launch, we will **NOT** implement PWA push notifications.

Instead, we use **in-app Toast + Vibration** for poll announcements, which:
- Works immediately (no install required)
- No permission needed for vibration (Android)
- Simpler, less cluttered UX

**PWA is deferred to Post-MVP V1** when:
- We have real user feedback on notification needs
- Competition features (WSDC integration) are in scope
- We have time to do it properly

---

## 9. References

- [Web Push Protocol](https://web.dev/push-notifications-overview/)
- [iOS 16.4 Web Push Support](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [next-pwa Plugin](https://github.com/shadowwalker/next-pwa)
- [Apple's PWA Requirements](https://developer.apple.com/documentation/webkit/adding-a-web-app-manifest)

---

*This blueprint will be updated as requirements evolve.*
