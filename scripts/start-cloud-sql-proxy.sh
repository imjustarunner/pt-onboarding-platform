#!/bin/bash
# Start Cloud SQL Proxy for local development

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONNECTION_NAME="ptonboard-dev:us-west3:ptonboard-mysql"
PORT=3307

# An installed proxy may target a different CPU (Intel versus Apple Silicon).
# Check that it can run, then fall back to the repository-local executable.
PROXY_BIN=""
for candidate in "$(command -v cloud-sql-proxy || true)" "$SCRIPT_DIR/../backend/cloud-sql-proxy"; do
    if [ -x "$candidate" ] && ("$candidate" --version >/dev/null 2>&1) 2>/dev/null; then
        PROXY_BIN="$candidate"
        break
    fi
done

if [ -z "$PROXY_BIN" ]; then
    echo "❌ No runnable Cloud SQL Proxy found for $(uname -s)/$(uname -m)." >&2
    echo "   Install the matching build: https://cloud.google.com/sql/docs/mysql/sql-proxy#install" >&2
    exit 1
fi

echo "🔌 Starting Cloud SQL Proxy..."
echo "   Executable: $PROXY_BIN"
echo "   Connection: $CONNECTION_NAME"
echo "   Port: $PORT"
echo ""
echo "⚠️  Keep this terminal open while developing!"
echo "   Press Ctrl+C to stop"
echo ""

exec "$PROXY_BIN" "$CONNECTION_NAME" --port "$PORT"
