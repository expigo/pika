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
│  Port: N/A      │     │  Port: 3001     │     │  Port: 3002     │
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
| Web Client | `0.0.0.0` | 3002 | All interfaces |
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

### Alternative Scripts

```bash
# Default: LAN-accessible (for testing on phones)
bun run dev

# Localhost-only (for untrusted networks)
bun run dev:local
```

---

## Production Environment

### Deployment Options

#### Option A: Managed Cloud (Recommended for MVP)

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  Desktop App    │────▶│           Cloud Hosting             │
│  (DJ's laptop)  │     │                                     │
│                 │     │  ┌─────────────┐  ┌─────────────┐  │
└─────────────────┘     │  │ Cloud API   │  │ Web Client  │  │
                        │  │ (Railway/   │  │ (Vercel/    │  │
                        │  │  Fly.io)    │  │  Netlify)   │  │
                        │  │ Port: 443   │  │ Port: 443   │  │
                        │  └─────────────┘  └─────────────┘  │
                        │         │                          │
                        │         ▼                          │
                        │  ┌─────────────┐                   │
                        │  │ PostgreSQL  │                   │
                        │  │ (Neon/      │                   │
                        │  │  Supabase)  │                   │
                        │  └─────────────┘                   │
                        └─────────────────────────────────────┘
                                        ▲
                                        │
                        ┌─────────────────────────────────────┐
                        │         User's Phone/Tablet         │
                        │         (dancer at event)           │
                        └─────────────────────────────────────┘
```

**Pros**:
- Zero infrastructure management
- Automatic SSL/TLS
- Global CDN
- Easy deployment (git push)

**Cons**:
- Monthly costs
- Vendor lock-in
- Requires internet connection

**Recommended Providers**:
| Component | Provider | Why |
|-----------|----------|-----|
| Web Client | Vercel | Free tier, native Next.js support |
| Cloud API | Railway or Fly.io | WebSocket support, easy scaling |
| Database | Neon or Supabase | Serverless PostgreSQL |

---

#### Option B: Self-Hosted (For Power Users / Events)

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  Desktop App    │────▶│        DJ's Laptop / Mini-PC        │
│  (DJ's laptop)  │     │                                     │
│                 │     │  ┌─────────────┐  ┌─────────────┐  │
└─────────────────┘     │  │ Cloud API   │  │ Web Client  │  │
                        │  │ localhost   │  │ localhost   │  │
                        │  │ :3001       │  │ :3002       │  │
                        │  └─────────────┘  └─────────────┘  │
                        │         │                          │
                        │         ▼                          │
                        │  ┌─────────────┐                   │
                        │  │ SQLite      │                   │
                        │  │ (local)     │                   │
                        │  └─────────────┘                   │
                        └─────────────────────────────────────┘
                                        ▲
                                        │ (LAN only)
                        ┌─────────────────────────────────────┐
                        │   Dancers on Event WiFi (LAN)       │
                        └─────────────────────────────────────┘
```

**Pros**:
- Works offline (no internet needed)
- Full control
- No monthly costs
- Lower latency on LAN

**Cons**:
- Requires local setup
- No global access (LAN only)
- DJ must run all services

**Use Case**: Festival/event with dedicated WiFi network

---

#### Option C: VPS Deployment (mikr.us or similar)

**Best for**: Production use with full control and low monthly cost.

**Your VPS Specs** (mikr.us example):
| Resource | Available | Pika! Needs |
|----------|-----------|-------------|
| RAM | 4GB | ~500MB typical |
| Storage | 150GB | <5GB initially |
| CPU | Shared | Low usage |

```
┌───────────────────────────────────────────────────────────────┐
│                      mikr.us VPS (4GB)                        │
│                                                               │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐ │
│  │   Caddy     │  │              Docker Compose             │ │
│  │  (HTTPS)    │  │                                         │ │
│  │  :443/:80   │  │  ┌───────────┐  ┌───────────────────┐  │ │
│  └──────┬──────┘  │  │pika-cloud │  │    pika-web       │  │ │
│         │         │  │  :3001    │  │    :3002          │  │ │
│         │         │  └─────┬─────┘  └───────────────────┘  │ │
│         │         │        │                               │ │
│         │         │        ▼                               │ │
│         │         │  ┌───────────┐                         │ │
│         │         │  │PostgreSQL │                         │ │
│         │         │  │  :5432    │                         │ │
│         │         │  └───────────┘                         │ │
│         │         └─────────────────────────────────────────┘ │
│         │                                                     │
│         ├──────────▶ api.your-domain.com → pika-cloud:3001   │
│         └──────────▶ app.your-domain.com → pika-web:3002     │
└───────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS/WSS (global internet)
          ┌───────────────────┴───────────────────┐
          │                                       │
    ┌─────┴─────┐                           ┌─────┴─────┐
    │  Desktop  │                           │  Dancers  │
    │  (DJ)     │                           │  (global) │
    └───────────┘                           └───────────┘
```

**Pros**:
- ✅ Full control over infrastructure
- ✅ Low cost (~50 PLN/month for mikr.us)
- ✅ Works globally (internet access)
- ✅ Low latency in Poland/EU
- ✅ No vendor lock-in

**Cons**:
- ⚠️ Requires maintenance (updates, backups)
- ⚠️ Manual SSL setup (Caddy makes this easy)
- ⚠️ Single point of failure
- ⚠️ No auto-scaling (but 4GB is plenty)

---

##### VPS Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Reverse Proxy | Caddy | Automatic SSL/HTTPS via Let's Encrypt |
| Containers | Docker Compose | Easy multi-service deployment |
| Process Manager | Docker | Auto-restart, logging |
| Database | PostgreSQL (container) | Consistent with dev |

---

##### VPS Directory Structure

```
/opt/pika/
├── docker-compose.yml      # All services
├── Caddyfile               # Reverse proxy config
├── .env.production         # Environment variables
├── data/
│   └── postgres/           # Database files
└── logs/                   # Application logs
```

---

##### Sample Configuration Files

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: pika
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: pika
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pika"]
      interval: 5s
      timeout: 5s
      retries: 5

  cloud:
    build:
      context: ./packages/cloud
      dockerfile: Dockerfile
    restart: always
    environment:
      DATABASE_URL: postgres://pika:${POSTGRES_PASSWORD}@postgres:5432/pika
      PORT: 3001
      HOST: 0.0.0.0
    depends_on:
      postgres:
        condition: service_healthy
    expose:
      - "3001"

  web:
    build:
      context: ./packages/web
      dockerfile: Dockerfile
    restart: always
    environment:
      NEXT_PUBLIC_CLOUD_WS_URL: wss://api.${DOMAIN}/ws
      NEXT_PUBLIC_CLOUD_API_URL: https://api.${DOMAIN}
    expose:
      - "3002"

networks:
  default:
    name: pika-network
```

**Caddyfile**:
```caddyfile
# Web client (dancers access this)
app.{$DOMAIN} {
    reverse_proxy web:3002
}

# API + WebSocket (desktop app connects here)
api.{$DOMAIN} {
    reverse_proxy cloud:3001
}
```

**.env.production**:
```env
DOMAIN=your-domain.com
POSTGRES_PASSWORD=your-secure-password-here
```

---

##### VPS Deployment Steps

1. **Prepare VPS**:
   ```bash
   # SSH into your VPS
   ssh root@your-vps-ip
   
   # Install Docker
   curl -fsSL https://get.docker.com | sh
   
   # Install Docker Compose
   apt install docker-compose-plugin
   
   # Install Caddy
   apt install -y caddy
   ```

2. **Clone and Configure**:
   ```bash
   # Clone repo
   cd /opt
   git clone https://github.com/your-user/pika.git
   cd pika
   
   # Create production env
   cp .env.example .env.production
   nano .env.production  # Edit with your values
   ```

3. **Create Dockerfiles** (if not exists):
   ```bash
   # packages/cloud/Dockerfile
   FROM oven/bun:1
   WORKDIR /app
   COPY package.json bun.lock ./
   RUN bun install --frozen-lockfile
   COPY . .
   CMD ["bun", "run", "start"]
   
   # packages/web/Dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package.json bun.lock ./
   RUN npm install
   COPY . .
   RUN npm run build
   
   FROM node:20-alpine
   WORKDIR /app
   COPY --from=builder /app/.next ./.next
   COPY --from=builder /app/node_modules ./node_modules
   COPY --from=builder /app/package.json ./
   CMD ["npm", "start"]
   ```

4. **Configure Caddy**:
   ```bash
   # Edit Caddyfile
   nano /etc/caddy/Caddyfile
   
   # Paste the Caddyfile content above
   # Replace {$DOMAIN} with your actual domain
   
   # Reload Caddy
   systemctl reload caddy
   ```

5. **Deploy**:
   ```bash
   cd /opt/pika
   docker compose --env-file .env.production up -d
   
   # Check logs
   docker compose logs -f
   ```

6. **DNS Setup** (at your domain registrar):
   ```
   A    app     → your-vps-ip
   A    api     → your-vps-ip
   ```

7. **Verify**:
   - https://app.your-domain.com → Web client
   - wss://api.your-domain.com/ws → WebSocket

---

##### VPS Maintenance

**Updates**:
```bash
cd /opt/pika
git pull
docker compose build
docker compose up -d
```

**Backups**:
```bash
# Backup database
docker compose exec postgres pg_dump -U pika pika > backup.sql

# Restore
docker compose exec -i postgres psql -U pika pika < backup.sql
```

**Logs**:
```bash
docker compose logs -f cloud
docker compose logs -f web
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
  - Use reverse proxy (Caddy/Nginx) or platform SSL

- [ ] Configure CORS:
  - Restrict origins to your domains only

- [ ] Add rate limiting:
  - Prevent abuse of like/tempo endpoints

- [ ] Monitor and log:
  - Set up error tracking (Sentry)
  - Log WebSocket connections

### Security Hardening

| Area | Development | Production |
|------|-------------|------------|
| Host binding | `0.0.0.0` | Behind reverse proxy |
| Protocol | HTTP/WS | HTTPS/WSS only |
| CORS | `*` (all) | Specific domains |
| Rate limiting | None | 10 req/min per IP |
| Database | Local SQLite | Managed PostgreSQL |
| Secrets | `.env` file | Environment variables |

---

## Environment Variables

### Cloud Server (`packages/cloud`)

```env
# Production
DATABASE_URL=postgres://user:pass@host:5432/pika
PORT=3001
HOST=127.0.0.1  # Behind reverse proxy, localhost only

# Development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/pika
PORT=3001
HOST=0.0.0.0  # Allow LAN access
```

### Web Client (`packages/web`)

```env
# Production
NEXT_PUBLIC_CLOUD_WS_URL=wss://api.pika.app/ws
NEXT_PUBLIC_CLOUD_API_URL=https://api.pika.app

# Development
NEXT_PUBLIC_CLOUD_WS_URL=ws://localhost:3001/ws
NEXT_PUBLIC_CLOUD_API_URL=http://localhost:3001
```

### Desktop App (`packages/desktop`)

```env
# Production (bundled app)
VITE_CLOUD_WS_URL=wss://api.pika.app/ws
VITE_WEB_URL=https://app.pika.app

# Development
VITE_CLOUD_WS_URL=ws://localhost:3001/ws
VITE_WEB_URL=http://localhost:3002
```

---

## Migration Path

### Phase 1: Local Development (Current)
- All components on localhost
- LAN access for mobile testing
- SQLite for desktop, PostgreSQL for cloud

### Phase 2: Hybrid (Next)
- Deploy cloud + web to managed hosting
- Desktop app connects to production cloud
- DJs can use app anywhere with internet

### Phase 3: Full Production
- Custom domain (app.pika.app)
- DJ accounts and authentication
- Analytics and monitoring
- Mobile apps (future)

---


## Document Changelog

| Date | Changes |
|------|---------|
| 2026-01-05 | Initial document created |
| 2026-01-05 | Added LAN binding configuration |
| 2026-01-05 | Added production deployment options |
| 2026-01-05 | Added Option C: VPS deployment with mikr.us |

