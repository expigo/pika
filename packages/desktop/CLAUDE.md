# CLAUDE.md - Desktop Package

This file provides guidance for working with the Pika! Desktop application, a complex Tauri v2 + React 19 + Python sidecar application.

## Architecture Overview

The Desktop app is a **three-layer architecture**:

```
┌─────────────────────────────────────────┐
│   Frontend (React 19 + TypeScript)     │  ← UI, hooks, components
│   Port: 1420 (dev)                      │
└─────────────────────────────────────────┘
                 ↕ IPC (Tauri Commands)
┌─────────────────────────────────────────┐
│   Backend (Rust - Tauri v2)             │  ← VirtualDJ parsing, file system
│   - VDJ XML parsing (quick-xml)         │
│   - File system access                  │
│   - Sidecar process management          │
└─────────────────────────────────────────┘
                 ↕ HTTP (localhost)
┌─────────────────────────────────────────┐
│   Sidecar (Python + FastAPI)            │  ← Audio analysis (librosa)
│   Port: Random (49152-65535)            │
└─────────────────────────────────────────┘
```

### Communication Flow
1. **Frontend → Rust:** Tauri IPC via `invoke()` calls
2. **Rust → Frontend:** Tauri events via `emit()`
3. **Frontend → Python:** HTTP requests to sidecar's random port
4. **Frontend → Cloud:** WebSocket (`wss://`) and REST (`https://`) via `apiClient`

## Python Sidecar

### Setup

```bash
cd packages/desktop/python-src

# Create virtual environment with uv
uv venv

# Install dependencies
uv pip install -r requirements.txt
```

**Dependencies:**
- `fastapi` - HTTP server framework
- `uvicorn` - ASGI server
- `librosa` - Audio analysis (BPM, key detection, spectral features)
- `numpy` - Numerical computations
- `soundfile` - Audio I/O
- `pyinstaller` - Bundling for production

**Note:** Project uses `librosa` and `numpy` exclusively for stability across platforms. Previous experiments with `essentia` were replaced.

### Development

**In development (`bun tauri dev`):**
- Sidecar runs as a Python script (NOT bundled binary)
- Tauri spawns: `python python-src/main.py --port <random-port>`
- Hot reload NOT supported - restart `tauri dev` to pick up Python changes

**Key Files:**
- `main.py` - FastAPI app entry point
- `audio_processing.py` - librosa-based analysis logic

**Endpoints:**
- `GET /health` - Health check (returns version)
- `POST /analyze?file_path=<path>` - Analyze audio file, returns `AnalysisResult`
- `GET /queue` - Get analysis queue status (future)

### Analysis Metrics

The sidecar returns comprehensive audio fingerprint data on a **0-100 scale**:

| Metric | Description | Calculation |
|--------|-------------|-------------|
| **BPM** | Beats per minute | `librosa.beat.beat_track()` |
| **Key** | Musical key (e.g., "Am", "C", "F#m") | Chroma features + major/minor detection |
| **Energy** | Overall intensity | RMS energy normalized |
| **Danceability** | Beat strength and regularity | Onset strength + tempo stability |
| **Brightness** | High-frequency content | Spectral centroid (mean / 4000 * 100) |
| **Acousticness** | Acoustic vs. electronic | Inverted spectral flatness `(1 - flatness) * 100` |
| **Groove** | Rhythmic consistency | Autocorrelation of onset envelope |

**All fingerprint metrics are clamped to 0-100 range for consistency.**

**Implementation:** `audio_processing.py:100-200`

### Debugging Python Sidecar

**Check if sidecar is running:**
```typescript
// In React DevTools console
const { status, baseUrl } = useSidecar();
console.log({ status, baseUrl }); // Should show "ready" + "http://localhost:<port>"
```

**Common issues:**
- **"Starting" forever**: Check Python environment has all dependencies
- **Port conflicts**: Sidecar uses random port (49152-65535) to avoid conflicts
- **Import errors**: Ensure `uv pip install -r requirements.txt` completed successfully

**Manual testing:**
```bash
# Terminal 1: Start sidecar manually
cd packages/desktop/python-src
source .venv/bin/activate  # or .venv/Scripts/activate on Windows
python main.py --port 8765

# Terminal 2: Test endpoint
curl http://localhost:8765/health
# Should return: {"status":"ok","version":"0.2.0"}

# Test analysis
curl -X POST "http://localhost:8765/analyze?file_path=/path/to/song.mp3"
```

