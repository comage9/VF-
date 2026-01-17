#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [[ ! -f package.json ]]; then
  echo "ERROR: package.json not found in: $DIR" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "node_modules not found. Running: npm install" >&2
  npm install
fi

exec npm run dev
