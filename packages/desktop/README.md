# Pika! Desktop App (Tauri)

The command center for the DJ. Built with Tauri v2 (Rust) and React 19.

## features
*   **VirtualDJ Integration:** Watches `history.m3u` for real-time track detection.
*   **Audio Analysis:** Bundles a Python sidecar to analyze tracks for BPM, Key, and Energy.
*   **Broadcaster:** Sends "Now Playing" updates to the Cloud API.
*   **Performance Mode:** Full-screen high-contrast overlay for live gigs.
*   **Robustness & Data Integrity:**
    *   **Mandatory API Limits**: Prevents OOM crashes by forcing explicit memory sizing for library loads.
    *   **Adaptive Background Polling**: Intelligently scales polling frequency (1s/3s) based on app visibility to balance battery life and data integrity.
    *   **Reliability Buffer**: Survives 30+ minute network outages with a 1,000-message persistent retry buffer.

## 🐍 Python Sidecar
The analysis engine lives in `python-src/`. It is a FastAPI app that runs locally as a sidecar process managed by Tauri.

**Setup:**
```bash
cd python-src
uv venv
uv pip install -r requirements.txt
```

**Development:**
When running `bun tauri dev`, the sidecar is **not** automatically compiled to a binary. Instead, Tauri uses the python script directly (configured in `tauri.conf.json`).

## 🛠️ Build
To build the final `.dmg`:

```bash
bun run build
```
This process:
1.  Compiles the Python sidecar into a standalone binary using PyInstaller.
2.  Bundles the React frontend.
3.  Compiles the Rust backend.
4.  Produces a `.dmg` in `src-tauri/target/release/bundle/dmg/`.
