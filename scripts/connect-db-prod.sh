#!/bin/bash
# Pika! DB Tunnel Script
# "Teleports" the production database to your localhost:5432

# Configuration
VPS_USER="anna179"
VPS_HOST="anna179.mikrus.xyz"
VPS_SSH_PORT="10179"

echo "⚡️ Establishing Secure Tunnel to Pika! Production DB..."
echo "📊 Local Port: 5432 -> Remote (VPS Localhost): 5432"
echo "---------------------------------------------------"
echo "Instructions:"
echo "1. Keep this terminal OPEN."
echo "2. In a new terminal, run: bun run db:studio"
echo "---------------------------------------------------"

# SSH Command breakdown:
# -N: Do not execute a remote command (just forward ports)
# -L 5432:127.0.0.1:5432:  Forward local 5432 to remote's localhost:5432
# -p: Custom SSH port
ssh -N -L 5432:127.0.0.1:5432 -p $VPS_SSH_PORT $VPS_USER@$VPS_HOST
