# Architecture: CI/CD Pipeline

This document explains the Continous Integration & Deployment pipeline for Pika!.

## 1. Overview
We use **GitHub Actions** for all automation. The pipeline is designed to handle the complexity of a hybrid stack:
*   **Rust (Tauri)** for the desktop shell.
*   **Python (PyInstaller)** for the audio analysis sidecar.
*   **Node.js (Next.js)** for the web UI.

## 2. Workflows

### 🛠️ `build-desktop.yml` (PR Checks)
Runs on every Pull Request to `main` or `staging`.
*   **Matrix:** `ubuntu-latest`, `windows-latest`, `macos-14` (Apple Silicon).
*   **Goal:** Verify that the "Sidecar" compiles correctly on all 3 target OSs.
*   **Note:** Does NOT build the full Tauri app (too slow for PRs), only the Python sidecar.

### 🚀 `release-desktop.yml` (Production Release)
Runs when a tag starting with `v*` is pushed (e.g., `v0.1.8`).
*   **Matrix:** Same as build.
*   **Process:**
    1.  **Setup Sidecar:** Compiles Python -> Binary (`dist/api`).
    2.  **Move Binary:** Places it in `src-tauri/binaries/` with target-triple name (e.g., `api-aarch64-apple-darwin`).
    3.  **Build Tauri:** Bundles the React frontend + Rust shell + Python binary.
    4.  **Upload:** Signs and uploads `.dmg`, `.exe`, `.deb` to GitHub Releases.

### ✅ `ci.yml` (Code Quality)
Runs on every push.
*   **Fast Fail:** Lints (Biome) and Typechecks (TypeScript) the entire repo.
*   **Must Pass:** Required before any merge.

## 3. The "Sidecar" Integration
Pika! relies on a standard Python executable for audio analysis.
To ensure this works on user machines without requiring them to install Python:

1.  **Composite Action:** Logic is shared in `.github/actions/setup-sidecar`.
2.  **Tooling:** We use `uv` for instant dependency resolution.
3.  **PyInstaller:** Compiles the script into a standalone binary.
4.  **Tauri Configuration:** `tauri.conf.json` maps `externalBin: ["binaries/api"]`.

## 4. Caching Strategy
*   **Rust:** `swatinem/rust-cache` caches the `target/` directory and Cargo registry.
*   **Bun:** `setup-bun` caches `node_modules`.
*   **Python:** `setup-uv` caches pip dependencies.
