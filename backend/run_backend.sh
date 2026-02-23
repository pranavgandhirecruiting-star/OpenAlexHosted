#!/bin/bash
set -euo pipefail

# --- LOGGING (helps debug in /tmp/openalex_backend.*) ---
echo "=== $(date) starting backend ==="
echo "WHOAMI: $(whoami)"
echo "PWD (before cd): $(pwd)"

# --- IMPORTANT: set a sane PATH for launchd environments ---
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# --- GitHub token for industry signal sniffing ---
# Replace with your own PAT, or set via .env / environment variable
# Get one at: https://github.com/settings/tokens (scopes: read:user, public_repo)
export GITHUB_TOKEN="${GITHUB_TOKEN:-}"

# --- Move to backend directory ---
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BACKEND_DIR"
echo "PWD (after cd): $(pwd)"

# --- Start backend via venv if present, otherwise system python ---
if [ -f "$BACKEND_DIR/venv/bin/python" ]; then
  echo "Using venv python: $BACKEND_DIR/venv/bin/python"
  exec "$BACKEND_DIR/venv/bin/python" -m uvicorn app:app --host 127.0.0.1 --port 8787
else
  echo "WARNING: venv not found at $BACKEND_DIR/venv. Using system python."
  echo "System python: $(command -v python3 || true)"
  exec python3 -m uvicorn app:app --host 127.0.0.1 --port 8787
fi