### Building Sidecar Binary

Production builds use PyInstaller to create a standalone binary:

```bash
bun run build:sidecar
```

**What this does:**
1. Detects host platform via `rustc -vV` (gets target triple)
2. Runs PyInstaller to bundle Python + dependencies
3. Moves binary to `src-tauri/binaries/api-<target-triple>`
4. Tauri includes it in the final app bundle

**Build script:** `scripts/build-sidecar.ts`

## Tauri Commands (Rust ↔ Frontend)

### Available Commands (v0.4.0)

Defined in `src-tauri/src/lib.rs`:

| Command | Purpose | Returns |
|---------|---------|---------|
| `import_virtualdj_library` | Parse VDJ database.xml (all tracks) | `Vec<VDJTrack>` |
| `read_virtualdj_history` | Get most recent track from history.m3u | `Option<HistoryTrack>` |
| `read_virtualdj_history_full` | Get all tracks from history.m3u | `Vec<HistoryTrack>` |
| `lookup_vdj_track_metadata` | Fetch BPM/Key for a track from VDJ database | `Option<VDJMetadata>` |
| `get_local_ip` | Get machine's local IPv4 address | `Option<String>` |

### Calling from Frontend

```typescript
import { invoke } from "@tauri-apps/api/core";

// Get most recent track
const track = await invoke<HistoryTrack | null>("read_virtualdj_history");

// Get full history
const history = await invoke<HistoryTrack[]>("read_virtualdj_history_full");

// Import entire VDJ library
const library = await invoke<VDJTrack[]>("import_virtualdj_library");

// Lookup metadata for a specific file
const metadata = await invoke<VDJMetadata | null>("lookup_vdj_track_metadata", {
  filePath: "/path/to/track.mp3"
});

// Get local IP (for QR code generation)
const ip = await invoke<string | null>("get_local_ip");
```

### IPC Timeout Protection

**Pattern:** Wrap `invoke()` calls with timeout (virtualDjWatcher.ts pattern)

```typescript
async function invokeWithTimeout<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`IPC Timeout: ${cmd}`)), 5000)
  );
  return Promise.race([invoke<T>(cmd, args), timeout]);
}

const history = await invokeWithTimeout<HistoryTrack[]>("read_virtualdj_history_full");
```

### Adding a New Command

1. **Define in Rust** (`src-tauri/src/lib.rs`):
```rust
#[tauri::command]
fn my_command(arg: String) -> Result<String, String> {
    Ok(format!("Processed: {}", arg))
}
```

2. **Register in builder** (`src-tauri/src/lib.rs`):
```rust
.invoke_handler(tauri::generate_handler![
    import_virtualdj_library,
    read_virtualdj_history,
    read_virtualdj_history_full,
    lookup_vdj_track_metadata,
    get_local_ip,
    my_command  // Add here
])
```

3. **Call from frontend**:
```typescript
const result = await invoke<string>("my_command", { arg: "test" });
```

## VirtualDJ Integration

### File Watching

**Pattern:** Desktop watches VirtualDJ's M3U history file for changes.

**Implementation:** `src/services/virtualDjWatcher.ts`

**Key points:**
**Key points:**
- **Primary:** Native file system watcher (via `notify` crate) for instant updates.
- **Fallback:** Adaptive polling (1s visible, 3s hidden) if native watcher fails to start.
- Detects new tracks by listening for `Modify` or `Create` events on `.m3u` files.
- Calls Rust command `read_virtualdj_history` for file parsing.

**Startup Logic:**
Watcher initialization is handled via `start_vdj_watcher` command, triggered when the WebSocket connects or visibility changes.

**VDJ File Locations:**
- **macOS:** `~/Documents/VirtualDJ/History/history.m3u`
- **Windows:** `%USERPROFILE%\Documents\VirtualDJ\History\history.m3u`

### History Import

**Pattern:** `useVdjHistory` hook detects session boundaries.

**Session detection logic:**
- Calls `read_virtualdj_history_full` to get all tracks
- Identifies gaps of **30+ minutes** as session boundaries
- Presents user with "resume from" options

**Files:**
- `src/hooks/useVdjHistory.ts` - Detection logic
- `src/components/StartSessionModal.tsx` - Single "Start Session" modal (title + optional "start with current track" + optional "add earlier set")

