# Pika! Project Rules & Context (The Constitution)

## 1. Core Tech Stack
- **Monorepo Manager:** Bun workspaces.
- **Cloud Backend:** Bun 1.2+ + Hono (WebSocket/RPC).
- **Desktop App:** Tauri 2.9 (Rust) + React 19 + TypeScript.
- **Analysis Engine:** Python 3.12 + FastAPI.
  - **Libraries:** `librosa` (Audio IO), `essentia` (Feature Extraction).
  - **Packaging:** `pyinstaller` (bundled as a sidecar binary).
  - **Strategy:** Priority Queue (Recent tracks first, Background archive second).
- **Shared:** Hono RPC for type-safe API calls between Desktop and Cloud.
- **Formatting:** Biome (No ESLint/Prettier).

## 2. Architecture Constraints
- **Split Brain Architecture:**
  - `packages/desktop`: Runs the Tauri App (UI + Rust Core).
    - **UI Pattern:** Multi-Window (Main Dashboard + Always-on-Top "Mini-Mode").
  - `packages/cloud`: Runs the Hono WebSocket Server (Cloud VPS).
  - `packages/shared`: Shared TypeScript types (RPC definitions, Database Schemas).
  - `packages/analysis`: Python source code for the sidecar.
- **Sidecar Logic (Desktop):**
  - The Python binary is spawned by Tauri's "sidecar" protocol.
  - It listens on `localhost` (port determined at runtime) for analysis requests.
  - Exposes `/health`, `/analyze`, and `/queue` endpoints.
  - It NEVER talks to the cloud directly.
- **Database:**
  - Desktop: SQLite (via Drizzle ORM).
  - Cloud: PostgreSQL (via Drizzle ORM).

## 3. Development Workflow
- **Commit Style:** Conventional Commits (feat, fix, chore).
- **Type Safety:** Strict TypeScript. No `any`.
- **Testing:** `bun test` for JS/TS, `pytest` for Python.