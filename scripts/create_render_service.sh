#!/usr/bin/env bash
set -euo pipefail

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "ERROR: RENDER_API_KEY environment variable is not set."
  echo "Export it first: export RENDER_API_KEY=your_key_here"
  exit 1
fi

read -r -d '' PAYLOAD <<'JSON'
{
  "service": {
    "name": "graotranslate",
    "repo": "hectorlozano0210-hub/graotranslatepro",
    "branch": "main",
    "type": "web_service",
    "env": "docker",
    "plan": "free",
    "dockerfilePath": "Dockerfile"
  }
}
JSON

echo "Creating Render service 'graotranslate'..."
curl -sS -X POST "https://api.render.com/v1/services" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  | jq .

echo "If the request succeeded you'll see service JSON. Configure env vars in Render dashboard after creation."
