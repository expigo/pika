# Design Document 006: Deployment Architecture

## Overview

This document explains how Pika! is deployed in development vs production, and the security considerations for each environment.

## Architecture Overview

Pika! consists of three main components:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Desktop App    │────▶│  Cloud Server   │◀────│   Web Client    │
│  (Tauri/React)  │     │  (Bun/Hono)     │     │  (Next.js)      │
│                 │     │                 │     │                 │
│  Port: N/A      │     │  Port: 3001     │     │  Port: 3000     │
│  (native app)   │     │  WS + REST API  │     │  Static/SSR     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
   VirtualDJ              PostgreSQL              User's Browser
   (history.m3u)          (cloud DB)              (phone/tablet)
```

---

## Development Environment

### Current Configuration

| Component | Host | Port | Binding |
|-----------|------|------|---------|
| Cloud Server | `0.0.0.0` | 3001 | All interfaces |
| Web Client | `0.0.0.0` | 3000 | All interfaces |
| Desktop App | N/A | N/A | Native app |

### Why All Interfaces?

In development, servers bind to `0.0.0.0` (all interfaces) to enable:
- **Mobile testing**: Test the web UI on phones/tablets on the same WiFi
- **QR code scanning**: QR codes show LAN IP for easy device access
- **Multi-device testing**: Simulate multiple dancers from different devices

### Security Considerations

**On Trusted Networks (Home/Office)**:
- ✅ Safe: Only devices on your network can connect
- ✅ No sensitive data: The app shows song metadata, not personal info
- ✅ Read-only listeners: Web clients can only view and react

**On Untrusted Networks (Public WiFi)**:
- ⚠️ Don't run dev servers on coffee shop/airport WiFi
- ⚠️ Use `dev:local` script for localhost-only mode
- ⚠️ Consider VPN if you need LAN features on public networks

---

## Production Environment

### Deployment Options

#### Option A: Managed Cloud (Recommended for MVP)

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  Desktop App    │────▶│           Cloud Hosting             │
│  (DJ's laptop)  │     │                                     │
│                 │     │  ┌─────────────┐  ┌─────────────┐  │
│                 │     │  │ Cloud API   │  │ Web Client  │  │
│                 │     │  │ (Railway)   │  │ (Vercel)    │  │
│                 │     │  │ Port: 443   │  │ Port: 443   │  │
│                 │     │  └─────────────┘  └─────────────┘  │
│                 │     │         │                          │
│                 │     │         ▼                          │
│                 │     │  ┌─────────────┐                   │
│                 │     │  │ PostgreSQL  │                   │
│                 │     │  │ (Neon)      │                   │
│                 │     │  └─────────────┘                   │
│                 │     └─────────────────────────────────────┘
│                 │                     ▲
│                 │                     │
│                 │     ┌─────────────────────────────────────┐
│                 └─────│         User's Phone/Tablet         │
│                       │         (dancer at event)           │
│                       └─────────────────────────────────────┘
```

**Pros**:
- Zero infrastructure management
- Automatic SSL/TLS
- Global CDN
- Easy deployment (git push)

**Cons**:
- Monthly costs
- Requires internet connection

---

#### Option B: VPS + Cloudflare Tunnel (Deployed on mikr.us)

**This is the current Production architecture.**

**Your VPS Specs** (mikr.us):
| Resource | Available | Pika! Needs |
|----------|-----------|-------------|
| RAM | 4GB | ~500MB typical |
| IP | **IPv6 Only** | No IPv4 needed (Tunnel handles it) |
| Ports | Non-Standard | None needed (Tunnel is outbound) |

```
┌───────────────────────────────────────────────────────────────┐
│                      mikr.us VPS (IPv6)                       │
│                                                               │
│    ┌─────────────────────────────────────────────────────┐    │
│    │               cloudflared (Daemon)                  │    │
│    │                                                     │    │
│    │   Establishes secure OUTBOUND tunnel to Cloudflare  │    │
│    │   (No incoming open ports required)                 │    │
│    └────────┬──────────────────────┬─────────────────────┘    │
│             │                      │                          │
│             ▼                      ▼                          │
│    ┌────────────────┐      ┌────────────────┐                 │
│    │   pika-cloud   │      │    pika-web    │                 │
│    │   (Docker)     │      │    (Docker)    │                 │
│    │   :3001        │      │    :3000       │                 │
│    └────────┬───────┘      └───────┬────────┘                 │
│             │                      │                          │
│             ▼                      │                          │
│    ┌────────────────┐              │                          │
│    │   PostgreSQL   │              │                          │
│    │   :5432        │              │                          │
│    └────────────────┘              │                          │
│                                    │                          │
└────────────────────────────────────┼──────────────────────────┘
                                     │
                                     │
          ┌──────────────────────────┴──────────────────────────┐
          │                    Cloudflare Edge                  │
          │             (proxies pika.stream -> Tunnel)         │
          └──────────────────────────┬──────────────────────────┘
                                     │
                                     │ HTTPS / WSS
                          ┌──────────┴──────────┐
                          │    Users / Dancers  │
                          └─────────────────────┘
```

**Pros**:
- ✅ **Bypasses Firewall/Nat**: No need to open ports 80/443.
- ✅ **IPv4 -> IPv6 Bridge**: Users on IPv4 can access your IPv6-only VPS.
- ✅ **Secure**: No public IP exposed to the internet.
- ✅ **Free SSL**: Cloudflare handles certs automatically.

**Cons**:
- ⚠️ Dependent on Cloudflare service.

---

##### VPS Directory Structure

```
/opt/pika/
├── docker-compose.prod.yml # Production services
├── .env.production         # Secrets
├── data/
│   └── postgres/           # Persisted DB data
└── logs/                   # Application logs
```

---

## Production Checklist

### Before Deploying

- [ ] Set environment variables:
  - `DATABASE_URL` for PostgreSQL
  - `PORT` for cloud server
  - `NEXT_PUBLIC_CLOUD_WS_URL` for web client

- [ ] Enable HTTPS:
  - All production traffic must use WSS/HTTPS
  - Cloudflare Tunnel handles this automatically.

- [ ] Configure Docker:
  - Ensure `docker-compose.prod.yml` uses the correct images and restart policies.
