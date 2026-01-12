# Architecture: Release & Distribution Strategy

## 1. Distribution Philosophy
Since our target users (DJs) are generally non-technical, the installation process must be seamless. We avoid asking users to run terminal commands or install dependencies manually.

## 2. Desktop Application (`@pika/desktop`)

### Building for Cross-Platform
We utilize **GitHub Actions** with a [Matrix Strategy](https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs) to build native binaries for both macOS and Windows simultaneously. This bypasses the cross-compilation limitations of PyInstaller.

#### The Build Matrix
*   **macOS (Apple Silicon):** Built on `macos-latest` (arm64). Output: `.dmg`.
*   **Windows (x64):** Built on `windows-latest`. Output: `.exe` (NSIS installer).
*   **Linux:** (Future Scope) Not currently prioritized for MVP.

### Python Sidecar Packaging
The Desktop app relies on a Python sidecar for heavy-duty audio analysis (Librosa/NumPy).

*   **Current Strategy:** `PyInstaller` with `--onefile`.
    *   **Pros:** Single binary file, cleaner structure in `src-tauri/binaries`.
    *   **Cons:** Slower startup (extracts payload to `/tmp` on launch).
*   **Mitigation:** If startup performance becomes a bottleneck (>5s), we will switch to `--onedir` mode, which bundles the Python environment as a folder.

### Code Signing & Notarization
To prevent OS security warnings ("Unknown Developer"), we must sign our builds.
*   **macOS:** Requires Apple Developer ID ($99/yr) + Notarization via `xcrun notarytool`.
*   **Windows:** Requires EV Code Signing Certificate (Expensive) or Standard Cert.
    *   *MVP Exception:* For the initial testing with select DJs, we may bypass signing and instruct them on how to "Right Click -> Open" to bypass Gatekeeper.

## 3. Web Application (`@pika/web`) & Cloud (`@pika/cloud`)

### Deployment Pipeline
*   **Host:** VPS (Ubuntu 22.04) on `mikr.us`.
*   **Proxy:** Cloudflare Tunnel (Zero Trush).
*   **Orchestration:** Docker Compose.

### CD Workflow
1.  **Push to `main`** triggers `deploy.yml`.
2.  SSH into VPS.
3.  `git pull` latest source.
4.  `docker compose up -d --build --force-recreate` to hot-swap containers.
5.  `docker image prune` to keep disk usage low.

## 4. versioning
We follow [Semantic Versioning (SemVer)](https://semver.org/).
*   **Desktop:** Tracked in `packages/desktop/package.json` and `src-tauri/tauri.conf.json`.
*   **Cloud/Web:** Tracked in their respective `package.json`.
