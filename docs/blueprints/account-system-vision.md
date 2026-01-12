# Blueprint: Account System Vision

This document outlines the **Future Vision** for the Pika! account system. It consolidates the original roadmap (`004`) and the infrastructure plan (`011`).

**Status:** Vision (Not Implemented)
**Last Updated:** 2026-01-12

## 1. The Core UX Tension

| What Users Want | What We Must Avoid |
|-----------------|-------------------|
| "What was that song from Friday?" | Cluttered live UI |
| "Who DJ'd at that event?" | Login friction during events |
| Reference for practice playlists | Complex account system early |
| Dancer preferences ("more blues!") | GDPR/privacy complexity |

## 2. Proposed Role Hierarchy

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

## 3. Phased Implementation Strategy

### Phase 1: DJ Accounts (Current Focus)
*   **Goal:** Secure the broadcasting capability.
*   **Status:** ✅ Implemented (See `docs/architecture/auth-system.md`).

### Phase 2: Organization Features (The "Business" Layer)
*   **Goal:** Allow Event Directors to manage rosters and lineups.
*   **Features:**
    *   **Organization CRUD:** `Event_Organizer` entity.
    *   **Event Management:** "Friday Night WCS", "City Swing 2026".
    *   **DJ Invitation:** Invite `dj_kryspin` to play at `Event X`.
    *   **Schedule/Roster:** "20:00 - 21:00: DJ Alpha", "21:00 - 22:00: DJ Beta".

### Phase 3: Dance School (The "Education" Layer)
*   **Goal:** Recurring value for local communities.
*   **Features:**
    *   **Classes:** Practice playlists.
    *   **Students:** Private access to class history?

### Phase 4: Dancer Accounts (The "Social" Layer)
*   **Goal:** Retention and Personalization.
*   **Philosophy:** **Strictly Optional.** Dancers must be able to use the app anonymously forever if they choose.
*   **Features:**
    *   **"My History":** Save likes across devices.
    *   **Following:** Follow favorite DJs.
    *   **Preferences:** "I like Blues" (persisted profile).
*   **Migration Path:**
    *   Current: Anonymous `clientId` (localStorage).
    *   Future: "Claim History" by signing up. We link old `clientId` data to the new `user_id`.

## 4. Open Questions & Research Areas

1.  **Dance Academy Model:** How does a "School" differ from an "Event"? Is it just a recurring event? Or does it need "Curriculum" features?
2.  **Monetization:** Do we charge Organizers for "White Label" pages? Do we charge DJs for "Pro Analytics"?
3.  **Authentication Provider:** Should we switch from our custom Bcrypt/Token system to a managed auth provider (Auth.js / Clerk) before adding Dancer accounts? (Recommendation: Yes, for social login support).
