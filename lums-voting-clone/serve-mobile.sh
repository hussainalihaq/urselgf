#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-4173}"

get_ip() {
  local ip=""
  ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  if [[ -z "$ip" ]]; then
    ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  fi
  if [[ -z "$ip" ]]; then
    ip="$(hostname | awk '{print $1}')"
  fi
  printf '%s' "$ip"
}

IP_ADDR="$(get_ip)"

echo "Serving: $ROOT_DIR"
echo "Desktop URL: http://127.0.0.1:${PORT}/"
if [[ -n "$IP_ADDR" ]]; then
  echo "Phone URL:   http://${IP_ADDR}:${PORT}/"
  echo "Make sure your phone and this Mac are on the same Wi-Fi."
fi

cd "$ROOT_DIR"
python3 -m http.server "$PORT" --bind 0.0.0.0
