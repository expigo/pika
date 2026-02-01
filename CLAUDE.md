# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

We're building the app described in @SPEC.MD. Read that file for general architectural tasks or to double-check the exact database structure, tech stack or application architecture.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

## Project Overview

**Pika!** is an intelligent companion for West Coast Swing DJs that bridges the gap between a DJ's local music library and dancers on the floor. It provides real-time "Now Playing" displays, analytics, and social interaction features.

**Version:** 0.4.0 (Production Ready)
**License:** Apache-2.0

## Monorepo Architecture

This is a **Bun Workspaces** monorepo with four packages:

| Package | Path | Stack | Purpose |
|---------|------|-------|---------|
| **Desktop** | `packages/desktop` | Tauri v2, React 19, Python Sidecar | DJ's local command center. Analyzes audio and broadcasts "Now Playing" |
| **Cloud** | `packages/cloud` | Bun, Hono, WebSocket | Real-time relay server connecting Desktop to Web |
| **Web** | `packages/web` | Next.js 16, Tailwind 4 | Mobile-first PWA for dancers |
| **Shared** | `packages/shared` | TypeScript | Shared Zod schemas and types |

### Data Flow
1. Desktop App reads track info from VirtualDJ or file system
2. Python Sidecar analyzes audio locally (BPM, Key, Energy) using librosa
3. Desktop App pushes metadata to Cloud via WebSocket (`wss://api.pika.stream`)
4. Cloud broadcasts updates to connected WebSocket clients (hosted at `https://pika.stream`)

## Essential Commands

### Development Setup

```bash
# Install dependencies (root level)
bun install

# Setup Python environment for Desktop analysis sidecar
cd packages/desktop/python-src
uv venv
uv pip install -r requirements.txt
```

### Development (Mixed Mode Strategy)

We use Docker for infrastructure (PostgreSQL) but run application code on bare metal for HMR and debugging.

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Start apps in separate terminals:

# Terminal 1: Cloud Server
bun run --filter @pika/cloud dev

# Terminal 2: Web Client
bun run --filter @pika/web dev

# Terminal 3: Desktop App (use full tauri command for argument support)
bun run --filter @pika/desktop tauri dev
```

**Note:** Redis/Valkey integration is planned (Strategic Priority S8) but not yet implemented.

### Testing

```bash
# Run all tests
bun test

# Run tests for specific package
bun run --filter @pika/cloud test
bun run --filter @pika/desktop test

# Desktop tests with coverage
cd packages/desktop && bun run test:coverage

# E2E tests (Playwright)
bun run test:e2e

# Load tests (k6)
bun run test:load
bun run test:load:big
```

**Test Coverage (as of Feb 2026):** 513 verified tests total
- Desktop: 231 tests
- Cloud: 267 tests
- Shared: 15 tests
- Web: Test infrastructure exists but no test script in package.json yet

### Code Quality

```bash
# Format code (Biome)
bun run format

# Lint code (Biome)
bun run lint

# Fix linting issues
bun run check
```

### Database Operations (Cloud)

```bash
cd packages/cloud

# Open Drizzle Studio (DB UI)
bun run db:studio

# Generate migration from schema changes
bun run db:generate

# Apply migrations
bun run db:migrate

