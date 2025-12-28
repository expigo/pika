# **Pika\! ⚡️**

**The Bionic Suit for West Coast Swing DJs.**

Version: 0.0.1 (MVP)  
Status: Active Development  
License: Apache-2.0

## **1\. Project Vision**

**Pika\!** is a local-first, intelligent companion application for West Coast Swing (WCS) DJs. It bridges the gap between a DJ's offline music library and the dancers on the floor.

### **The Core Problem**

* **For DJs:** "Flying blind." DJs rely on memory to guess if two songs share the same energy or mood. Transition planning is intuition-based rather than data-driven.  
* **For Dancers:** "Disconnection." Dancers love the music but often don't know what is playing or who the DJ is.

### **The Solution**

* **Desktop App (The Brain):** Gives DJs "X-Ray Vision" into their library. It analyzes local MP3s for **Energy**, **BPM**, **Danceability**, and **Mood**, visualizing the "flow" of a set before it happens.  
* **Cloud Link (The Voice):** A real-time bridge that broadcasts the "Now Playing" track to a public web page, allowing dancers to see track info and history instantly via QR code.

## **2\. System Architecture ("The Split Brain")**

Pika\! operates as two distinct brains connected by a secure bridge.

### **🧠 A. Desktop Brain (Local Intelligence)**

* **Stack:** Tauri 2.9 (Rust) \+ React 19 \+ Python 3.13 Sidecar.  
* **Role:** The DJ's offline command center.  
* **Data Flow:**  
  1. **React UI** requests analysis for a track.  
  2. **Tauri (Rust)** relays the request to the **Python Sidecar** via HTTP (localhost).  
  3. **Python** processes audio (librosa/essentia) and returns JSON metadata.  
  4. **Tauri** saves the result to **SQLite** (local DB).

### **☁️ B. Cloud Brain (The Relay)**

* **Stack:** Bun 1.2 \+ Hono \+ Postgres.  
* **Role:** The public broadcasting system.  
* **Data Flow:**  
  1. **Desktop App** detects a new track playing in VirtualDJ.  
  2. **Desktop App** pushes a signed payload to **Cloud** via **WebSocket**.  
  3. **Cloud** broadcasts the update to all connected Web Clients (Dancers).

### **🔄 C. The Bridge (Shared Types)**

* We use **Hono RPC** to share TypeScript definitions between Desktop and Cloud.  
* **Benefit:** If we change the API on the Cloud, the Desktop code will throw a type error *before* we even run it.

## **3\. Technology Stack (2025 Edition)**

| Component | Technology | Version | Purpose |
| :---- | :---- | :---- | :---- |
| **Monorepo** | **Bun Workspaces** | 1.2+ | High-speed package management. |
| **Language** | **TypeScript** | 5.7+ | Strict typing across the entire stack. |
| **Desktop Core** | **Tauri** | 2.9 | Native OS interactions & window management. |
| **Desktop UI** | **React** | 19.0 | UI components (React Compiler enabled). |
| **Analysis** | **Python** | **3.13** | Audio signal processing (Sidecar). |
| **Cloud API** | **Hono** | 4.x | Lightweight Edge-ready web server. |
| **Databases** | **SQLite / Postgres** | \- | Local / Cloud storage (managed by **Drizzle**). |
| **Formatting** | **Biome** | 1.9+ | Linting & Formatting. |

## **4\. Key MVP Features (Detailed)**

### **🎵 A. Intelligent Library Management**

* **VirtualDJ Sync:** Automatically watches the VirtualDJ Database (database.xml) and History (history.m3u).  
* **Incremental Analysis:** Only analyzes new files. Hashes files to prevent re-analyzing duplicates.  
* **Metadata Enrichment:** Extracts ID3 tags but overlays them with computed metrics.

### **🔬 B. The Audio Analysis Engine (Python Sidecar)**

Using librosa and essentia, we extract:

1. **BPM & Beat Grid:** Precise tempo detection tailored for WCS ranges (80-130 BPM).  
2. **Energy Profile (RMS):** not just a single number, but an "Energy Contour" (array of floats) to visualize the song's build-ups and drops.  
3. **Danceability:** Rhythm regularity score (0.0 \- 1.0).  
4. **Key Detection:** Musical key for harmonic mixing (Camelot notation).