### Deduplication & initial-track handling

**Challenge:** Prevent recording the same track twice (history import vs. live watcher), and never treat a stale `history.m3u` line as "now playing".

**Hybrid dedup in `useLiveSession.ts`:**
- **Window:** same Artist-Title within 1 min (`TRACK_DEDUP_WINDOW_MS = 60000`, src/hooks/live/constants.ts).
- **Absolute interval:** same Artist-Title blocked 2 min (`MIN_REPLAY_INTERVAL_MS`) — survives a 60s-window rollover.
- **Import overlap:** `registerImportedTrack()` stops a just-imported track (still on the decks) from being re-recorded.

**Liveness gate (`services/virtualDjWatcher.ts`):** the last history line persists after VDJ closes, so it counts as "now playing" only if fresh — `isTrackFresh()` / `INITIAL_TRACK_FRESHNESS_MS` (15 min). `detectInitialTrack()` returns `null` when stale, and the watcher's initial emission is freshness-gated → a closed/idle VDJ yields **no current track** (clean start).

**Fresh / "don't include":** `prepareInitialTrackState()` (skip path) + `handleTrackChange()`'s leading guard fully suppress the initial track — no "Now Playing", broadcast, or DB record.

**Critical for debugging:** phantom now-playing on a fresh session → freshness gate; duplicate plays → 60s window / 2-min interval.

**Tests:** `src/hooks/useLiveSession.dedup.test.ts`, `src/services/virtualDjWatcher.test.ts`. See [go-live flow](../../docs/architecture/go-live-flow.md).

### Metadata Enrichment

**Pattern:** Use `lookup_vdj_track_metadata` to fetch BPM/Key from VDJ database.

When a track is detected from history, we:
1. Parse artist/title from M3U file
2. Call `lookup_vdj_track_metadata(filePath)` to get VDJ's BPM/Key
3. Merge with sidecar analysis results

**Implementation:** `useLiveSession.ts`

## Database (SQLite + Drizzle)

**Database location:** Tauri's app data directory
- **macOS:** `~/Library/Application Support/com.pika.desktop/pika.db`
- **Windows:** `%APPDATA%\com.pika.desktop\pika.db`

### Schema

Defined in `src/db/schema.ts`:
- `tracks` - Music library (file path, artist, title, BPM, fingerprint data)
- `sessions` - DJ sessions (local + cloud sync)
- `plays` - Individual track plays within sessions
- `savedSets` - Saved playlists/setlists
- `templates` - Poll question templates
- `settings` - User preferences
- `offlineQueue` - Queued WebSocket messages when offline

### Repository Pattern

All database access goes through repository files in `src/db/repositories/`:

```typescript
// Example: trackRepository.ts
export const trackRepository = {
  async getAllTracks(limit?: number) {
    const db = await getDatabase();
    return db.select().from(tracks).limit(limit || 10000);
  },

  async insertTrack(track: NewTrack) {
    const db = await getDatabase();
    return db.insert(tracks).values(track).returning();
  },

  // ... more methods
};
```

**Repositories:**
- `trackRepository.ts` - Music library operations
- `sessionRepository.ts` - Session CRUD + history queries
- `savedSetRepository.ts` - Playlist management
- `settingsRepository.ts` - App settings
- `offlineQueueRepository.ts` - Message queue for offline resilience
- `templateRepository.ts` - Poll templates

### Migrations

`schema.ts` is the **single source of truth**. Migrations are drizzle-kit-generated and
applied at runtime through the sqlite-proxy by `src/db/migrator.ts` (drizzle's own migrator
needs Node `fs`, which the Tauri WebView lacks — so the SQL is Vite-bundled via
`import.meta.glob('?raw')`). State is tracked in `__drizzle_migrations`.

**To change the schema:**
```bash
# 1. Edit src/db/schema.ts
bun run db:generate   # → src/db/migrations/000N_*.sql  (COMMIT these)
# 2. The new migration applies automatically on next app start (runMigrations).
```

**Key behaviours (see `migrator.ts` + `migrator.integration.test.ts`):**
- **Baseline-adopt:** a pre-existing hand-rolled DB (a `tracks` table but no
  `__drizzle_migrations`) is recorded at the `0000` baseline *without re-running it* — its
  data and schema are untouched. So existing installs upgrade losslessly.
