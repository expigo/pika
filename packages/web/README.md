# Pika! Web Client

The dancer-facing mobile application. Built with **Next.js 15**.

## Features
*   **Real-time Interaction:** Connects to Cloud via WebSocket (`useLiveListener` hook).
*   **Resilient Connectivity:** Self-healing connection with offline action queuing (Heartbeat Monitor).
*   **Mobile First:** Optimized for mobile browsers (PWA-ready).
*   **Design System:** Tailwind CSS v4 with custom Pika! theme.

## 📱 Routes
*   `/` - Landing Page (Marketing).
*   `/live` - Discovery page (shows active sessions).
*   `/live/[sessionId]` - The "Live Player" for dancers.

## 🛠️ Configuration
Environment variables in `.env`:
*   `NEXT_PUBLIC_CLOUD_WS_URL`: WebSocket endpoint.
*   `NEXT_PUBLIC_CLOUD_API_URL`: REST API endpoint.

## 🚀 Development
```bash
bun run dev
```
Open [http://localhost:3000](http://localhost:3000).
