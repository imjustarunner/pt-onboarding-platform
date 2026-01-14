#!/bin/bash
# Helper script to start local development environment

set -e

echo "🚀 Starting Local Development Environment"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env files exist
if [ ! -f "backend/.env" ]; then
    echo "❌ backend/.env not found. Please create it first."
    exit 1
fi

if [ ! -f "frontend/.env" ]; then
    echo "❌ frontend/.env not found. Please create it first."
    exit 1
fi

# Check if Cloud SQL Proxy is installed
if ! command -v cloud-sql-proxy &> /dev/null; then
    echo "❌ cloud-sql-proxy not found. Install it with: brew install cloud-sql-proxy"
    exit 1
fi

# Get connection name from backend/.env or use default
CONNECTION_NAME="ptonboard-dev:us-west3:ptonboard-mysql"

echo -e "${GREEN}✅ Environment files found${NC}"
echo ""
echo "📋 Cloud SQL Connection: $CONNECTION_NAME"
echo ""
echo "⚠️  IMPORTANT: Update backend/.env with your Cloud SQL password!"
echo "   Edit: DB_PASSWORD=YOUR_CLOUD_SQL_PASSWORD_HERE"
echo ""

# Check if password is still placeholder
if grep -q "YOUR_CLOUD_SQL_PASSWORD_HERE" backend/.env; then
    echo -e "${YELLOW}⚠️  Warning: DB_PASSWORD is still a placeholder!${NC}"
    echo "   Please update backend/.env before starting the backend."
    echo ""
fi

echo "📝 To start development:"
echo ""
echo "1. Start Cloud SQL Proxy (in one terminal):"
echo "   cloud-sql-proxy $CONNECTION_NAME --port 3307"
echo ""
echo "2. Start Backend (in another terminal):"
echo "   cd backend && /usr/local/bin/npm run dev"
echo ""
echo "3. Start Frontend (in another terminal):"
echo "   cd frontend && /usr/local/bin/npm run dev"
echo ""
echo "4. Open browser: http://localhost:5173"
echo ""
