#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM_DIR="$ROOT_DIR/production/platform"

resolve_compose() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "docker compose"
    return
  fi

  if command -v podman >/dev/null 2>&1; then
    echo "podman compose"
    return
  fi

  echo "No usable container runtime found. Install Docker (with socket access) or Podman." >&2
  exit 1
}

COMPOSE_CMD="$(resolve_compose)"
ACTION="${1:-up}"
EDGE_REPLICAS="${2:-6}"

cd "$PLATFORM_DIR"

case "$ACTION" in
  up)
    $COMPOSE_CMD up --build -d --scale edge="$EDGE_REPLICAS"
    ;;
  scale)
    $COMPOSE_CMD up -d --scale edge="$EDGE_REPLICAS"
    ;;
  down)
    $COMPOSE_CMD down
    ;;
  ps)
    $COMPOSE_CMD ps
    ;;
  logs)
    $COMPOSE_CMD logs --tail=200
    ;;
  *)
    echo "Unsupported action: $ACTION" >&2
    echo "Usage: bash scripts/prod-runtime.sh {up|scale|down|ps|logs} [edge_replicas]" >&2
    exit 1
    ;;
esac
