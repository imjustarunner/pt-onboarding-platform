import os

import uvicorn
from fastapi import FastAPI
from google.adk.cli.fast_api import get_fast_api_app

# Cloud Run entrypoint for serving ADK agents via a stable HTTP API.
#
# This container serves agents found under /app/agents (mounted via Dockerfile).
# It exposes the ADK API server endpoints (e.g. /list-apps, /run, /run_sse).

AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))

# Store sessions in a local sqlite DB (ephemeral on Cloud Run, fine for testing).
# NOTE: Requires aiosqlite (async driver).
SESSION_SERVICE_URI = "sqlite+aiosqlite:///./sessions.db"

# Allow the frontend/backend to call the agent in dev/test.
ALLOWED_ORIGINS = ["*"]

# We don't need the ADK dev UI for backend integration testing.
SERVE_WEB_INTERFACE = False

app: FastAPI = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_service_uri=SESSION_SERVICE_URI,
    allow_origins=ALLOWED_ORIGINS,
    web=SERVE_WEB_INTERFACE,
)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))

