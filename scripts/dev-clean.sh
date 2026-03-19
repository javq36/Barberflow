#!/usr/bin/env bash
set -u

# Ignore errors if tools are unavailable or nothing is listening.
kill_port() {
  local port="$1"

  if command -v fuser >/dev/null 2>&1; then
    fuser -k -n tcp "$port" >/dev/null 2>&1 || true
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      kill -9 $pids >/dev/null 2>&1 || true
    fi
  fi
}

for port in 3000 3001 5164 7095; do
  kill_port "$port"
done

rm -f "$(dirname "$0")/../src/barberflow-web/.next/dev/lock" >/dev/null 2>&1 || true
