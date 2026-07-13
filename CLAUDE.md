# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

We're building the app described in @docs/SPEC.md. Read that file for general architectural tasks or to double-check the exact database structure, tech stack or application architecture.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

Whenever working with any third-party library or something similar, you MUST look up the official documentation to ensure that you're working with up-to-date information. Use the DocsExplorer subagent for efficient documentation lookup.

## Project Overview

**Pika!** is an intelligent companion for West Coast Swing DJs that bridges the gap between a DJ's local music library and dancers on the floor. It provides real-time "Now Playing" displays, analytics, and social interaction features.

**Version:** 0.5.0 (Production Ready)
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

**Note:** Redis/Valkey is **deliberately deferred**, not pending work. The Stage/Event
real-time layer runs on Postgres + Bun pub/sub; Redis is a documented future swap-in for
horizontal scale-out (see `docs/blueprints/architecture_decision_analysis.md`). Don't add it
without a measured signal.

### Testing

```bash
# Run all tests — fans out to each package's own runner. Do NOT use a plain root
# `bun test`: Bun's runner would sweep desktop's Vitest files (vi.mock hoisting
# doesn't exist under Bun) and report dozens of false failures.
bun run test

# Typecheck every package
bun run typecheck

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

**Test coverage:** don't trust hardcoded counts in docs — run the suites for current numbers;
`docs/TEST_AUDIT_2026_06_30.md` holds the last full audit. Suite shape:
- Desktop: Vitest — unit + `*.rtl.tsx` React-Testing-Library component tests
- Cloud: Bun unit + a real-Postgres integration suite (`test:integration`, gated `RUN_DB_TESTS`;
  skipped under plain `bun test`) — exercises the real `persist*` functions incl. the C3
  buffer-and-flush, the auth guards, the Songs-Catalog read path (Pika-consensus join, identity
  feed, `?missing=1`), the dual-CSV accretive merge, DJ profile management, the set-playlist
  sync, the dancer Journal (read/pagination/retro-enrichment, export lifecycle, like
  removal, telemetry ingest), dancer accounts (magic-link + email-OTP signup incl. the
  role hook and DJ non-demotion, client-identity claims/rotation/unlink, union read,
  adopt-first export, send-throttle invisibility), the Relationship Loop (Slice C:
  follows CRUD/idempotency/cascade, booth + gigs incl. the public payload + count gating,
  consent + one-click unsubscribe round-trip, session thanks uniqueness, and the recap
  sweep end-to-end with a fake mailer — zombie-close, claim-once, recipient assembly),
  and Musical Identity (Slice D: DJ playlist import incl. the `linkMode:"fill"`
  identity-spine guard + dual-CSV accretion at cap, Signature one-dial/floors/hide-toggle,
  booth playlists + provenance badges, snapshot-first compat, crowd-pleasers; D.1:
  per-source denominator counts w/ live-first overlap attribution, owner-only floors
  progress, oEmbed embed titles + admin backfill)
- Shared: Bun
- Web: **dual-runner** — `bun test` (pure modules) + `vitest run` (`*.rtl.tsx`); see
  [RTL harness](#rtl-component-tests-web--desktop) below
- Python sidecar: `pytest` (`bun run --filter @pika/desktop test:python`) — `clamp` + librosa
  extractors on synthetic signals. Coverage tooling: `test:coverage` per package (advisory, not CI-gating).

### Code Quality

```bash
# Format code (Biome)
bun run format

# Lint code (Biome — covers all four packages; CI gates on this)
bun run lint