### **📈 C. The "Set Architect" (UI)**

* **Drag-and-Drop Canvas:** A linear timeline where DJs can arrange tracks.  
* **The "Energy Wave":** A continuous line graph visualizing the energy flow of the entire playlist.  
  * *Goal:* Avoid "Energy Cliffs" (sudden drops that kill the floor).  
* **Transition Alerts:** Visual warning icons if:  
  * BPM gap \> 5%.  
  * Harmonic clash (Key is incompatible).

### **📡 D. Live Broadcasting ("The Voice")**

* **Real-Time Trigger:** Detects when a new line is written to VirtualDJ's history.m3u.  
* **Instant Push:** Sends CurrentTrack payload to Bun Cloud via WebSocket.  
* **Dancer View (Web):**  
  * Mobile-first responsive design.  
  * "Now Playing" with Album Art.  
  * "History" list of the last 10 tracks.  
  * "Like" button for dancers to signal favorite tracks (Stored in Cloud DB).

## **5\. Project Structure (Monorepo)**

pika/  
├── package.json          \# Bun Workspaces config  
├── biome.json            \# Linter rules  
├── packages/  
│   ├── desktop/          \# 🖥️ Tauri App  
│   │   ├── src-tauri/    \# Rust Core & Sidecar Config  
│   │   ├── src/          \# React UI Code  
│   │   └── python-src/   \# 🐍 Python Analysis Engine  
│   ├── cloud/            \# ☁️ Hono WebSocket Server  
│   │   ├── src/          \# API & WebSocket logic  
│   │   └── drizzle/      \# Postgres schemas  
│   └── shared/           \# 🔗 Shared TypeScript Types  
│       └── src/          \# RPC Types & Zod Schemas  
└── README.md             \# You are here

## **6\. Getting Started**

### **Prerequisites**

1. **Bun:** curl \-fsSL https://bun.sh/install | bash  
2. **Rust:** curl \--proto '=https' \--tlsv1.2 \-sSf https://sh.rustup.rs | sh  
3. **Python 3.13:** Install via pyenv or system package manager.  
4. **UV (Python Tool):** curl \-LsSf https://astral.sh/uv/install.sh | sh

### **Installation**

\# 1\. Clone the repo  
git clone \[https://github.com/expigo/pika.git\](https://github.com/expigo/pika.git)  
cd pika

\# 2\. Install Node/Bun dependencies (Root)  
bun install

\# 3\. Setup Python Environment (Desktop)  
cd packages/desktop/python-src  
uv venv  
uv pip install \-r requirements.txt

### **Development Commands**

Run these in separate terminals:

\# Terminal 1: Start the Cloud Server (Mock Mode)  
bun run \--filter cloud dev

\# Terminal 2: Start the Desktop App (Tauri \+ React \+ Python)  
bun run \--filter desktop tauri dev

## **7\. Development Workflow (Antigravity Guide)**

We use an AI-assisted workflow. Follow these steps when asking the Agent to build features.

1. **Reference the Constitution:** Ensure CONTEXT.md is active.  
2. **Plan First:** Ask the Agent to "Plan the feature" before writing code.  
3. **Strict Boundaries:**  
   * If working on **UI**, tell the Agent: *"Focus on packages/desktop/src."*  
   * If working on **Audio**, tell the Agent: *"Focus on packages/desktop/python-src."*  
   * If working on **API**, tell the Agent: *"Focus on packages/cloud."*

### **Key Commands for the Agent**

* **Test:** bun test  
* **Format:** bunx biome check \--apply .  
* **Typecheck:** bun x tsc \--noEmit

## **8\. Contribution Guidelines**

* **Commits:** Use Conventional Commits (e.g., feat: add energy visualizer, fix: websocket reconnection).  
* **Code Style:** Do not configure ESLint or Prettier. Use **Biome** defaults.  
* **Dependency Management:** Always use bun add or bun add \-d. Never use npm or yarn.