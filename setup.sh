#!/usr/bin/env bash
set -euo pipefail

BASE="https://raw.githubusercontent.com/TheInternetUse7/feet/master"

command -v curl >/dev/null 2>&1 || { echo "error: curl is required but not installed" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "error: Docker Compose v2 is required (docker compose, not docker-compose)" >&2; exit 1; }

[ -f compose.yaml ] || curl -fsSL "$BASE/compose.yaml" -o compose.yaml
[ -f .env ] || curl -fsSL "$BASE/.env.example" -o .env

echo "Done. Next steps:"
echo "  1. Edit .env and set FLUXER_BOT_TOKEN"
echo "  2. Run: docker compose up -d"