# Fix linting issues
bun run check
```

**Lint policy (single root `biome.json` + a nested `packages/desktop/biome.json`):** zero
diagnostics is the bar — treat any new warning as a failure. Deliberate rule decisions:
- `useLiteralKeys` OFF — tsconfig's `noPropertyAccessFromIndexSignature` *forces* the
  `process.env["X"]` bracket style this rule punishes; TS wins.
- `noNonNullAssertion` OFF — accepted idiom under `noUncheckedIndexedAccess`.
- `noExplicitAny` OFF **in test files only** (mock plumbing); production code stays strict.
- a11y rules ON repo-wide except desktop (deferred via its nested config — a dedicated pass is
  pending; don't add new a11y violations there anyway). Desktop CSS keeps `!important`
  (WebView text-selection lockdown/re-enable requires it).

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

**Important:** Migration files in `packages/cloud/drizzle/*.sql` MUST be committed. The history was squashed to a single generated baseline (`0000_*`) in June 2026 (pre-launch, disposable data); evolve the schema with `db:generate` + `db:migrate` only — never `db:push` against a shared/prod DB.

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

**Architecture (modular since the v0.4.0 refactor of a ~3000-line monolith):**
- WebSocket handlers organized in `src/handlers/` (dj.ts, dancer.ts, poll.ts, `subscriber.ts` → `SUBSCRIBE_STAGE`, etc.)
- REST route modules in `src/routes/` (sessions, stats, dj, dj-live, client, me, push, email, img, playlist, spotify, admin, seed, stages, telemetry; Better Auth owns `/api/auth/*`)
- Stage/Event model: `events → stages → sessions`; dancers follow DJ rotation on a stage; scoped push via `stage_subscriptions` (see `docs/architecture/stage-event-model.md`)
- State-management + persistence lib modules in `src/lib/`
- Entry point `index.ts` is wiring + lifecycle only (middleware, WS message switch, route mounts, graceful shutdown)

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
**Offline:** Serwist for service worker, IndexedDB via idb-keyval.
**Current PWA State (Audit Feb 2026):**
- ✅ Infrastructure (esbuild pipeline)
- ✅ Bounded localStorage (liked-sessions capped to 30 + stale `pika_tempo_*` swept — no QuotaExceeded)
- ✅ Offline Likes (IndexedDB, ACK-gated flush — queue cleared only on server ACK; idempotent retry)
- ❌ Offline History (Memory-only, needs IndexedDB)
- ❌ Offline Voting (UI-only, needs background queue)
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
- Every package carries a colocated suite (run `bun run test` for current counts; last full
  audit: `docs/TEST_AUDIT_2026_06_30.md`)
- Test files colocated with source: `*.test.ts` / `__tests__/` (logic) and `*.rtl.tsx` (React components)
- Use Vitest (desktop) / `bun test` (cloud, web, shared) for TS/JS, pytest for Python

#### RTL component tests (web + desktop)
React component coverage uses the **`*.rtl.tsx`** suffix (happy-dom). Bun's runner only
globs `.test`/`.spec`, so it ignores `.rtl.tsx` — which is what makes the **web dual-runner**
clean: `"test": "bun test && vitest run"` (bun = pure modules, vitest = components).
- **Web** vitest config is `vitest.config.mts` — the `.mts` is required: web is a CJS (Next)
  package, so a `.ts` config gets `require()`d → `@vitejs/plugin-react` → `require(vite@7 ESM)`
  → `ERR_REQUIRE_ESM`. `.mts` forces ESM config loading.
- **Desktop** extends its one vitest config to glob `*.rtl.tsx`; global env stays `node`, each
  component file opts into DOM with a top `// @vitest-environment happy-dom` docblock.
- RTL covers rendering/wiring; logic already unit-tested (hooks/services) is **mocked**, not
  re-tested. Helpers: `src/test/rtl.tsx` (both packages).
- DB-touching code: real-Postgres coverage lives in `*.integration.test.ts`, gated by `RUN_DB_TESTS` and run in CI's integration job (the unit suites mock the DB). Logic mirrored in unit tests (e.g. `db-persistence.test.ts`) is a fast smoke check, *not* coverage of the shipped functions.
- **Run the gated integration suite ISOLATED** (`bun run test:integration`), never as `RUN_DB_TESTS=1 bun test`. Bun's `mock.module()` / vitest `vi.mock()` are **process-global and not restored between files**, so a unit file that mocks `../db` (e.g. `test/auth_security.test.ts`) leaks into the integration files (`src/__tests__/integration/`) and breaks their real-DB queries. For the same reason, mock modules only when unavoidable and prefer real in-memory state (see `test/likes-broadcast.test.ts`).
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
lib/                # State management + utilities
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

### Adding a New Database Table / Column

1. Add the table/column to `packages/[cloud|desktop]/src/db/schema.ts` (the source of truth).
2. Generate the migration: `bun run db:generate` — **commit the generated SQL.**
   - Cloud → `packages/cloud/drizzle/*.sql`
   - Desktop → `packages/desktop/src/db/migrations/*.sql` (+ `meta/`)
3. Review the generated SQL.
4. Apply it:
   - **Cloud (Postgres):** `bun run db:migrate`.
   - **Desktop (SQLite):** nothing to run — `src/db/migrator.ts` applies committed migrations at
     app start (Vite-bundled, tracked in `__drizzle_migrations`). See `packages/desktop/CLAUDE.md`
     → *Migrations*.
5. Create a repository file if needed (e.g., `sessionRepository.ts`).
6. Write tests for repository methods.

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
- **Cloud (Postgres):** For local dev: `docker compose down -v` then restart. For production:
  never use `db:push`, always use `db:migrate`. Migrations are idempotent — safe to re-run.
- **Desktop (SQLite):** the app's `migrator.ts` runs migrations at startup and fail-fasts (no
  silent swallow). If a DB is wedged in dev, delete it (`~/Library/Application Support/
  com.pika.desktop/pika.db`) — pre-launch data is disposable. Inspect applied state via the
  `__drizzle_migrations` table. Existing DBs are baseline-adopted (no data loss).

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
