# Phase 3 Audit: Polish & Hardening
**Date:** 2026-01-24
**Status:** Ready for Execution
**Composite Priority:** Medium (Polish)

This document outlines the findings for the Phase 3 "Polish" Sprint, targeting configuration management, type safety, and code consistency.

---

## 3.1 Configuration & Hardcoding

### 🚨 Findings

#### Hardcoded Timeouts
Many stability-critical timeouts are hardcoded as "magic numbers" scattered across the codebase:
- `useLiveSession.ts`: `10000` (Socket abort)
- `offlineQueue.ts`: `500` (Retry delay)
- `useAnalyzer.ts`: `delay` (passed as arg, but likely hardcoded at source)
- `reliability.ts`: `ackTimeoutMs` (configurable but often default)
- `cloud/index.ts`: `500` (Graceful shutdown)

#### Rate Limit Fragmentation
- `auth.ts`: Uses `hono-rate-limiter`
- `handlers/dj.ts`: Custom logic (e.g. `lastBroadcastTime`)
- `handlers/dancer.ts`: Custom logic (e.g. `likesSent`)
- **Windows**: Inconsistent (60s vs 15m vs 300s).

#### Hardcoded URLs
URLs are hardcoded in at least 5 locations:
- `desktop/src/hooks/useDjSettings.ts`
- `desktop/src/db/repositories/settingsRepository.ts` (`DEFAULT_SETTINGS`)
- `desktop/src/config.ts`
- `web/src/lib/api.ts`
- `cloud/src/index.ts` (CORS origins)

### ✅ Recommendation
Create specialized config modules:
1. `packages/shared/src/config/timeouts.ts`: Central registry of all delays.
2. `packages/shared/src/config/limits.ts`: Central registry of rate limits.
3. `packages/shared/src/config/urls.ts`: Environment-aware URL factories.

---

## 3.2 Type Safety

### 🚨 Findings

#### Unsafe JSON Casting (`settingsRepository.ts`)
Lines 70 & 108 use `as AppSettings[K]`.
- **Risk**: If the stored JSON shape changes (e.g. `bpmThresholds` gets a new field, or a field is renamed), the app will crash at runtime when accessing properties.
- **Fix**: Use Zod schemas to validate the parsed JSON before returning. Fallback to `DEFAULT_SETTINGS` on schema mismatch.

#### Timestamp Validation
Timestamps are currently `number` or `string` in many places without structural validation.
- **Fix**: Use `z.string().datetime()` in shared schemas to ensure ISO-8601 compliance where strings are used.

#### DB Row Mappings
Drizzle provides basic types, but raw SQL queries (used in `getTrackPlayHistory` and tests) return `any` or loose types.
- **Fix**: Apply Zod schemas to raw SQL results.

---

## 3.3 Cleanup & Consistency

### 🚨 Findings

#### Zustand Access Patterns
- Mixed usage of `useStore(state => state.x)` vs `useStore.getState().x`.
- **Goal**: Use `getState()` strictly for non-reactive logic (event handlers, effects) and `useStore()` for render logic.

#### Logging
- Console logs contain emojis (`🧪`, `🚀`) which clutter production logs (grep `console.log`).
- **Fix**: Introduce `packages/shared/src/logger.ts` with log levels and JSON formatting for production.

---

## 📋 Implementation Plan (Refined)

### Priority 1: Configuration Extraction (High Value / Low Effort)
1. **Timeouts**: Extract to `TIMEOUTS` constant.
2. **URLs**: Extract to `getApiUrl(env)` helper.
3. **Limits**: Extract to `RATE_LIMITS` constant.

### Priority 2: Type Safety (High Value / Medium Effort)
1. **Settings**: Add `SettingsSchema` in `shared`. Use `.safeParse()` in repository.
2. **Dates**: Audit schema ISO strings.

### Priority 3: Logging (Medium Value / Low Effort)
1. **Logger**: Create simple logger utility.
2. **Replace**: Bulk replace `console.log` with `logger.info`.

### Priority 4: Cleanup (Low Value / Low Effort)
1. **Zustand**: Audit hook patterns.

## 📊 Scorecard

| Category | Complexity | Value | Priority | Status |
|----------|------------|-------|----------|--------|
| Config Extraction | 🟢 Low | 🔴 High | P1 | Ready |
| Type Safety | 🟡 Med | 🔴 High | P2 | Ready |
| Logging | 🟢 Low | 🟡 Med | P3 | Ready |
| Cleanup | 🟢 Low | 🔵 Low | P4 | Ready |
