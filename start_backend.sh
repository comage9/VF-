#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

VENV_PY="$ROOT_DIR/backend/.venv/bin/python"
MANAGE_PY="$ROOT_DIR/backend/manage.py"

if [[ ! -f "$MANAGE_PY" ]]; then
  echo "ERROR: manage.py not found at: $MANAGE_PY" >&2
  exit 1
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "ERROR: python not found/executable at: $VENV_PY" >&2
  echo "Hint: create venv + install deps:" >&2
  echo "  python3 -m venv backend/.venv" >&2
  echo "  backend/.venv/bin/pip install -r backend/requirements.txt" >&2
  exit 1
fi

exec "$VENV_PY" "$MANAGE_PY" runserver 0.0.0.0:5176
