#!/bin/bash
# Start Cloud SQL Proxy for local development

CONNECTION_NAME="ptonboard-dev:us-west3:ptonboard-mysql"
PORT=3307

echo "🔌 Starting Cloud SQL Proxy..."
echo "   Connection: $CONNECTION_NAME"
echo "   Port: $PORT"
echo ""
echo "⚠️  Keep this terminal open while developing!"
echo "   Press Ctrl+C to stop"
echo ""

cloud-sql-proxy "$CONNECTION_NAME" --port "$PORT"