- **Idempotent:** CREATEs run as `IF NOT EXISTS` (tauri-plugin-sql's pool can't guarantee a
  `BEGIN/COMMIT` is atomic), so a partial failure is safe to re-run.
- **Fail-fast:** a migration error throws (no swallow-and-continue), so a broken DB surfaces
  loudly instead of running on a half-built schema.
- Adding indexes/FKs: declare them in `schema.ts` (drizzle-sqlite has no per-column index
  `DESC` — a plain index serves both directions).

## Key Hooks

### `useLiveSession` - The Heart of Desktop

**Location:** `src/hooks/useLiveSession.ts` (1239 lines)

**Purpose:** Orchestrates the entire "Go Live" flow
- WebSocket connection to Cloud
- VirtualDJ watcher lifecycle
- Track broadcasting
- History import
- Offline queue management
- Session state management

**State machine:**
```
IDLE → DETECTING → PROMPTING → CONNECTING → LIVE → SYNCING
```

**Key methods:**
- `goLive(name, includeCurrentTrack)` - Start a live session
- `endSession()` - End current session
- `sendLike()`, `startPoll()`, etc. - Interaction handlers

### Modular Hook Extraction (v0.4.0)

Major refactor: Extracted `useLiveSession` logic into **13 focused modules** in `src/hooks/live/`:

| Module | Purpose | Lines |
|--------|---------|-------|
| `connectionManager.ts` | WebSocket lifecycle & reconnection | ~130 |
| `messageRouter.ts` | Incoming message dispatch | ~240 |
| `messageSender.ts` | Outgoing message helpers | ~120 |
| `trackBroadcast.ts` | Track broadcasting logic | ~220 |
| `offlineQueue.ts` | Offline message queuing | ~180 |
| `reliability.ts` | Retry/timeout/ACK handling | ~220 |
| `likeBatching.ts` | Batch like notifications | ~95 |
| `reactionSubscriptions.ts` | Reaction event subscriptions | ~55 |
| `stateHelpers.ts` | State update utilities | ~230 |
| `typeGuards.ts` | TypeScript type guards | ~280 |
| `types.ts` | Type definitions | ~120 |
| `constants.ts` | Configuration constants | ~114 |
| `index.ts` | Public exports | ~55 |

**Total:** ~2,060 lines organized into focused, testable modules (down from 1,239 lines in a single file).

### `useSidecar` - Python Process Manager

**Location:** `src/hooks/useSidecar.ts`

**Purpose:** Manages Python sidecar lifecycle
- Spawns sidecar process on app start
- Monitors health via `/health` endpoint
- Provides `baseUrl` for analysis requests
- Handles restart if sidecar crashes

**Status states:** `idle | starting | ready | error | browser`

**Key feature:** Idempotent kill protocol prevents zombie processes

### `useAnalyzer` - Audio Analysis Queue

**Location:** `src/hooks/useAnalyzer.ts`

**Purpose:** Queues and processes audio analysis requests
- Priority queue (recent tracks first)
- Throttles requests to prevent overwhelming sidecar
- Stores results in SQLite via `trackRepository`
- Merges VDJ metadata with sidecar fingerprint data

### `useVdjHistory` - History Detection

**Location:** `src/hooks/useVdjHistory.ts`

**Purpose:** Detects VDJ session boundaries for import
- Calls `read_virtualdj_history_full` Tauri command
- Identifies 30-minute gaps between tracks
- Returns detected sessions with track counts

## State Management

### Zustand Store

**Location:** `src/hooks/useLiveStore.ts`

**Purpose:** Global state for live session UI elements
- Current play metadata
- Listener count
- Poll state
- Tempo votes
- Reactions

**Pattern:** Separate from `useLiveSession` to avoid re-render storms.

```typescript
// Reading state
const { currentPlay, listenerCount } = useLiveStore();

// Updating state (only from useLiveSession)
useLiveStore.setState({ listenerCount: 42 });
```

## Testing

### Running Tests

```bash
# All tests
bun test

# Watch mode
bun run test:watch

# Coverage
bun run test:coverage
```

**Current coverage:** 443 passing tests (Vitest, +1 skipped) — logic/unit + `*.rtl.tsx` component tests.
Plus the Python sidecar: 8 `pytest` tests (`bun run test:python`; `python-src/tests/`,
deps in `requirements-dev.txt`). Coverage: `bun run test:coverage` (vitest v8). The desktop also mirrors
the cloud's canonical Spotify features locally (`spotify_track_features` table + `spotifyFeaturesService`)
to show them beside the Pika sidecar radar — see `SpotifyFeaturePanel` + `docs/architecture/music-data-model.md`.