# Push schema directly (dev only - bypasses migrations)
bun run db:push  # ⚠️ Use only for rapid prototyping
```

**Important:** Migration files in `packages/cloud/drizzle/*.sql` MUST be committed. They are idempotent (use `IF NOT EXISTS`).

If you encounter migration conflicts locally:
```bash
# Nuclear reset (safe for local dev)
docker compose down -v
docker compose up -d postgres
bun run --filter @pika/cloud dev
```

## Key Architecture Patterns

### Desktop: Split Brain + Python Sidecar

**Multi-Window Pattern:** Main Dashboard + Always-on-Top "Mini-Mode"

**Python Sidecar Architecture:**
- Bundled with `pyinstaller` as a binary
- Spawned by Tauri's sidecar protocol on `localhost` (random port)
- Exposes FastAPI endpoints: `/health`, `/analyze`, `/queue`
- NEVER talks to cloud directly - Desktop orchestrates everything
- Libraries: `librosa` (audio I/O), `essentia` (feature extraction)
- Strategy: Priority queue (recent tracks first, background archive second)

**Database:** SQLite via Drizzle ORM

**VirtualDJ Integration:**
- Watches M3U history files for track changes
- Detects session boundaries by 30-minute gaps
- Hybrid deduplication: timestamp window + initialization mask to prevent duplicate recording of tracks

### Cloud: Modular WebSocket Server

**Architecture (v0.4.0 refactor):**
- 20 WebSocket handlers organized in `src/handlers/` (dj.ts, dancer.ts, poll.ts, etc.)
- 6 REST route modules in `src/routes/` (auth, sessions, stats, dj, client, push)
- 14 lib modules in `src/lib/` for state management
- Entry point `index.ts` is ~570 lines (down from 3000)

**Key Patterns:**
- `WSContext` object passed to all handlers
- `parseMessage<T>()` for type-safe Zod validation
- `safeHandler()` wrapper for error isolation
- Event-based coordination with `waitForSession()`
- Serialized persistence queue prevents race conditions

**Database:** PostgreSQL via Drizzle ORM

**Critical Features:**
- Session management with CloudSessionID
- Poll system with auto-end timers
- Web Push notifications (VAPID)
- Rate limiting per connection
- Graceful shutdown (SIGTERM/SIGINT handlers)

### Web: Mobile-First PWA

**Framework:** Next.js 16 with App Router
**Styling:** Tailwind 4
**State:** SWR for data fetching, React Context for session state
**Offline:** Serwist for service worker, IndexedDB via idb-keyval
**Features:**
- Visibility-aware polling (pauses when backgrounded)
- Deferred localStorage via event loop yielding
- Memoized handler trees for performance
- Error boundary for live session pages
- Lazy loading for QR code (~30KB saved)

### Shared: Type-Safe Contracts

**Purpose:** Zod schemas and TypeScript types shared across all packages
**Key Exports:**
- WebSocket message schemas
- Database table schemas
- API request/response types
- Validation utilities

## Important Conventions

### Commit Style
Use **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`

Example:
```
feat(desktop): add session history import modal
fix(cloud): prevent duplicate track persistence
chore: bump version to 0.4.0
```

### Type Safety
- **Strict TypeScript** - NO `any` types
- All WebSocket messages validated with Zod schemas
- Use `parseMessage<T>()` in Cloud handlers for type-safe parsing

### Testing Philosophy
- **513 verified tests** across all packages (231 desktop, 267 cloud, 15 shared)
- Test files colocated with source: `*.test.ts` or `__tests__/` directories
- Use Vitest for TS/JS, pytest for Python
- Aim for 100% coverage of critical paths (connection lifecycle, history import)

### Security Requirements
- Password hashing with bcrypt
- Token hashing with SHA-256
- Input validation with Zod at all boundaries
- SQL injection protection via Drizzle parameterized queries
- XSS prevention (never use `dangerouslySetInnerHTML`)
- CSP enabled in Tauri desktop app
- Rate limiting on all WebSocket and REST endpoints
- CORS restrictions enforced
- PII scrubbing in Sentry (cookies, headers, IPs)

### Performance Guidelines
- Visibility-aware polling for battery optimization
- Memoize stable handler trees
- Use SWR for O(1) deduplication
- Defer heavy operations to event loop
- Lazy load non-critical UI components
- Batch database writes
- Use indexes on hot query paths

### Accessibility
- ARIA labels on interactive elements
- Skip-to-content links
- Reduced motion CSS (prefers-reduced-motion)
- Keyboard navigation support

## File Organization Patterns

### Desktop (`packages/desktop/src/`)
```
components/          # React components
  live/             # Live session UI
  library/          # Music library browser
  analytics/        # Deep Intelligence analytics
hooks/              # React hooks (useLiveSession, useSidecar, useVdjHistory)
services/           # Business logic (virtualDjWatcher, progressiveAnalysisService)
db/                 # Drizzle schema + repositories
python-src/         # Python sidecar (main.py, audio_processing.py)
```

### Cloud (`packages/cloud/src/`)
```
handlers/           # WebSocket message handlers
routes/             # REST API endpoints
lib/                # State management + utilities (14 modules)
  persistence/      # Database operations
  services/         # External services (push notifications)
db/                 # Drizzle schema
```

### Web (`packages/web/src/`)
```
app/                # Next.js App Router pages
components/         # React components
  live/             # Live session views
hooks/              # React hooks (useLiveListener)
lib/                # Utilities (api.ts, client.ts)
```

## Common Workflows

### Adding a New WebSocket Message Type

1. Define schema in `packages/shared/src/schemas.ts`
2. Add message type to `MESSAGE_TYPES` constant
3. Create handler in `packages/cloud/src/handlers/[category].ts`
4. Export handler from `packages/cloud/src/handlers/index.ts`
5. Add case to switch statement in `packages/cloud/src/index.ts`
6. Write tests in `packages/cloud/src/__tests__/`
7. Implement sender in Desktop or Web client
8. Write integration tests

### Adding a New Database Table

1. Add table schema to `packages/[cloud|desktop]/src/db/schema.ts`
2. Generate migration: `bun run db:generate`
3. Review generated SQL in `drizzle/*.sql`
4. Apply migration: `bun run db:migrate`
5. Create repository file if needed (e.g., `sessionRepository.ts`)
6. Write tests for repository methods

### Debugging VirtualDJ Integration

- Desktop watches M3U files in VirtualDJ's history directory
- File watcher code: `packages/desktop/src/services/virtualDjWatcher.ts`
- History import: `packages/desktop/src/hooks/useVdjHistory.ts`
- Deduplication logic: `packages/desktop/src/hooks/useLiveSession.dedup.test.ts`

## Documentation

Comprehensive docs in `docs/` directory:
- **[ROADMAP.md](docs/ROADMAP.md)** - Master index (start here)
- **[ops-manual.md](docs/ops-manual.md)** - Operations and deployment
- **[architecture/](docs/architecture/)** - Detailed architecture docs
  - `go-live-flow.md` - Session initialization flow
  - `cloud-modules.md` - Cloud handler structure
  - `auth-system.md` - DJ authentication
  - `security.md` - Threat model and mitigations
  - `audio-analysis.md` - Python sidecar details
  - `realtime-infrastructure.md` - WebSocket design

## Troubleshooting

### Desktop won't start Python sidecar
- Check Python environment: `cd packages/desktop/python-src && uv pip list`
- Rebuild sidecar: `bun run --filter @pika/desktop build:sidecar`
- Check sidecar logs in Desktop app console

### Cloud WebSocket connection fails
- Verify PostgreSQL is running: `docker compose ps`
- Check migrations applied: `cd packages/cloud && bun run db:migrate`
- Check environment variables (DATABASE_URL)

### Database migration errors
- For local dev: `docker compose down -v` then restart
- For production: Never use `db:push`, always use `db:migrate`
- Migrations are idempotent - safe to re-run

### Tests failing
- Run single test file: `bun test [file-path]`
- Check test isolation - tests should not share state
- Verify mock data setup in test files

## Production Deployment

Production runs on VPS with Docker Compose:
- Cloud + Web run in Docker containers
- PostgreSQL in separate container
- Cloudflare Tunnel for HTTPS
- Sentry for error monitoring
- Monitoring stack runs separately: `docker/monitoring/compose.yaml`

See `docs/ops-manual.md` for deployment procedures.
