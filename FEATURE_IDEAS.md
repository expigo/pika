# Pika! Feature Ideas Reference

> **Context**: Pika! is a DJ assistance app designed for **social dancing** (West Coast Swing initially, expanding to other partner dances). This document captures all discussed feature ideas for future implementation.

> **Last Updated**: 2026-01-18 (v0.2.1)

---

## Table of Contents

1. [DJ Desktop Features](#dj-desktop-features)
2. [Dancer Web App Features](#dancer-web-app-features)
3. [Competition Mode](#competition-mode)
4. [Library Management](#library-management)
5. [Analytics & Insights](#analytics--insights)
6. [Event & Multi-DJ System](#event--multi-dj-system)
7. [Technical & Quality of Life](#technical--quality-of-life)
8. [Future Integrations](#future-integrations)

---

## DJ Desktop Features

### Real-Time Feedback

#### DF-1: Floor Fill Indicator
- **Description**: Visual indicator showing current dancer engagement level
- **WCS Context**: "Energy" in social dancing means floor usage, not hype. Are people sitting out vs actively rotating partners?
- **Implementation Ideas**: 
  - Derive from like rate (likes per minute normalized by crowd size)
  - Future: venue camera integration for actual floor analysis
- **Priority**: Medium
- **Complexity**: Medium

#### DF-2: Crowd Size Counter
- **Description**: Show number of dancers currently connected via web app
- **Status**: ✅ **DONE** (Integrated into Live Session tools)
- **Display**: "👥 47 dancers connected"
- **Priority**: High
- **Complexity**: Low

#### DF-3: Tempo Request Aggregator
- **Description**: Show real-time crowd preferences for song characteristics
- **Status**: ✅ **DONE** (Faster/Slower voting integrated into HUD)
- **Display**: "⬆️ 73% want faster | ⬇️ 27% want slower"
- **Priority**: High
- **Complexity**: Medium

#### DF-4: Request Queue Dashboard
- **Description**: Dedicated panel showing dancer song/style requests
- **Priority**: High
- **Complexity**: Medium

#### DF-5: "Last Song" Warning System
- **Description**: Countdown timer and announcement helper for event closing
- **Priority**: Low
- **Complexity**: Low

---

### Set Building & Planning

#### DF-6: Set Templates
- **Description**: Pre-defined event structure templates with energy/BPM targets
- **Status**: ✅ **DONE** (Implemented via `TemplateManager.tsx`)
- **Usage**: DJ loads template → sees slots with target ranges → fills with tracks
- **Priority**: Medium
- **Complexity**: Medium

#### DF-7: Save & Load Sets
- **Description**: Persist set compositions to database for reuse
- **Status**: ✅ **DONE** (Restored and professionalized in v0.2.1)
- **Features**:
  - Name and describe sets
  - Save current set
  - Load previous sets
  - Duplicate and modify
- **Priority**: High
- **Complexity**: Low

#### DF-8: Set Export Options
- **Description**: Export sets to various formats
- **Priority**: High
- **Complexity**: Medium

#### DF-9: Repeat Prevention ("Played This Event")
- **Description**: Track songs already played during current event
- **Priority**: High
- **Complexity**: Low

#### DF-10: Tempo Flow Visualization
- **Description**: Graph showing BPM progression through set
- **Status**: ✅ **DONE** (Available in "The Crate" and "The Lab")
- **Priority**: Medium
- **Complexity**: Medium

---

### New Ideas - DJ Desktop

#### DF-11: Set Comparison Mode
- **Description**: Side-by-side comparison of two saved sets
- **Priority**: Low
- **Complexity**: Medium

#### DF-12: "DJ Handoff Notes"
- **Description**: Notes to pass to next DJ at multi-DJ events
- **Priority**: Medium
- **Complexity**: Low

#### DF-13: Keyboard Shortcut System
- **Description**: Quick actions for live performance
- **Status**: ✅ **DONE** (P/B/N/Esc mapped for fast reactions)
- **Priority**: Medium
- **Complexity**: Low

#### DF-14: Smart Song Suggestion Feed
- **Description**: AI-powered "what to play next" suggestions
- **Priority**: Medium
- **Complexity**: High

#### DF-15: "Crowd Favorites" Quick Access
- **Description**: Quick panel showing tracks with highest historical reaction rates
- **Priority**: Medium
- **Complexity**: Medium

---

## Dancer Web App Features

### Engagement & Interaction

#### DW-1: Song Reactions
- **Description**: Multiple reaction types beyond simple like
- **Status**: ✅ **DONE** (Like button with interactive heart animation)
- **Priority**: High
- **Complexity**: Low

#### DW-2: Vibe/Style Preference Buttons
- **Description**: Request song style characteristics
- **Options**:
  - 🎷 More blues
  - 🎤 More pop/contemporary
  - 💃 Challenge me (complex rhythms)
  - 🧘 Keep it simple (beginner-friendly)
- **Priority**: High
- **Complexity**: Low

#### DW-3: Tempo Preference Buttons
- **Description**: Simple faster/slower requests
- **Options**:
  - 🐢 Slower please
  - 🐇 Faster please
- **Aggregated and shown to DJ
- **Priority**: High
- **Complexity**: Low

#### DW-4: Song Request (from Library)
- **Description**: Dancers can search DJ's library and request specific songs
- **Features**:
  - Search by title/artist
  - See if song was already played
  - "Request" button with optional note
- **Privacy**: DJ can enable/disable this feature
- **Priority**: Medium
- **Complexity**: Medium

#### DW-5: Self-Identification
- **Description**: Optional dancer profile on join
- **Fields**:
  - Display name (optional)
  - Role: Lead / Follow / Both
  - Experience level: Beginner / Intermediate / Advanced
- **Use Cases**: Help DJ understand crowd composition, lead/follow ratio
- **Priority**: Low
- **Complexity**: Low

---

### Information Display

#### DW-6: Full Track History
- **Description**: Complete list of songs played during session
- **Features**:
  - Scrollable list (not just last 5)
  - Artist, title, BPM displayed
  - Timestamp of when played
  - Your reaction (if any)
- **Priority**: High
- **Complexity**: Low

#### DW-7: Current Song Details
- **Description**: Enhanced now playing display
- **Information**:
  - Artist / Title
  - BPM (color-coded: slow/medium/fast)
  - Song duration / time remaining
  - Key (for musicians in crowd)
- **Priority**: Medium
- **Complexity**: Low

#### DW-8: Event Schedule Display
- **Description**: Show event timeline and current position
- **Content**:
  - Event name
  - DJ name(s) and slots
  - Current phase (warmup, social, competition, etc.)
  - Time remaining
- **Priority**: Medium
- **Complexity**: Medium

#### DW-9: Share Tonight's Setlist
- **Description**: Post-event access to full song list
- **Features**:
  - Shareable URL
  - Export to text/PDF
  - Link to streaming services (future)
- **Priority**: Medium
- **Complexity**: Medium

#### DW-10: "Add to My Playlist" Integration
- **Description**: Save songs to personal streaming playlists
- **Integrations**: Spotify, Apple Music, YouTube Music
- **Priority**: Low
- **Complexity**: High

---

### New Ideas - Dancer Web App

#### DW-11: Partner Finder (Optional)
- **Description**: "Looking for a dance" indicator
- **How**: Toggle on profile, shows list of others also looking
- **Privacy**: Fully optional, works within venue
- **Priority**: Low
- **Complexity**: Medium

#### DW-12: Dance Counter
- **Description**: Personal stats for the night
- **Display**: "You've been dancing for 47 minutes across 14 songs"
- **Fun Addition**: "Most active dancer" badge (opt-in only)
- **Priority**: Low
- **Complexity**: Low

#### DW-13: Tempo Comfort Zone Setting
- **Description**: Dancer sets their preferred BPM range
- **Use**: Get notification when song in your comfort zone starts
- **Priority**: Low
- **Complexity**: Medium

#### DW-14: Post-Event Feedback Form
- **Description**: Quick survey after event ends
- **Questions**:
  - Overall music rating (1-5)
  - Best song of the night
  - Tempo variety rating
  - Would you recommend this DJ?
- **Priority**: Medium
- **Complexity**: Low

#### DW-15: Community Song Ratings
- **Description**: Aggregate ratings visible to dancers
- **Display**: "142 dancers have loved this song at WCS events"
- **Scope**: Anonymized across all events using Pika!
- **Priority**: Low
- **Complexity**: Medium

---

## Competition Mode

### Overview

West Coast Swing competitions have specific requirements that differ significantly from social dancing. DJs must carefully curate songs for fairness, consistency, and appropriate challenge level.

### Competition Structure (WSDC Official)

**Skill Divisions** (per WSDC Jack & Jill Advancement Chart):

| Division | Description | Allowed to Move Up | Required to Move Up |
|----------|-------------|-------------------|---------------------|
| **Newcomer** | Dancers new to competition | At dancer's discretion | 1 Newcomer point OR 1 Novice point |
| **Novice** | Basic dance skills | 16 Novice points | 30 Novice points OR 1 Intermediate point |
| **Intermediate** | Perfecting competitive skills | 30 Intermediate points | 45 Intermediate points OR 1 Advanced point |
| **Advanced** | Very competitive dancers | 60 Advanced points | 90 Advanced points OR 1 All-Star point |
| **All-Star** | Extremely competitive dancers | 150 All-Star points | 225 All-Star points |
| **Champion** | WSDC Champion J&J contests | 1 Champion point | 10 Champion points |

**Round Types**:
- Preliminaries (large field, multiple heats)
- Semi-finals
- Finals

**DJ Considerations by Division**:
- **Newcomer/Novice**: Simple rhythm, clear phrasing, forgiving songs. Avoid complex breaks or tempo changes.
- **Intermediate**: Moderate complexity allowed. Can include subtle musicality challenges.
- **Advanced/All-Star**: Complex rhythms, challenging musicality welcome. Songs should test advanced skills.
- **Champion**: Most challenging songs. Often features songs that reward innovation and interpretation.

### Competition DJ Requirements

#### CM-1: Division-Specific Song Pools
- **Description**: Tag songs as appropriate for specific divisions
- **Tags**:
  - `newcomer-safe` - Simple rhythm, clear phrasing, forgiving
  - `novice-appropriate` - Moderate complexity
  - `intermediate-plus` - Can include complex rhythms
  - `advanced-only` - Challenging musicality
- **Use**: Filter library by division when building comp playlist
- **Priority**: High
- **Complexity**: Low

#### CM-2: Heat Consistency Checker
- **Description**: Ensure all heats within a round have similar difficulty
- **Checks**:
  - BPM range consistency (±3 BPM)
  - Similar energy levels
  - Similar style mix (if one heat gets blues, others should too)
- **Display**: Warning if heats are unbalanced
- **Priority**: High
- **Complexity**: Medium

#### CM-3: Blues Song Decision Helper
- **Description**: Manage the "blues song question" for competitions
- **Context**: Competitions often include one blues song per round - DJ must ensure fairness
- **Features**:
  - Tag songs as "comp-blues" candidates
  - Randomize blues assignment across heats
  - Or: same blues song in all heats for fairness
- **Priority**: High
- **Complexity**: Low

#### CM-4: Competition Playlist Builder
- **Description**: Specialized interface for building comp playlists
- **Features**:
  - Set number of divisions and rounds
  - Set heats per round
  - Set songs per heat
  - Auto-assign from filtered pool
  - Manual override and reorder
  - Lock used songs (can't repeat)
- **Example**:
  ```
  Novice Division
  ├── Prelims
  │   ├── Heat 1: [Song A] [Song B] [Song C] [Blues X]
  │   ├── Heat 2: [Song D] [Song E] [Song F] [Blues X]
  │   └── Heat 3: [Song G] [Song H] [Song I] [Blues X]
  ├── Semi-Finals
  │   ├── Heat 1: [Song J] [Song K] [Blues Y]
  │   └── Heat 2: [Song L] [Song M] [Blues Y]
  └── Finals: [Song N] [Song O] [Song P] [Blues Z]
  ```
- **Priority**: High
- **Complexity**: High

#### CM-5: Song Duration Enforcer
- **Description**: Ensure comp songs meet time requirements
- **Typical Requirements**:
  - Prelims: 1:30 - 2:00 minutes
  - Finals: 2:00 - 2:30 minutes
- **Features**:
  - Auto-filter by duration
  - Warning if song too short/long
  - Fade-out point marker in waveform
- **Priority**: High
- **Complexity**: Medium

#### CM-6: Used Song Tracker
- **Description**: Track all songs used across entire competition
- **Features**:
  - Cannot use same song in different divisions
  - Cannot use same song in different rounds of same division
  - Visual indicator of song usage status
  - Export list for event records
- **Priority**: High
- **Complexity**: Low

#### CM-7: Song Randomizer with Constraints
- **Description**: Randomly select songs within given parameters
- **Constraints**:
  - BPM range
  - Division appropriateness
  - Style mix (e.g., "2 pop, 1 contemporary, 1 blues")
  - Exclude already-used songs
- **Use Case**: Fair, random selection with guardrails
- **Priority**: Medium
- **Complexity**: Medium

#### CM-8: Competition Mode Toggle
- **Description**: Switch DJ interface into competition-optimized layout
- **Changes**:
  - Hide social dance features (requests, reactions)
  - Show division/heat selector
  - Show song pool and constraints
  - Larger song info display for announcer coordination
- **Priority**: Medium
- **Complexity**: Medium

---

### New Ideas - Competition Mode

#### CM-9: Judge/Announcer Song Info Feed
- **Description**: Separate display/URL for event staff
- **Content**: Current song, BPM, heat number, division
- **Use**: Announcer can see what's playing without asking DJ
- **Priority**: Medium
- **Complexity**: Low

#### CM-10: Timing Integration
- **Description**: Integration with competition timing software
- **Features**:
  - Start song on heat timer start
  - Auto-fade at time limit
  - Sync with scoring systems
- **Priority**: Low
- **Complexity**: High

#### CM-11: Historical Competition Song Database
- **Description**: Database of songs used at major events
- **Content**: Song, event, division, round, year
- **Use**: "This song was used at US Open 2024 All-Star Finals"
- **Priority**: Low
- **Complexity**: Medium

#### CM-12: Pre-Competition Approval Workflow
- **Description**: Head judge reviews/approves comp playlist in advance
- **Features**:
  - DJ submits proposed playlist
  - Judge reviews and can flag concerns
  - Final approval before event
- **Priority**: Low
- **Complexity**: Medium

#### CM-13: Spotlight/Pro-Show Mode
- **Description**: Special mode for exhibition dances
- **Features**:
  - Dancer-provided music support
  - Precise timing controls
  - Backup song ready
  - Integration with lighting cues (future)
- **Priority**: Low
- **Complexity**: Medium

---

## Library Management

### Search & Filter

#### LM-1: Advanced Multi-Field Search
- **Description**: Search across multiple fields simultaneously
- **Query Types**:
  - `artist:madonna title:like` - Field-specific
  - `madonna like` - Fuzzy match any field
  - Natural language: "upbeat pop songs around 110 bpm"
- **Priority**: High
- **Complexity**: Medium

#### LM-2: BPM Range Filter
- **Description**: Filter tracks by BPM range
- **Presets**: 
  - Slow (80-95)
  - Medium (95-115)
  - Fast (115-130)
  - Custom range slider
- **Priority**: High
- **Complexity**: Low

#### LM-3: Energy Range Filter
- **Description**: Filter by analyzed energy level
- **Presets**: Low / Medium / High / Custom
- **Priority**: Medium
- **Complexity**: Low

#### LM-4: Song Length Filter
- **Description**: Filter by duration
- **Options**:
  - Competition length (1:30-2:30)
  - Social dance (2:30-4:30)
  - Custom range
- **Priority**: Medium
- **Complexity**: Low

#### LM-5: Analysis Status Filter
- **Description**: Show analyzed vs unanalyzed tracks
- **Options**: All / Analyzed only / Needs analysis
- **Priority**: High
- **Complexity**: Low

---

### Bulk Operations

#### LM-6: Multi-Select Mode
- **Description**: Select multiple tracks for batch operations
- **Methods**:
  - Checkbox column
  - Shift+click range select
  - Ctrl/Cmd+click individual
  - "Select all" / "Select none"
- **Priority**: High
- **Complexity**: Low

#### LM-7: Bulk Delete
- **Description**: Delete multiple tracks at once
- **Safety**: Confirmation dialog with count
- **Priority**: High
- **Complexity**: Low

#### LM-8: Bulk Re-Analyze
- **Description**: Queue multiple tracks for re-analysis
- **Priority**: Medium
- **Complexity**: Low

#### LM-9: Bulk Tag Assignment
- **Description**: Add/remove tags from multiple tracks
- **Priority**: High
- **Complexity**: Low

#### LM-10: Bulk Export
- **Description**: Export selected tracks to playlist file
- **Priority**: Medium
- **Complexity**: Low

---

### Tags & Organization

#### LM-11: Custom Tags
- **Description**: DJ-defined tags for track categorization
- **Examples**:
  - Event type: `#social`, `#competition`, `#workshop`
  - Venue: `#studio-x`, `#convention-a`
  - Character: `#opener`, `#closer`, `#peak`, `#filler`
  - Style: `#blues`, `#pop`, `#contemporary`, `#old-school`
- **Features**:
  - Create new tags inline
  - Tag autocomplete
  - Color-coded tags
  - Tag management panel
- **Priority**: High
- **Complexity**: Medium

#### LM-12: DJ Personal Notes (Per Track)
- **Description**: Persistent notes attached to tracks
- **Different From**: Session notes (which are per-play)
- **Examples**:
  - "Great transition from Donna Summer"
  - "Only works after midnight"
  - "Crowd pleaser but overplayed"
  - "Has a 30-second intro - warn dancers"
- **Priority**: High
- **Complexity**: Low

#### LM-13: Difficulty Level Classification
- **Description**: Tag tracks by dancer skill needed
- **Levels**: 
  - Beginner-friendly (simple rhythm, clear phrasing)
  - Intermediate (moderate complexity)
  - Advanced (challenging rhythms, complex musicality)
- **Use**: Filter for audience composition
- **Priority**: High
- **Complexity**: Low

#### LM-14: WCS Category Classification
- **Description**: West Coast Swing specific categorization
- **Categories**:
  - Blues/Slow
  - Contemporary/Pop
  - Uptempo
  - Old School WCS (classics everyone knows)
  - Modern WCS (newer songs DJs are testing)
- **Priority**: Medium
- **Complexity**: Low

#### LM-15: Manual Feature Override
- **Description**: Allow DJ to adjust analyzed features manually
- **Editable Fields**:
  - BPM (if detection was wrong)
  - Energy level (DJ disagrees with algorithm)
  - Key (if detection was wrong)
  - Danceability, brightness, etc.
- **Protection**: Mark as "manually adjusted" - don't overwrite on re-analysis
- **Priority**: Medium
- **Complexity**: Low

---

### New Ideas - Library Management

#### LM-16: Smart Playlists
- **Description**: Auto-updating playlists based on rules
- **Example Rules**:
  - "All blues songs under 95 BPM"
  - "Tracks with peak reactions > 70%"
  - "Recently added in last 30 days"
- **Priority**: Medium
- **Complexity**: Medium

#### LM-17: Duplicate Detection
- **Description**: Find potential duplicate tracks in library
- **Methods**:
  - Same artist + similar title
  - Audio fingerprint matching (advanced)
- **Priority**: Low
- **Complexity**: Medium

#### LM-18: Missing Metadata Fixer
- **Description**: Help fix tracks with poor/missing metadata
- **Features**:
  - Highlight tracks with missing artist/title
  - Suggest corrections from online databases
  - Batch apply corrections
- **Priority**: Medium
- **Complexity**: Medium

#### LM-19: Import from VirtualDJ Playlists
- **Description**: Import existing VirtualDJ playlists into Pika!
- **Use**: Bring over curated playlists from DJ's existing workflow
- **Priority**: Medium
- **Complexity**: Medium

#### LM-20: Track "Freshness" Indicator
- **Description**: Show how recently/frequently track has been played
- **Indicators**:
  - 🆕 Never played
  - 🔄 Played recently (last 7 days)
  - ⏰ Haven't touched in 30+ days
- **Priority**: Low
- **Complexity**: Low

---

## Analytics & Insights

### Session Analytics

#### AN-1: Post-Session Report
- **Description**: Detailed breakdown after each session
- **Content**:
  - Total tracks played
  - BPM range used
  - Peak/brick ratio
  - Crowd engagement over time
  - Most liked tracks
  - Tempo progression chart
- **Priority**: Medium
- **Complexity**: Medium

#### AN-2: Time-of-Night Analysis
- **Description**: See what works at different times
- **Breakdown**:
  - Early night (before 10pm)
  - Prime time (10pm - 1am)
  - Late night (after 1am)
- **Insight**: "Your tracks get 40% more peaks between 11pm-1am"
- **Priority**: Medium
- **Complexity**: Medium

#### AN-3: BPM Sweet Spot Finder
- **Description**: Analyze which BPM ranges perform best
- **Insight**: "Songs at 98-104 BPM have highest engagement at Studio X"
- **Priority**: Medium
- **Complexity**: Medium

#### AN-4: Song Performance Trends
- **Description**: Track how individual songs perform over time
- **Charts**:
  - Reaction rate per play
  - Detecting "fatigue" (declining reactions)
  - Detecting "discoveries" (improving reactions)
- **Priority**: Low
- **Complexity**: Medium

#### AN-5: Crowd Preferences by Event Type
- **Description**: Compare analytics across different event types
- **Question**: "Does this song work better at practices vs socials?"
- **Priority**: Low
- **Complexity**: Medium

---

### New Ideas - Analytics

#### AN-6: DJ Comparison (Own Performance)
- **Description**: Compare your sessions over time
- **Charts**: Engagement trends, track diversity, BPM variety
- **Priority**: Low
- **Complexity**: Medium

#### AN-7: "Song Retirement" Suggestions
- **Description**: AI suggests songs to retire from rotation
- **Criteria**: Declining engagement, overplayed frequency
- **Priority**: Low
- **Complexity**: Medium

#### AN-8: Peak Moment Detector
- **Description**: Identify what made certain moments "peaks"
- **Analysis**: What song came before? What time? What tempo change?
- **Priority**: Low
- **Complexity**: High

#### AN-9: Venue Performance Profiles (Future)
- **Description**: Per-venue analytics once venue tagging exists
- **Priority**: Low (blocked by venue system)
- **Complexity**: Medium

#### AN-10: Export Analytics to CSV
- **Description**: Raw data export for advanced analysis
- **Priority**: Low
- **Complexity**: Low

---

### Small Improvements (Quick Wins)

#### AN-11: Session Names
- **Description**: Better session identification on DJ profile page
- **Current**: Shows only date (repetitive for multiple sessions/day)
- **Options**:
  - A. Date + Time: "Tue, Jan 6 @ 7:30 PM" (5 min)
  - B. Auto-generated from first track: "Women Be Wise Set" (15 min)
  - C. DJ names session when starting (30 min, schema change)
  - D. First Track + Time: "Women Be Wise (7:30 PM)" (10 min)
- **Priority**: High
- **Complexity**: Low

#### AN-12: Track Fingerprint (Radar Chart)
- **Description**: Multi-dimensional visualization per track
- **Dimensions**: Likes, Perfect Tempo %, BPM (normalized), Position in set, Engagement
- **Implementation**: Recharts RadarChart (already installed)
- **Priority**: Medium
- **Complexity**: Low (analytics page only)

#### AN-13: Key Wheel Visualization
- **Description**: Show harmonic mixing flow through the set
- **Visualization**: Circle of Fifths with transition lines
- **Use Case**: DJ-focused (did I make good key transitions?)
- **Shows**: Key compatibility scores, most used keys
- **Priority**: Low
- **Complexity**: Medium

---

### Platform Ideas (Larger Vision)

#### AN-14: Community Summary Page 🌟
- **Description**: Global analytics aggregating all Pika! sessions
- **Content**:
  - Most loved tracks this week/month
  - Trending songs in WCS community
  - Total engagement stats
  - Regional popularity
- **Revenue Potential**: 
  - Sponsored track placements
  - Premium insights for DJs
  - Advertising
- **Anti-Hate Design**:
  - Focus on POSITIVE metrics only (most loved, not least)
  - Show trends, not DJ rankings
  - Anonymous aggregation
  - No public comparison between DJs
- **Privacy**: Aggregate only, opt-out for DJs
- **Priority**: Medium-High (community value)
- **Complexity**: High

#### AN-15: DJ Personal Summary Page 🎧
- **Description**: Personal analytics dashboard for each DJ
- **Content**:
  - Most played tracks (lifetime)
  - Session frequency, total tracks
  - Average engagement metrics
  - Music style breakdown (BPM ranges, keys)
  - (Future) Events attended/upcoming
- **Public vs Private**:
  - Public: Highlights, session count, "signature songs"
  - Private: Detailed analytics, improvement suggestions
- **Anti-Hate Design**:
  - No public ranking or comparison
  - Positive framing ("top 5 crowd favorites" not "5 flops")
  - DJ controls what's visible
- **Priority**: Medium
- **Complexity**: Medium

#### AN-16: Live DJ Polls 📊
- **Description**: DJ can start real-time polls during sessions
- **Poll Types**:
  - Music style: "What vibe next? Pop / Blues / Electro"
  - Tempo: "Ready for something faster?"
  - General: Custom single-choice questions
- **DJ Control**:
  - DJ decides WHEN to poll
  - DJ controls OPTIONS (no negative options)
  - Poll is SUGGESTIVE, not binding
  - DJ can disable feature entirely
- **Anti-Hate Design**:
  - No "don't play X" options
  - Limit poll frequency (max 1 per 15 min)
  - Positive framing only
  - No public results (DJ sees, audience doesn't)
  - No comments/text input
- **Abuse Prevention**:
  - DJ curates options
  - Rate limiting
  - No trolling vectors (no freeform text)
- **Priority**: High (high engagement potential)
- **Complexity**: Medium

---

## Event & Multi-DJ System

### Event Structure

#### EV-1: Event Creation
- **Description**: Create named events with dates and details
- **Fields**:
  - Event name
  - Date/time
  - Venue (optional)
  - Event type (social, workshop, competition)
  - Expected attendance
- **Priority**: Medium (future sprint)
- **Complexity**: Medium

#### EV-2: Multi-DJ Roster
- **Description**: Assign multiple DJs to time slots
- **Features**:
  - DJ name + time slot
  - Order of rotation
  - Handoff notes between DJs
- **Requires**: Account system or at minimum DJ identification
- **Priority**: Medium (future sprint)
- **Complexity**: High

#### EV-3: Event Landing Page
- **Description**: `/event/{slug}` public page for dancers
- **Content**:
  - Event name and details
  - Current DJ
  - Schedule
  - QR code to join
- **Priority**: Medium
- **Complexity**: Medium

#### EV-4: Venue Profiles
- **Description**: Saved venue information
- **Fields**:
  - Venue name
  - Location
  - Typical crowd size
  - Genre preferences (based on history)
  - Notes
- **Priority**: Low (future sprint)
- **Complexity**: Medium

#### EV-5: Event Templates
- **Description**: Reusable event configurations
- **Example**: "Monthly Social at Studio X" template with standard schedule
- **Priority**: Low
- **Complexity**: Low

---

### New Ideas - Events

#### EV-6: Dancer Pre-Registration
- **Description**: Dancers RSVP before event
- **Use**: DJ knows expected attendance and composition in advance
- **Priority**: Low
- **Complexity**: Medium

#### EV-7: Event Series Tracking
- **Description**: Link recurring events together
- **Use**: "This is the 12th Thursday Social - compare to previous"
- **Priority**: Low
- **Complexity**: Medium

#### EV-8: Post-Event Summary for Organizers
- **Description**: Automated report for event organizers
- **Content**: Attendance, engagement metrics, song list, recommendations
- **Priority**: Medium
- **Complexity**: Medium

#### EV-9: Event Branding
- **Description**: Custom colors/logo for event landing page
- **Priority**: Low
- **Complexity**: Low

#### EV-10: Integrated Event Promotion
- **Description**: Share event on social media with nice preview cards
- **Priority**: Low
- **Complexity**: Medium

---

## Technical & Quality of Life

### Performance & Reliability

#### TQ-1: Offline Mode
- **Description**: Core features work without internet
- **Scope**:
  - Library browsing (local DB)
  - Set building (local)
  - Sync when connection restored
- **WCS Context**: Venue WiFi is often unreliable
- **Priority**: Medium
- **Complexity**: High

#### TQ-2: Database Backup/Restore
- **Description**: Export/import entire library and session data
- **Format**: SQLite file or JSON export
- **Priority**: Medium
- **Complexity**: Low

#### TQ-3: Graceful Degradation
- **Description**: Handle cloud service outages
- **Behavior**: Continue working locally, queue cloud actions for later
- **Priority**: Medium
- **Complexity**: Medium

#### TQ-4: Startup Performance
- **Description**: Fast app launch even with large libraries
- **Target**: <2 seconds to interactive
- **Priority**: Medium
- **Complexity**: Medium

#### TQ-5: Memory Optimization
- **Description**: Handle 50,000+ track libraries efficiently
- **Techniques**: Virtualized lists, lazy loading, indexed searches
- **Priority**: Medium
- **Complexity**: Medium

---

### User Experience

#### TQ-6: Dark/Light Theme
- **Description**: Theme preference toggle
- **Priority**: Low
- **Complexity**: Low

#### TQ-7: Customizable Column Layout
- **Description**: Choose which columns to show in library table
- **Options**: Artist, Title, BPM, Key, Energy, Duration, Tags, etc.
- **Priority**: Low
- **Complexity**: Low

#### TQ-8: Inline Editing
- **Description**: Edit track metadata directly in table
- **Fields**: Artist, title, BPM, key (click to edit)
- **Priority**: Medium
- **Complexity**: Low

#### TQ-9: Audio Preview
- **Description**: Play snippet of track without leaving app
- **Integration**: Via VirtualDJ or direct audio file access
- **Priority**: Medium
- **Complexity**: Medium

#### TQ-10: Waveform Display
- **Description**: Show audio waveform in track info
- **Use**: Identify song structure, breaks, builds
- **Priority**: Low
- **Complexity**: High

---

### New Ideas - Technical

#### TQ-11: Multi-Window Support
- **Description**: Pop out panels to separate windows
- **Use Case**: Library on main screen, now playing on secondary
- **Priority**: Low
- **Complexity**: Medium

#### TQ-12: Touch Screen Optimization
- **Description**: Larger touch targets for DJ controllers with touch
- **Priority**: Low
- **Complexity**: Low

#### TQ-13: Auto-Update System
- **Description**: In-app updates without manual download
- **Priority**: Medium
- **Complexity**: Medium

#### TQ-14: Crash Reporting
- **Description**: Anonymous crash reports for debugging
- **Priority**: Medium
- **Complexity**: Medium

#### TQ-15: Usage Analytics (Opt-In)
- **Description**: Anonymous feature usage for product decisions
- **Priority**: Low
- **Complexity**: Low

---

## Future Integrations

### Music Services

#### FI-1: Spotify Integration
- **Description**: Link tracks to Spotify for streaming
- **Features**:
  - Auto-match library to Spotify catalog
  - "Listen on Spotify" links for dancers
  - Playlist sync
- **Priority**: Low (future)
- **Complexity**: High

#### FI-2: Apple Music Integration
- **Description**: Same as Spotify for Apple Music users
- **Priority**: Low (future)
- **Complexity**: High

#### FI-3: SoundCloud/Bandcamp Discovery
- **Description**: Discover WCS-appropriate music from independent artists
- **Priority**: Low (future)
- **Complexity**: High

---

### DJ Software

#### FI-4: Rekordbox Export
- **Description**: Export sets to Rekordbox format
- **Priority**: Low (future)
- **Complexity**: Medium

#### FI-5: Serato Export
- **Description**: Export sets to Serato format
- **Priority**: Low (future)
- **Complexity**: Medium

#### FI-6: Traktor Export
- **Description**: Export sets to Traktor format
- **Priority**: Low (future)
- **Complexity**: Medium

---

### Hardware

#### FI-7: MIDI Controller Support
- **Description**: Map MIDI controls to Pika! actions
- **Actions**: Mark peak, add note, next suggestion
- **Priority**: Low (future)
- **Complexity**: High

#### FI-8: Stream Deck Integration
- **Description**: Elgato Stream Deck button mappings
- **Priority**: Low (future)
- **Complexity**: Medium

---

### New Ideas - Integrations

#### FI-9: Calendar Integration
- **Description**: Sync events with Google/Apple Calendar
- **Priority**: Low
- **Complexity**: Medium

#### FI-10: Music Licensing Database
- **Description**: Check if songs are properly licensed for public play
- **Priority**: Low
- **Complexity**: High

#### FI-11: WCS Event Calendar Sync
- **Description**: Import events from westcoastswingonline.com or similar
- **Priority**: Low
- **Complexity**: Medium

#### FI-12: Discord/Slack Notifications
- **Description**: Post-event summaries to community Discord
- **Priority**: Low
- **Complexity**: Low

#### FI-13: Photo/Video Timestamp Correlation
- **Description**: Match event photos to songs playing at that moment
- **Use**: "This great video was during Song X"
- **Priority**: Low
- **Complexity**: High

---

## Priority Summary

### Immediate (Next Sprint)
- **Library search** (critical for DJs with thousands of tracks)
- BPM prominently displayed everywhere
- Song duration in library
- Advanced search with BPM filter
- Multi-select and bulk operations
- Save/load sets
- Full track history on web app
- Crowd size counter
- Tempo preference buttons (faster/slower)

### Short Term
- Track tags system
- DJ personal notes
- Difficulty level classification
- Request queue for dancers
- Set export options
- Song reactions (🔥/🐢/🐇)

### Medium Term
- Competition playlist builder
- Division-appropriate song tagging
- Event structure / multi-DJ
- Post-session analytics
- Set templates

### Long Term / Future
- Competition timing integration
- Venue profiles
- Streaming service integrations
- Hardware integrations
- Full account system

---

## Document Changelog

| Date | Changes |
|------|---------|
| 2026-01-06 | **IMPLEMENTED**: Live DJ Polls - complete flow with live results for dancers + recap integration ✅ |
| 2026-01-06 | **FIXED**: Tempo feedback (🐢/👌/🐇) now resets on track change in Perform Mode ✅ |
| 2026-01-06 | **IMPLEMENTED**: Set Fingerprint Radar Chart in analytics (energy, dance, bright, acoustic, groove) ✅ |
| 2026-01-06 | **IMPLEMENTED**: Session names now show date + time (e.g., "Mon, Jan 6 @ 7:30 PM") ✅ |
| 2026-01-06 | **IMPLEMENTED**: Fingerprint data (danceability, groove, etc.) piped to cloud ✅ |
| 2026-01-06 | **IMPLEMENTED**: BPM Timeline chart in analytics (tempo progression) ✅ |
| 2026-01-06 | **IMPLEMENTED**: Energy Wave visualization (BPM + engagement flow) ✅ |
| 2026-01-06 | **IMPLEMENTED**: BPM and key stored per track for enhanced analytics ✅ |
| 2026-01-06 | **IMPLEMENTED**: Session Analytics page with timeline charts & engagement visualization ✅ |
| 2026-01-06 | **IMPLEMENTED**: Tempo votes persisted per track (reset on track change) ✅ |
| 2026-01-06 | **IMPLEMENTED**: Tempo feedback shown on recap page (🐢 slower, ✅ perfect, 🐇 faster) ✅ |
| 2026-01-05 | **IMPLEMENTED**: "My Likes" page for dancers (`/my-likes`) - view all your liked songs ✅ |
| 2026-01-05 | **IMPLEMENTED**: `client_id` stored with likes for personal history tracking ✅ |
| 2026-01-05 | **IMPLEMENTED**: Per-track like counts on recap page ✅ |
| 2026-01-05 | **FIXED**: Recap DJ name now fetched from database (was defaulting to "DJ") ✅ |
| 2026-01-05 | **FIXED**: Reduced SUBSCRIBE log spam (only log new subscriptions) ✅ |
| 2026-01-05 | **FIXED**: Multiple sequential /history API calls (added deduplication) ✅ |
| 2026-01-05 | **DESIGNED**: Deployment architecture ([006-deployment-architecture.md](docs/design/006-deployment-architecture.md)) |
| 2026-01-05 | **CHANGED**: Dev servers bind to all interfaces for LAN testing |
| 2026-01-05 | **FIXED**: Homepage visitors (localhost:3002) now counted as listeners ✅ |
| 2026-01-05 | **IMPLEMENTED**: QR codes use local IP for LAN testing (phones/tablets) ✅ |
| 2026-01-05 | **FIXED**: Listener count now per-session (was counting all sessions globally) ✅ |
| 2026-01-05 | **FIXED**: Like toast notifications deduplicated (no more double toasts) ✅ |
| 2026-01-05 | **FIXED**: Timeline shows only previous plays, not current (cleaner UI) ✅ |
| 2026-01-05 | **CHANGED**: Default window size increased to 1400x900 for better layout ✅ |
| 2026-01-05 | **FIXED**: Performance Mode now shows tempo feedback and listener count ✅ |
| 2026-01-05 | **FIXED**: Peak/Brick badge no longer overlays footer buttons ✅ |
| 2026-01-05 | **IMPLEMENTED**: Edit DJ name button (click DJ badge to change) ✅ |
| 2026-01-05 | **FIXED**: "Skip track" choice now correctly prevents cloud broadcast ✅ |
| 2026-01-05 | **IMPLEMENTED**: Stale track warning (detects old VirtualDJ history entries) ✅ |
| 2026-01-04 | **IMPLEMENTED**: New URL structure `/dj/{slug}/...` ✅ |
| 2026-01-04 | **IMPLEMENTED**: DJ profile page with session history ✅ |
| 2026-01-04 | **IMPLEMENTED**: DJ profile API endpoint ✅ |
| 2026-01-04 | **IMPLEMENTED**: Logbook "Recap Link" button for each session ✅ |
| 2026-01-04 | **IMPLEMENTED**: Session history stores cloud recap link ✅ |
| 2026-01-04 | **IMPLEMENTED**: DJ name → URL slug utility (`slugify()`) ✅ |
| 2026-01-04 | **FIXED**: Session ID now unique per session (was reusing same ID) ✅ |
| 2026-01-04 | **IMPLEMENTED**: DJ name settings with first-time prompt ✅ |
| 2026-01-04 | **IMPLEMENTED**: "Include current track?" prompt when going live ✅ |
| 2026-01-04 | **DESIGNED**: Spotify playlist generation ([005-spotify-playlist-generation.md](docs/design/005-spotify-playlist-generation.md)) |
| 2026-01-04 | **FIXED**: Duplicate tracks in session recap ✅ |
| 2026-01-04 | **IMPLEMENTED**: QR code sharing for dancers (spread the session!) ✅ |
| 2026-01-04 | **IMPLEMENTED**: Tempo preference buttons (Slower/Perfect/Faster) ✅ |
| 2026-01-04 | **IMPLEMENTED**: Session Recap page with full tracklist (Phase 1) ✅ |
| 2026-01-04 | **IMPLEMENTED**: Save/Load sets with persistent storage ✅ |
| 2026-01-04 | **IMPLEMENTED**: Multi-select with Shift/Cmd+Click, bulk add to set ✅ |
| 2026-01-03 | **IMPLEMENTED**: Library search with artist/title filtering ✅ |
| 2026-01-03 | **IMPLEMENTED**: BPM filter buttons (Slow/Medium/Fast presets) ✅ |
| 2026-01-03 | **IMPLEMENTED**: Song duration column in library table ✅ |
| 2026-01-03 | **IMPLEMENTED**: Crowd size counter (DJ + dancer views) ✅ |
| 2026-01-03 | Updated WSDC division structure with official point ranges |
| 2026-01-03 | Added library search to immediate priorities |
| 2026-01-03 | Initial creation with all discussed ideas |
