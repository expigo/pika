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
| **CPU priority** | Set sidecar to low priority | ❌ TODO |
| **Skip live analysis** | Don't analyze during performance | ❌ TODO (Settings) |
| **60s sample limit** | Only analyze first minute | ✅ Done |
| **Lower sample rate** | 22050 Hz instead of 44100 | ✅ Done |

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
| **Batch sync** | POST all tracks at session end | ❌ TODO (Phase 4) |

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
| **Virtualized lists** | Only render visible rows | ❌ TODO (LibraryBrowser) |
| **Debounced search** | 200ms delay on keystrokes | ✅ Done |
| **Progress indicators** | Analysis shows current track | ✅ Done |

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
| **Lazy component loading** | Code split heavy views | ❌ TODO |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-01-15 | Initial document, O(log n) track lookup refactor |
| 2026-01-15 | Added audio analysis pipeline section |
