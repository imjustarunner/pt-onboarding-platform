#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org then run this file again."
  echo
  read -r -p "Press Return to close…"
  exit 1
fi
exec node server.mjs
