# Phase 3 Hardening: Polish & Consistency

**Goal**: Elevate the codebase from "Production Ready" to "Production Polish" by eliminating magic numbers, hardening type safety for stored data, and standardizing logging.

## User Review Required
> [!NOTE]
> This refactor moves existing "magic numbers" (timeouts, limits) into central configuration files. No functional changes to logic are intended, but values will be centralized.

## Proposed Changes

### 1. Centralized Configuration (`@pika/shared`)
We will create a single source of truth for system constants.

#### [NEW] `packages/shared/src/config.ts`
Exports three distinct configuration domains:
- `TIMEOUTS`: All `setTimeout` delays (socket timeouts, batch flushing, retry backoff).
- `LIMITS`: Rate limits, batch sizes, buffer capacities.
- `URLS`: Environment-aware URL factories (Local vs Staging vs Prod).

#### [MODIFY] `packages/shared/src/index.ts`
Export the new config module.

---

### 2. Desktop Hardening (`@pika/desktop`)

#### [MODIFY] `src/db/repositories/settingsRepository.ts`
- **Current**: Unsafe `as AppSettings` casting on `JSON.parse`.
- **Change**: Import `SettingsSchema` from shared. Use `SettingsSchema.safeParse()`.
- **Fallback**: If parsing fails (invalid schema), return `DEFAULT_SETTINGS` for that key instead of crashing or returning bad data.

#### [MODIFY] `src/hooks/useLiveSession.ts` & `src/hooks/live/*.ts`
- Replace hardcoded timeouts (`10000`, `500`) with `TIMEOUTS.SOCKET_ABORT_MS`, `TIMEOUTS.RETRY_DELAY_MS`.

#### [MODIFY] `src/hooks/useDjSettings.ts`
- Replace hardcoded API URLs with `URLS.getApiUrl(env)`.

---

### 3. Cloud Refactoring (`@pika/cloud`)

#### [NEW] `src/lib/logger.ts` (Local to cloud first, potential move to shared later)
Implement a simple structured logger:
```typescript
export const logger = {
  info: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  error: (msg: string, meta?: object) => console.error(JSON.stringify({ level: 'error', msg, ...meta })),
  // ...
};
```

#### [MODIFY] `src/handlers/*.ts`
- Replace `console.log("🚀 ...")` with `logger.info("...", { event: "..." })`.
- Replace hardcoded rate limits with `LIMITS.AUTH_RATE_LIMIT`.

---

### 4. Web Cleanup (`@pika/web`)

#### [MODIFY] `src/lib/api.ts`
- Use `URLS.getApiUrl()` to determine WebSocket/REST endpoints, ensuring consistency between Desktop and Web logic.

---

## Verification Plan

### Automated Verification
1.  **Unit Tests**: Run `bun test` across all packages.
    *   *Expectation*: All 619 tests pass without modification (refactor should be transparent).
2.  **Type Check**: Run `bun typecheck`.

### Manual Verification
1.  **Settings Resilience**:
    *   Manually corrupt a setting in `pika.db` (sqlite).
    *   Launch Desktop App.
    *   Verify app falls back to default instead of crashing.
2.  **Log Output**:
    *   Start Cloud (`bun run dev`).
    *   Connect a client.
    *   Verify logs are JSON formatted (if structured logging enabled) or at least cleaner.
