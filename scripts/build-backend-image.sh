#!/usr/bin/env bash
set -euo pipefail
: "${IMAGE_NAME:?IMAGE_NAME is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
log_file=$(mktemp)
trap 'rm -f "$log_file"' EXIT
for attempt in 1 2 3; do
  echo "Docker build attempt ${attempt}/3"
  set +e
  docker build -f backend/Dockerfile --build-arg VITE_API_URL=/api \
    -t "$IMAGE_NAME:$GITHUB_SHA" -t "$IMAGE_NAME:latest" . 2>&1 | tee "$log_file"
  build_status=${PIPESTATUS[0]}
  set -e
  if [ "$build_status" -eq 0 ]; then exit 0; fi
  if [ "$attempt" -eq 3 ] || ! grep -Eiq '429|toomanyrequests|too many requests|failed to resolve source metadata|failed to fetch.*token|TLS handshake timeout|connection reset by peer' "$log_file"; then
    echo "Docker build failed (exit ${build_status}); see the original error above." >&2
    exit "$build_status"
  fi
  echo 'Temporary base-image registry failure; retrying with backoff.'
  sleep $((attempt * 20))
done
