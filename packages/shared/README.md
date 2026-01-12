# Pika! Shared Library

Common utilities, types, and schemas shared between **Desktop**, **Cloud**, and **Web**.

## Contents
*   **Zod Schemas (`schemas.ts`):** Single source of truth for validation.
    *   `TrackInfoSchema`, `WebSocketMessageSchema`, etc.
*   **Constants:** `PIKA_VERSION`, defaults.
*   **Utilities:** Shared helper functions.

## Usage
Import directly in other packages:
```typescript
import { WebSocketMessageSchema } from "@pika/shared";
```
