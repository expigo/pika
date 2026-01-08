---
description: Step-by-step deployment of Pika! to production VPS with Cloudflare Tunnel
---

# Pika! Production Deployment Workflow

// turbo-all

## Prerequisites Checklist

Before starting, confirm you have:
- [ ] SSH access to mikr.us VPS
- [ ] Your VPS IPv6 address
- [ ] Your VPS machine ID (for port calculation: 10000+ID, etc.)
- [ ] Cloudflare account (free, create at cloudflare.com if needed)
- [ ] Domain name purchased (or ready to purchase)

---

## Phase 1: VPS Setup (Day 1)

### Step 1.1: Connect to VPS
```bash
# Connect via SSH (replace with your actual IPv6 address)
ssh root@YOUR_VPS_IPV6_ADDRESS -p 10XXX
```

### Step 1.2: Update System
```bash
apt update && apt upgrade -y
```

### Step 1.3: Install Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker
docker --version  # Should show Docker version
```

### Step 1.4: Install Docker Compose
```bash
apt install docker-compose-plugin -y
docker compose version  # Should show Compose version
```

### Step 1.5: Create application directory
```bash
mkdir -p /opt/pika
cd /opt/pika
```

---

## Phase 2: Cloudflare Tunnel Setup (Day 1-2)

### Step 2.1: Install cloudflared on VPS
```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb
cloudflared --version
```

### Step 2.2: Authenticate with Cloudflare
```bash
cloudflared tunnel login
# This will output a URL - open it in your browser
# Authorize the domain you want to use
```

### Step 2.3: Create tunnel
```bash
cloudflared tunnel create pika-tunnel
# Note the tunnel ID that's output - you'll need it
```

### Step 2.4: Create tunnel config
```bash
cat > /root/.cloudflared/config.yml << 'EOF'
tunnel: pika-tunnel
credentials-file: /root/.cloudflared/TUNNEL_ID.json

ingress:
  # Main web app (dancers)
  - hostname: YOUR_DOMAIN
    service: http://localhost:3000
  
  # API + WebSocket
  - hostname: api.YOUR_DOMAIN
    service: http://localhost:3001
  
  # Catch-all (required)
  - service: http_status:404
EOF
```

### Step 2.5: Configure DNS routing
```bash
# Add DNS records for your domain
cloudflared tunnel route dns pika-tunnel YOUR_DOMAIN
cloudflared tunnel route dns pika-tunnel api.YOUR_DOMAIN
```

### Step 2.6: Install tunnel as service
```bash
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
systemctl status cloudflared  # Should show "active (running)"
```

---

## Phase 3: Application Deployment (Day 2)

### Step 3.1: Create Docker Compose file
```bash
cat > /opt/pika/docker-compose.yml << 'EOF'
version: '3.8'

services:
  cloud:
    image: oven/bun:latest
    container_name: pika-cloud
    working_dir: /app
    command: bun run src/index.ts
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - NODE_ENV=production
    volumes:
      - ./cloud:/app
    ports:
      - "127.0.0.1:3001:3001"
    restart: unless-stopped

  web:
    image: node:20-alpine
    container_name: pika-web
    working_dir: /app
    command: sh -c "npm run build && npm run start"
    environment:
      - NEXT_PUBLIC_CLOUD_WS_URL=wss://api.YOUR_DOMAIN/ws
      - NEXT_PUBLIC_CLOUD_API_URL=https://api.YOUR_DOMAIN
      - NODE_ENV=production
    volumes:
      - ./web:/app
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped
EOF
```

### Step 3.2: Create .env file
```bash
cat > /opt/pika/.env << 'EOF'
DATABASE_URL=libsql://YOUR_DB.turso.io?authToken=YOUR_TOKEN
EOF
chmod 600 /opt/pika/.env
```

### Step 3.3: Copy application code
On your LOCAL machine:
```bash
cd /path/to/pika
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'target' \
  packages/cloud/ root@YOUR_VPS_IPV6:-p10XXX:/opt/pika/cloud/
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.next' \
  packages/web/ root@YOUR_VPS_IPV6:-p10XXX:/opt/pika/web/
```

### Step 3.4: Install dependencies on VPS
```bash
cd /opt/pika/cloud && bun install
cd /opt/pika/web && npm install
```

### Step 3.5: Start services
```bash
cd /opt/pika
docker compose up -d
docker compose logs -f  # Watch logs for errors
```

---

## Phase 4: Verification (Day 2)

### Step 4.1: Check services are running
```bash
docker compose ps  # All should show "Up"
```

### Step 4.2: Test health endpoint
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok",...}
```

### Step 4.3: Test via Cloudflare tunnel
Open in browser:
- https://YOUR_DOMAIN - Should show dancer web app
- https://api.YOUR_DOMAIN/health - Should return health JSON

### Step 4.4: Test WebSocket
Open browser console on YOUR_DOMAIN:
```javascript
const ws = new WebSocket('wss://api.YOUR_DOMAIN/ws');
ws.onopen = () => console.log('Connected!');
ws.onerror = (e) => console.error('Error:', e);
```

---

## Troubleshooting

### Cloudflare tunnel not connecting
```bash
systemctl status cloudflared
journalctl -u cloudflared -f
```

### Docker containers failing
```bash
docker compose logs cloud
docker compose logs web
```

### WebSocket not working
Check Cloudflare dashboard → Network → WebSockets must be enabled (it's on by default)

---

## Rollback

If something goes wrong:
```bash
cd /opt/pika
docker compose down
# Fix the issue

---

## Phase 5: Updates & Maintenance

### Step 5.1: Deploy Code Changes
When you have made changes to the code locally:

1. **Sync files to VPS:**
   ```bash
   # From project root
   rsync -avz --exclude 'node_modules' --exclude '.git' \
     packages/cloud/ root@YOUR_VPS_IPV6:-p10XXX:/opt/pika/cloud/
   
   rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.next' \
     packages/web/ root@YOUR_VPS_IPV6:-p10XXX:/opt/pika/web/
   ```

2. **Restart Services:**
   ```bash
   # On VPS
   cd /opt/pika
   docker compose -f docker-compose.prod.yml restart cloud
   # If web app changed (next.js build needed):
   docker compose -f docker-compose.prod.yml restart web
   ```