**Live Spotify identity (the dancer wedge):** when a *matched* local track is played live, its remembered
Spotify identity is broadcast to dancers as album art + "Listen on Spotify". `TRACK_SELECT_SQL`
(`trackRepository.ts`) selects `spotify_url`/`spotify_album_art_url`/confidence/source; `useLiveSession`
threads them onto the played track; `toTrackInfo` (`virtualDjWatcher.ts`) maps them to the broadcast's
`albumArtUrl`/`spotifyUrl` **only for a trusted match** (`dj_confirmed` or confidence ≥ 0.8 — never a
low-confidence guess). Unmatched/untrusted → text-only. The panic/forceSync path broadcasts without
identity (no DB round-trip). Gate tests: `virtualDjWatcher.test.ts` (`toTrackInfo`).

**Background library pre-match (feeds the wedge):** the opt-in `SpotifyMatchStatus` header pill (single
home, cloned from `AnalyzerStatus`) drives `useSpotifyMatcher` — a throttled (~1.1s, ≤60/min/DJ),
resumable serial loop over `trackRepository.getUnmatchedLibraryTracks` that calls the cache-first cloud
`searchSpotify` and writes **only high-confidence** matches via `setTrackSpotifyMatch(source:"auto",
confidence:0.8)` (so the live gate above surfaces them), marking the rest attempted
(`markSpotifyMatchAttempted` — reuses `spotify_matched_at` as the "tried, no match" marker so the run is
resumable + terminating). Cache-hit matches carry no cover, so their art is backfilled via
`resolveSpotifyTracks` → `setTrackAlbumArt`. Errors: 401 stops, 429 backs off + retries the same track,
others skip. Cap-free (app-token search); needs only the DJ's Pika login. Tests: `useSpotifyMatcher.test.ts`,
`SpotifyMatchStatus.rtl.tsx`, `trackRepository.test.ts` (library pre-match queries).

