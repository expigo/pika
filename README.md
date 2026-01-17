# Pika! ⚡️

**The Bionic Suit for West Coast Swing DJs.**

**Version:** 0.9.5 (Deep Intelligence Update)
**Status:** Pre-Launch Polish
**License:** Apache-2.0

## 🎯 Project Vision

**Pika!** is an intelligent companion for West Coast Swing (WCS) DJs. It bridges the gap between your local music library and the dancers on the floor.

*   **For DJs:** Get "Deep Intelligence" analytics into your sets (Friction, Harmonic Flow, The Drift).
*   **For Dancers:** See what's playing in real-time on your phone, vote on tempo, and interact with the DJ.

## 📚 Documentation

We maintain comprehensive documentation in the `docs/` directory:

*   **[Roadmap & Master Index](docs/ROADMAP.md)** (Start Here)
*   **[MVP Launch Plan](docs/projects/mvp-launch.md)** (Active Project)
*   **[Deployment Guide](docs/architecture/deployment.md)**
*   **[Operations Manual](docs/ops-manual.md)**

## 🏗️ System Architecture

Pika! is a monorepo built with **Bun Workspaces**:

| Package | Path | Tech Stack | Description |
| :--- | :--- | :--- | :--- |
| **Desktop** | `packages/desktop` | Tauri v2, React 19, Python Sidecar | The DJ's local command center. Analyzes audio and broadcasts "Now Playing". |
| **Cloud** | `packages/cloud` | Bun, Hono, WebSocket | The real-time relay server. Connects Desktop to Web. |
| **Web** | `packages/web` | Next.js 15, Tailwind 4 | The mobile-first view for dancers. |
| **Shared** | `packages/shared` | TypeScript | Shared Zod schemas and types. |

### Data Flow
1.  **Desktop App** reads track info (from VirtualDJ or files).
2.  **Python Sidecar** analyzes audio locally (BPM, Key, Energy).
3.  **Desktop App** pushes metadata to **Cloud** via WebSocket (`wss://api.pika.stream`).
4.  **Cloud** broadcasts update to all connected **Web** clients (`https://pika.stream`).

## 🚀 Getting Started

### Prerequisites
*   **Bun** v1.2+
*   **Rust** (for Tauri)
*   **Python 3.12+** & **uv** (for Analysis Sidecar)
*   **Docker** (for Cloud DB/Dev)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/expigo/pika.git
cd pika

# 2. Install dependencies (Root)
bun install

# 3. Setup Python Environment (Desktop)
cd packages/desktop/python-src
uv venv
uv pip install -r requirements.txt
```

### 🌍 Development Strategy ("Mixed Mode")

We use a practical approach for local development to balance speed and parity:

*   **Infrastructure (Docker):** We run PostgreSQL and Redis in Docker to ensure environment parity with production.
*   **Application Code (Bare Metal):** We run the Desktop, Cloud, and Web apps directly on the host (using `bun`) for maximum velocity, HMR, and debugging support.

1.  **Start Infrastructure:**
    ```bash
    docker compose up -d
    ```


2.  **Start Applications (Separate Terminals):**
    ```bash
    # Terminal 1: Cloud Server
    bun run --filter @pika/cloud dev

    # Terminal 2: Web Client
    bun run --filter @pika/web dev

    # Terminal 3: Desktop App
    bun run --filter @pika/desktop dev
    ```

> 💡 **Troubleshooting:** See the [Operations Manual](docs/ops-manual.md) for detailed debugging steps, database management, and common issues.



## 🧪 Testing & Quality

*   **Format:** `bun run format` (Biome)
*   **Lint:** `bun run lint` (Biome)
*   **Test:** `bun test`
*   **E2E:** `bun run test:e2e` (Playwright)

## 🔐 Security

**Latest Audit:** January 17, 2026 | **Score:** 8.5/10

| Control | Status |
| :--- | :---: |
| Password Hashing (bcrypt) | ✅ |
| Token Hashing (SHA-256) | ✅ |
| Input Validation (Zod) | ✅ |
| SQL Injection Protection | ✅ |
| XSS Prevention | ✅ |
| CORS Restriction | ✅ |
| Rate Limiting | ✅ |

See [Security Architecture](docs/architecture/security.md) for details.

## 📊 Project Health

| Dimension | Score |
| :--- | :---: |
| Architecture | 9/10 |
| Code Quality | 8/10 |
| Documentation | 10/10 |
| Security | 8.5/10 |
| **Composite** | **8.9/10** |

*Last assessed: January 17, 2026*