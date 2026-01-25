# Pika! Performance & Optimization Guide

This document tracks performance considerations, bottlenecks, and optimization strategies.

---

## 1. Audio Analysis Pipeline

### Bottlenecks

| Operation | Time | CPU | Notes |
|-----------|------|-----|-------|
| Sidecar cold start | 2-3s | Medium | Python + library imports |
| First librosa call | 3-5s | High | FFT initialization |
| Per-track analysis | 5-10s | High | Full feature extraction |
| VDJ lookup | <50ms | Low | XML parsing only |

### Mitigations

| Strategy | Implementation | Status |
|----------|---------------|--------|
| **Pre-warm on launch** | Sidecar spawns on App mount | ✅ Done |
| **VDJ fallback** | `lookup_vdj_track_metadata` for BPM/key | ✅ Done |
| **Batch before gig** | AnalyzerStatus.tsx "Start Analysis" | ✅ Done |
| **CPU priority** | `analysis.cpuPriority` setting (0s/1s/3s delay) | ✅ Done |
| **Skip live analysis** | `analysis.onTheFly` toggle in Settings | ✅ Done |
| **60s sample limit** | Only analyze first minute | ✅ Done |
| **Lower sample rate** | 22050 Hz instead of 44100 | ✅ Done |
| **Performance logging** | Timing logs in Python sidecar | ✅ Done |

### Dangerous Operations (Avoid!)

| Operation | Risk | Alternative |
|-----------|------|-------------|
| On-the-fly analysis during live set | CPU throttle → VDJ dropout | Pre-gig batch |
| Analyzing 1000+ tracks in one batch | UI freeze | Chunk with progress |
| Cold sidecar + immediate analysis | 15s+ delay | Pre-warm on launch |

---

## 2. Database Operations

### Bottlenecks

| Operation | Time | Notes |
|-----------|------|-------|
| `getAllTracks()` | O(n) | Loads entire table into memory |
| In-memory track search | O(n) | Linear scan |
| Bulk import (5000 tracks) | 2-5s | Chunked at 100/batch |

### Mitigations

| Strategy | Implementation | Status |
|----------|---------------|--------|
| **Indexed lookup** | `findByTrackKey()` uses index | ✅ Done |
| **Chunked imports** | 100 tracks per batch | ✅ Done |
| **track_key index** | `CREATE UNIQUE INDEX idx_track_key` | ✅ Done |
| **Remove getAllTracks from hot path** | Use `findByTrackKey` instead | ✅ Done |
| **Cloud DB indexes** | 12 indexes on hot query paths (v0.2.2) | ✅ Done |
| **Atomic Transactions** | `BEGIN TRANSACTION` on critical writes (v0.3.0) | ✅ Done |

---

## 3. Network & Cloud

### Bottlenecks

| Operation | Time | Notes |
|-----------|------|-------|
| WebSocket reconnect | 1-5s | Depends on network |
| Session sync | Variable | Depends on track count |

### Mitigations

| Strategy | Implementation | Status |
|----------|---------------|--------|
| **Offline queue** | SQLite `offline_queue` table | ✅ Done |
| **Heartbeat monitor** | Reconnect on disconnect | ✅ Done |
| **Batch sync** | POST fingerprints at session end | ✅ Done |
| **Debounced Broadcasts** | 2-second heartbeat for listener counts | ✅ Done |
| **TTL Caching** | 5-minute cache for `/stats/top-tracks` | ✅ Done |
| **Sticky Participants** | 5-minute window for pocketed phones | ✅ Done |

---

## 4. UI Responsiveness

### Guidelines

| Operation | Max Acceptable Time | Notes |
|-----------|---------------------|-------|
| Track change display | <100ms | User perceives as instant |
| Library load | <500ms | Show spinner if longer |
| Analysis feedback | <200ms | Progress bar must update |

### Mitigations

| Strategy | Implementation | Status |
|----------|---------------|--------|
| **Virtualized lists** | `@tanstack/react-virtual` in LibraryBrowser | ✅ Done |
| **Debounced search** | 200ms delay on keystrokes | ✅ Done |
| **Progress indicators** | Analysis shows current track | ✅ Done |
| **Pause/Resume** | Analyzer can be paused mid-batch | ✅ Done |

---

## 5. Memory Usage

### Targets

| Component | Target | Notes |
|-----------|--------|-------|
| Desktop app | <200MB | React + Tauri |
| Python sidecar | <100MB | librosa + numpy |
| SQLite DB | <50MB | For 10k tracks |

