---
description: Step-by-step guide to setting up the Staging Environment
---

# Staging Environment Setup Guide

// turbo-all

This guide explains how to set up the **Staging Environment** on your VPS. This runs parallel to Production but uses different ports and databases.

## 1. Preparation (Local)

1.  **Create Staging Branch**:
    ```bash
    git checkout -b staging
    git push -u origin staging
    ```

## 2. Server Setup (VPS)

1.  **Create Staging Directory**:
    ```bash
    ssh root@YOUR_VPS_IPV6 -p 10XXX
    mkdir -p /opt/pika/pika-staging
    cd /opt/pika/pika-staging
    
    # Clone the repo (switch USER/REPO to yours)
    git clone -b staging https://github.com/YOUR_GITHUB_USER/pika.git .
    ```

2.  **Verify Configuration**:
    Check that `docker-compose.staging.yml` exists in the folder.

## 3. Cloudflare Tunnel Update

You need to route `staging.pika.stream` to your new ports.

1.  **Edit Tunnel Config** (on VPS):
    ```bash
    nano ~/.cloudflared/config.yml
    ```

2.  **Add Staging Ingress Rules** (Add these BEFORE the catch-all 404):
    ```yaml
      # --- STAGING ---
      - hostname: staging.pika.stream
        service: http://localhost:4000
    
      - hostname: staging-api.pika.stream
        service: http://localhost:4001
    
      # --- PRODUCTION ---
      - hostname: pika.stream
        service: http://localhost:3000
      ...
    ```

3.  **Restart Tunnel**:
    ```bash
    systemctl restart cloudflared
    ```

4.  **Add DNS Records** (Run on VPS or in Cloudflare Dashboard):
    ```bash
    cloudflared tunnel route dns pika-tunnel staging.pika.stream
    cloudflared tunnel route dns pika-tunnel staging-api.pika.stream
    ```

## 4. First Deployment

1.  **Push a change to `staging` branch**:
    ```bash
    # local
    echo "test" >> test.txt
    git add .
    git commit -m "trigger deploy"
    git push origin staging
    ```

2.  **Watch GitHub Actions**:
    Go to Actions tab -> "Deploy to Staging".

3.  **Verify**:
    Visit `https://staging.pika.stream`
