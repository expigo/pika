# Pika! UX Strategy: The Persona Ecosystem

**Date:** 2026-01-27
**Status:** Approved Vision
**Goals:** Transform Pika! into a dedicated platform for each key stakeholder in the West Coast Swing community.

---

## 1. The Organizer Strategy ("The Command Center")

**User Goal:** Run a stress-free, professional event where attendees are always informed.
**Value Proposition:** "The only schedule that is never wrong."

### Core Feature: The Live Schedule Maker
*   **Interface:** A rich drag-and-drop calendar view (Day/Week).
*   **Functionality:**
    *   Create "Slots" (Workshops, Competitions, Social Dancing).
    *   Assign "Resources" (Room A, Main Floor).
    *   **Live Updates:** Dragging a slot from 2:00 PM to 2:15 PM instantly updates all 500 dancer phones.
    *   **Push Trigger:** Toggling "Notify Attendees" sends a push: *"⚠️ Schedule Change: Novice Prelims delayed by 15 mins."*

### Feature: The Booking Handshake (Organizer <-> DJ)
*   **Problem:** Miscommunication about set times.
*   **Workflow:**
    1.  Organizer assigns DJ to a "Social Dance" slot.
    2.  State: **Pending** (Yellow on Schedule).
    3.  DJ receives notification: *"WCS Budapest wants you for Sat 10 PM - 12 AM."*
    4.  DJ clicks **Confirm**.
    5.  State: **Confirmed** (Green). Public Schedule updates to show confirmed artist.

### The Dashboard View
1.  **Status Overview:** Active Stages, Current Attendance Count, System Health.
2.  **Announcement Center:** Compose & Broadcast notifications to "Event Subscribers".
3.  **Booking Manager:** List of pending/confirmed staff contracts.

---

## 2. The DJ Strategy ("The Career Hub")

**User Goal:** Manage bookings, curate music identity, and get feedback.
**Value Proposition:** "Your professional profile and music data in one place."

### Core Feature: The Gig Calendar
*   **Interface:** A personal calendar view of all bookings across all Pika-enabled events.
*   **Functionality:**
    *   View "Pending Requests" from Organizers.
    *   Sync with Google/Apple Calendar.
    *   "Set Prep": Link specific Playlists to specific Gigs.

### Feature: The Smart Profile
*   **Concept:** A public-facing "DJ CV".
*   **Content:**
    *   Bio & Photo.
    *   **Verified Stats:** "Played 14 International Events in 2026."
    *   **Vibe Graph:** "Mostly plays: Modern Acoustic & Lyrical." (Generated from *actual* Smart Crate data).
    *   **Upcoming Gigs:** Auto-populated from the Global Schedule.

### Feature: The Smart Crate (Data)
*   **Review Mode:** Post-set interface to verify/fix track identification.
*   **Analytics:** See which tracks got the most "Hearts" or "Votes" during a set.

---

## 3. The Dancer Strategy ("The Event Companion")

**User Goal:** Don't miss out (FOMO management) and remember the good moments.
**Value Proposition:** "Your personal guide to the weekend."

### Core Feature: The Dynamic Schedule
*   **Interface:** Mobile-first vertical timeline.
*   **Functionality:**
    *   **"My Schedule":** Star/Heart specific workshops/comps to filter the view.
    *   **Alerts:** "Get notified 10 mins before *Starred* items start."
    *   **Live Context:** "Happening Now" banner at the top.

### Feature: The Music Journal
*   **Concept:** Automated history of their dance life.
*   **Content:**
    *   **"Liked Songs":** List of all tracks they hearted, grouped by Event/DJ.
    *   **"Dance Log":** "You attended WCS Budapest." (Based on Check-ins/Stage Joins).
    *   **Spotify Export:** One-tap save to "WCS Favorites".

### Feature: Discovery
*   **Concept:** Follow DJs or Events.
*   **Content:**
    *   Get notified when "DJ G" publishes a new public playlist.
    *   Get notified when "WCS Budapest" opens registration for next year.

---

## 4. The Platform Owner Strategy ("God Mode")

**User Goal:** Ensure quality, safety, and operational excellence of the platform.
**Value Proposition:** "Total control over the ecosystem."

### Core Feature: The Gatekeeper Inbox
*   **Concept:** Strict vetting of high-trust roles (DJ, Organizer).
*   **Workflow:**
    *   **Review:** View new applications with linked external profiles (WSDC Registry, Socials).
    *   **Decision:** One-click **[Approve]** (sends invite) or **[Reject]**.
    *   **Audit:** "Shadow ban" capability for bad actors.

### Feature: System Health Dashboard
*   **Operational Metrics:**
    *   "Active WebSocket Connections" (Real-time load).
    *   "Push Notifications Sent" (Cost/Spam monitoring).
    *   "Redis Memory Usage".

---

## 5. The Ecosystem Loop

How the personas feed each other:

1.  **Organizer** Books **DJ** via *Booking Handshake*.
2.  **DJ** Plays Music -> Generates Data via *Smart Crate*.
3.  **Dancer** Likes Music -> Feeds **DJ's** *Vibe Graph*.
4.  **Dancer** checks Schedule -> Receives **Organizer's** *Updates*.
5.  **Dancer** has a great time -> Attends next **Organizer's** Event.

---

## 6. Technical Requirements (UX)

*   **Role-Based Routing:** strict separation of `/app/organizer`, `/app/dj`, `/app/dancer`.
*   **Real-Time Sync:** The Schedule Maker relies heavily on WebSocket/Redis for the "Instant Update" feel.
*   **Notification Engine:** Complex logic needed for "Notify me 10 mins before *My Starred Item*". (Cron jobs or Redis delayed queues).