### Mitigations

| Strategy | Implementation | Status |
|----------|---------------|--------|
| **Stream audio** | Don't load full file into memory | ✅ librosa handles |
| **Clear analysis results** | Don't keep in React state | ✅ Done |
| **Lazy component loading** | React.lazy() for LivePerformanceMode, Settings, Logbook | ✅ Done |
| **O(1) Map Cleanup (Cloud)** | Nested `Map<Session, Map<Client...>>` for instant delete | ✅ Done (v0.3.0) |
| **Explicit Queue Cleanup** | `cleanupSessionQueue()` on disconnect | ✅ Done (v0.3.0) |

---

## 6. Aesthetic Intensity (Design Choice)

| Feature | Pattern | Intent |
|---------|---------|--------|
| **Premium Backdrop** | `blur-[120px]` | Create deep atmospheric depth |
| **Glow Effects** | `shadow-purple-500/20` | Highlight active room presence |
| **Glassmorphism** | `bg-slate-900/50` | Maintain layered UI hierarchy |

### Bottlenecks
- **GPU Overdraw**: On low-end mobile devices, multiple 120px blurs can cause frame drops during scrolling.

### Mitigation
- **Intentional Trade-off**: We prioritize the "Premium" look over support for legacy ultra-low-end mobile devices. The Pika! core audience (DJs/Dancers) is expected to use reasonably modern hardware for the connected floor experience.

---

## 7. Battery Optimization (Zero-Wakeup Architecture)

To achieve an **11/10 Battery Score**, we implemented a "Zero-Wakeup" architecture that eliminates all CPU and Network activity when the application is backgrounded.

### Behavior Protocol

| Condition | WebSocket | Polling (API) | Animations (GPU) | Power State |
|-----------|-----------|---------------|------------------|-------------|
| **Active** | Connected (Ping/Pong) | 30s Interval | 60 FPS | Normal |
| **Hidden** | **Suspended** (No Pings) | **Stopped** | **Frozen** (0 FPS) | **Deep Sleep** |
| **Resumed** | Auto-Reconnect | Immediate Fetch | Resume Loop | Awake |

### 1. WebSocket & Polling Suspension (H1)
- **Logic:** `useLiveListener.ts` and `page.tsx` use a visibility-aware polling strategy.
- **Action:** Network activity (AJAX polling and heartbeats) is **stopped** when the tab is hidden.
- **Benefit:** Eliminates 100% of background network noise, drastically extending mobile battery life.

### 2. Yielding I/O & UI Fluidity (H2)
- **Logic:** `useTempoVote.ts` defers synchronous `localStorage` hits via `setTimeout(0)`.
- **Action:** Yields to the rendering engine before performing blocking I/O.
- **Benefit:** Prevents frame drops during rapid track transitions by ensuring the initial UI paint is never blocked.

### 3. SWR Caching & Deduplication (H3)
- **Logic:** `useTrackHistory.ts` uses the `SWR` hook for REST API retrieval.
- **Benefit:** Automatic request deduplication across multiple renders and "stale-while-revalidate" caching for near-instant history viewing.

### 4. stable Handler Trees (H4)
- **Logic:** Full memoization of feature handler objects (`tempoHandlers`, `pollHandlers`, etc.).
- **Benefit:** Prevents unnecessary React re-renders of the main composition tree, ensuring that only components actually receiving data updates are processed.

---

## Change Log

| Date | Change |
|------|--------|
| 2026-01-25 | **Performance Hardening (v0.3.2)**: Visibility polling (H1), Yielding I/O (H2), SWR Caching (H3), Memoized Handlers (H4) |
| 2026-01-24 | **Phase 2 Hardening (v0.3.0)**: O(1) Map optimizations, Atomic Transactions (Desktop), Queue Cleanup |
| 2026-01-23 | **11/10 Battery Update**: Implemented Zero-Wakeup architecture (WS suspension, Poll freezing, Animation kill) |
| 2026-01-17 | Library virtualization (`@tanstack/react-virtual`) and lazy component loading implemented |
| 2026-01-16 | Restored `blur-[120px]` on all devices; documented Aesthetic Intensity |
| 2026-01-16 | Added debounced broadcasts, TTL caching, sticky participants (Pro Enhancements) |
| 2026-01-16 | Added CPU priority, skip live analysis, pause/resume, batch sync |
| 2026-01-15 | Initial document, O(log n) track lookup refactor |
| 2026-01-15 | Added audio analysis pipeline section |