**Verify / change a match (`SpotifyMatchManager`):** the LibraryBrowser inspector block (below
`SpotifyFeaturePanel`) shows a track's current match + confidence tier (or a `dj_confirmed` lock) and lets
the DJ **Change** (re-`searchSpotify` → pick a candidate), **paste a Spotify link**
(`parseSpotifyTrackId`→`resolveSpotifyTrack`), or **Remove** (`trackRepository.clearTrackSpotifyMatch` —
nulls the match cols but SETS `spotify_matched_at` so the auto-matcher won't re-grab it). A confirm writes
`setTrackSpotifyMatch(source:"dj_confirmed")` locally **and** best-effort promotes it to the shared cache
(`confirmSpotifyMatch` → `POST /api/playlist/confirm` → `cacheManualMatch`, which overrides any `auto` row
for every DJ). No-reload refresh via `getTrackById`→`updateTrackInList`. A per-row Title-cell dot shows
matched (faint=auto, bright=confirmed). Tests: `SpotifyMatchManager.rtl.tsx`, `trackRepository.test.ts`
(`clearTrackSpotifyMatch`), cloud `playlist.test.ts` + `db.integration.test.ts` (`/confirm`).

### Test Files

Located alongside source files:
- `*.test.ts` — logic/unit. E.g.:
  - `src/hooks/useLiveSession.test.ts` - Connection lifecycle (~3100 lines, 91KB)
  - `src/hooks/useLiveSession.dedup.test.ts` - Deduplication logic
  - `src/hooks/useSidecar.test.ts` - Sidecar management
  - `src/db/repositories/*.test.ts` - Repository tests
  - `src/services/__tests__/*.test.ts` - Service layer tests
  - `src/hooks/live/connectionManager.test.ts` - Connection state machine
- `*.rtl.tsx` — React component tests (RTL + happy-dom). Each file declares
  `// @vitest-environment happy-dom` at the top (global env stays `node` so the
  logic suites are DOM-free); jest-dom + cleanup live in `src/test/rtl.tsx`. E.g.
  `LiveControl.rtl.tsx`, `StageSelector.rtl.tsx`, `StartSessionModal.rtl.tsx`,
  `LiveHUD.rtl.tsx`, `LiveInteractions.rtl.tsx`, `QrShareLinks.rtl.tsx`,
  `useDjSettings.rtl.tsx`.

### Testing Patterns

**Mock Tauri IPC:**
```typescript
import { invoke } from "@tauri-apps/api/core";
import { vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

test("calls read_virtualdj_history", async () => {
  const mockInvoke = vi.mocked(invoke);
  mockInvoke.mockResolvedValue({ artist: "Test", title: "Track", timestamp: Date.now() });

  const track = await invoke("read_virtualdj_history");
  expect(mockInvoke).toHaveBeenCalledWith("read_virtualdj_history", undefined);
});
```

**Mock WebSocket:**
```typescript
import { vi } from "vitest";
import ReconnectingWebSocket from "reconnecting-websocket";

vi.mock("reconnecting-websocket");

test("connects to cloud", () => {
  const mockWs = new ReconnectingWebSocket("wss://test");
  // ... test assertions
});
```

## Build & Release

### Development Build

```bash
bun run --filter @pika/desktop tauri dev
```

**What happens:**
1. Vite starts React dev server (port 1420)
2. Tauri spawns Rust backend
3. Tauri spawns Python sidecar (as script, not binary)
4. Opens desktop window

### Production Build

```bash
bun run --filter @pika/desktop build
```

**What happens:**
1. **Build sidecar:** `bun run build:sidecar` creates Python binary
2. **Build frontend:** `vite build` bundles React app
3. **Build backend:** `cargo build --release` compiles Rust
4. **Bundle app:** Tauri creates platform-specific installer
   - **macOS:** `.dmg` file in `src-tauri/target/release/bundle/dmg/`
   - **Windows:** `.exe` in `src-tauri/target/release/bundle/msi/`

**Build time:** ~5-10 minutes (PyInstaller is slow)

### Code Signing (macOS)

For distribution outside App Store, you need:
1. Apple Developer ID certificate
2. Notarization via `xcrun notarytool`

See `docs/architecture/release-strategy.md` for details.

## Debugging

### Frontend Debugging

**Tauri DevTools:** Right-click → Inspect Element (enabled in dev mode)

**Console logs:**
```typescript
console.log("Frontend:", data); // Shows in DevTools
```

### Rust Debugging

**Add logging in `lib.rs`:**
```rust
println!("Rust: {:?}", data); // Shows in terminal running `tauri dev`
```

**Enable debug builds:**
- Dev mode already uses debug builds (`target/debug/`)
- Check `src-tauri/Cargo.toml` for `[profile.dev]` settings

### Python Debugging

**Add logging in sidecar:**
```python
print("Python:", data, flush=True)  # flush=True is critical!
```

**Logs appear in:**
- Terminal running `tauri dev` (STDOUT)
- Tauri console (macOS: Console.app, filter by "Pika")

**Attach debugger:**
```bash
# Find sidecar process
ps aux | grep "python.*main.py"

# Add breakpoint in audio_processing.py
import pdb; pdb.set_trace()
```

### Database Debugging

**SQLite CLI:**
```bash
# macOS
sqlite3 ~/Library/Application\ Support/com.pika.desktop/pika.db

# List tables
.tables

# Query
SELECT * FROM tracks LIMIT 10;
```

**Drizzle Studio** (NOT available for Desktop's SQLite yet)

## Common Issues

### Issue: Sidecar won't start

**Symptoms:** `useSidecar` status stuck at "starting"

**Solutions:**
1. Check Python environment:
   ```bash
   cd python-src
   source .venv/bin/activate
   python --version  # Should be 3.12+
   pip list  # Verify librosa, numpy, fastapi installed
   ```

2. Test sidecar manually:
   ```bash
   python main.py --port 8765
   # Should print "SIDECAR_READY port=8765"
   ```

3. Check Tauri logs for spawn errors

### Issue: VirtualDJ tracks not detected

**Symptoms:** "Now Playing" doesn't update when playing tracks

**Solutions:**
1. Verify VDJ history file exists:
   ```bash
   # macOS
   ls -la ~/Documents/VirtualDJ/History/history.m3u
   ```

2. Check watcher is running:
   ```typescript
   // In DevTools console
   const { status } = useLiveSession();
   console.log(status); // Should be "LIVE"
   ```

3. Check Settings → VDJ Integration is enabled

### Issue: Duplicate track detections

**Symptoms:** Same track appears twice in session history

**Debug steps:**
1. Check deduplication window constant:
   ```typescript
   // Should be 60000 (1 minute)
   console.log(TRACK_DEDUP_WINDOW_MS);
   ```

2. Verify track timestamps are within 1 minute
3. Check deduplication logic tests: `useLiveSession.dedup.test.ts`

### Issue: Database migrations fail

**Symptoms:** App crashes on startup with SQLite errors

**Solutions:**
1. Backup database:
   ```bash
   cp ~/Library/Application\ Support/com.pika.desktop/pika.db ~/pika-backup.db
   ```

2. Delete and rebuild:
   ```bash
   rm ~/Library/Application\ Support/com.pika.desktop/pika.db
   # Restart app - will create fresh DB
   ```

3. If you need data, use SQLite dump:
   ```bash
   sqlite3 ~/pika-backup.db .dump > backup.sql
   ```

### Issue: Build fails on `build:sidecar`

**Symptoms:** PyInstaller errors during build

**Solutions:**
1. Ensure Rust is installed (needed for target detection):
   ```bash
   rustc --version
   ```

2. Clean PyInstaller cache:
   ```bash
   cd python-src
   rm -rf build/ dist/ __pycache__/
   ```

3. Verify all Python dependencies:
   ```bash
   uv pip install -r requirements.txt --force-reinstall
   ```

## Package-Specific Conventions

### File Organization

```
src/
├── components/      # React components (organized by feature)
│   ├── live/       # Live session UI
│   ├── library/    # Music library browser
│   └── analytics/  # Deep Intelligence views
├── hooks/          # React hooks
│   └── live/       # Modular live session logic (v0.4.0 - 13 files)
├── services/       # Business logic (non-React)
├── db/             # Database layer
│   ├── schema.ts   # Drizzle schema
│   └── repositories/  # Data access layer
├── utils/          # Helper functions
└── lib/            # Third-party integrations
```

### Import Patterns

**Use absolute imports from shared:**
```typescript
import { TrackInfoSchema, MESSAGE_TYPES } from "@pika/shared";
```

**Use relative imports within Desktop:**
```typescript
import { trackRepository } from "../db/repositories/trackRepository";
```

### Component Patterns

**Use Tauri-specific APIs:**
```typescript
import { invoke } from "@tauri-apps/api/core";
import { readDir } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
```


**Network Requests:**
Always use `apiClient.ts` for external HTTP requests (cloud API) to bypass CORS:
```typescript
import { apiFetch } from "../services/apiClient";

// Automatically adds auth token and bypasses CORS
const response = await apiFetch(`${apiUrl}/api/endpoint`, {
  method: "POST",
  body: JSON.stringify(data)
});
```

**Check Tauri environment:**
```typescript
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
```

## Performance Considerations

### Adaptive Polling

**Pattern:** Background polling adapts based on app visibility

```typescript
// virtualDjWatcher.ts
const pollingInterval = document.hidden ? 3000 : 1000; // 3s hidden, 1s visible
```

### Virtual Scrolling

**Pattern:** Library browser uses `@tanstack/react-virtual` for 10k+ tracks

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

const virtualizer = useVirtualizer({
  count: tracks.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60, // Row height
});
```

### Memoization

**Pattern:** Expensive computations are memoized

```typescript
const sortedTracks = useMemo(() => {
  return tracks.sort((a, b) => a.artist.localeCompare(b.artist));
}, [tracks]);
```

### RAF Animations

**Pattern:** Animations use `requestAnimationFrame` with visibility checks

```typescript
// EnergyWave.tsx
useEffect(() => {
  let rafId: number;

  const animate = () => {
    if (document.hidden) return; // Skip if minimized - 0% CPU usage

    // ... animation logic
    rafId = requestAnimationFrame(animate);
  };

  rafId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(rafId);
}, []);
```

## Resources

- **Tauri v2 Docs:** https://v2.tauri.app/
- **Drizzle ORM:** https://orm.drizzle.team/
- **librosa Docs:** https://librosa.org/doc/latest/index.html
- **VirtualDJ API:** Limited docs, reverse-engineered from XML files
- **Architecture Docs:** `../../docs/architecture/`
  - `audio-analysis.md` - Deep dive on Python sidecar
  - `go-live-flow.md` - Session initialization sequence
