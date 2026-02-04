## ADK Agents

This folder contains Google ADK agent projects that run *outside* the Node backend.

### Clinical Director Agent (local)

1. Create a virtualenv and install deps:

```bash
cd agents/clinical_director_agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

2. Paste your exported Agent Designer code into:

- `agents/clinical_director_agent/agent.py`

It must define `root_agent`.

3. Start the ADK API server from the parent folder (`agents/`):

```bash
cd agents
adk api_server
```

4. Point the Node backend at the ADK API server:

Set in `backend/.env` (local):

```bash
CLINICAL_DIRECTOR_AGENT_URL="http://localhost:8000/run"
CLINICAL_DIRECTOR_ADK_APP_NAME="clinical_director_agent"
```

Then restart the backend.

