# Schema Versioning for Analysis Data

## Overview

Pika! uses a versioning system for track analysis data to enable seamless re-analysis when the algorithm improves.

## How It Works

### `CURRENT_ANALYSIS_VERSION` Constant

Located in: `packages/desktop/src/db/repositories/trackRepository.ts`

```typescript
// Current analysis algorithm version
// Increment this when the analysis algorithm changes significantly
export const CURRENT_ANALYSIS_VERSION = 1;
```

### Database Column

Each track has an `analysis_version` column:
- `0` or `NULL` = Never analyzed (or analyzed before versioning)
- `1` = Analyzed with version 1 algorithm
- etc.

### Workflow

When you improve the analysis algorithm:

1. **Increment the version:**
   ```typescript
   export const CURRENT_ANALYSIS_VERSION = 2;  // Was 1
   ```

2. **Get outdated tracks:**
   ```typescript
   const outdated = await trackRepository.getOutdatedTracks();
   // Returns tracks where analysisVersion < CURRENT_ANALYSIS_VERSION
   ```

3. **Re-analyze them:**
   - The UI's "Re-analyze All" button can trigger this
   - Analysis will update both data and version

## Key Functions

| Function | Purpose |
|----------|---------|
| `markTrackAnalyzed(id, data)` | Sets analysis data + current version |
| `getUnanalyzedTracks()` | Tracks never analyzed |
| `getOutdatedTracks()` | Tracks with old analysis version |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-01-16 | Initial versioning implementation |
