"""
ADK agent package entrypoint.

The ADK API server discovers agents by folder name. This package must define
`root_agent` in `agent.py`.
"""

# Ensure env vars (like GOOGLE_API_KEY) are loaded when running via ADK.
# ADK itself may not automatically load a .env file depending on how it's launched.
#
# Preference order:
# 1) agents/clinical_director_agent/.env (agent-specific)
# 2) backend/.env (local dev convenience so you can keep keys in one place)
#
# Also: many repos already store Gemini keys as GEMINI_API_KEY. The google-genai
# client expects GOOGLE_API_KEY, so we map it if needed.
try:
    import os
    from pathlib import Path

    from dotenv import load_dotenv

    here = Path(__file__).resolve().parent

    # Agent-local env file
    load_dotenv(dotenv_path=here / ".env", override=False)

    # Backend env file (optional)
    load_dotenv(dotenv_path=here.parent.parent / "backend" / ".env", override=False)

    if not os.getenv("GOOGLE_API_KEY") and os.getenv("GEMINI_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY") or ""
except Exception:
    # If python-dotenv isn't installed (or any other issue), fall back to
    # environment variables already present in the process.
    pass

# ADK expects the agent module to be imported from the package.
from . import agent  # noqa: F401

