#!/bin/bash
# Pika! Staging DB Tunnel Script
# "Teleports" the staging database (port 5433) to your localhost:5433

# Configuration
VPS_USER="anna179"
VPS_HOST="anna179.mikrus.xyz"
VPS_SSH_PORT="10179"

echo "⚡️ Establishing Secure Tunnel to Pika! STAGING DB..."
echo "📊 Local Port: 5433 -> Remote (VPS Localhost): 5433"
echo "---------------------------------------------------"
echo "Instructions:"
echo "1. Keep this terminal OPEN."
echo "2. In a new terminal, run 'bun db:studio' from 'packages/cloud'."
echo "   (Make sure your local environment has the same credentials as Staging)"
echo "---------------------------------------------------"

# Forward remote staging port (5433) to local (5433)
ssh -N -L 5433:127.0.0.1:5433 -p $VPS_SSH_PORT $VPS_USER@$VPS_HOST
