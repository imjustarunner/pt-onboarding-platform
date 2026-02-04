FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY agents/cloudrun/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy agents and Cloud Run entrypoint
COPY agents/__init__.py /app/agents/__init__.py
COPY agents/clinical_director_agent /app/agents/clinical_director_agent
COPY agents/cloudrun/main.py /app/agents/main.py

# Run as non-root
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1
ENV PATH="/home/appuser/.local/bin:${PATH}"

# Cloud Run provides $PORT
CMD ["sh", "-c", "uvicorn agents.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

