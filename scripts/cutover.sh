#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"

if [[ "$TARGET" != "blue" && "$TARGET" != "green" ]]; then
  echo "Usage: ./scripts/cutover.sh <blue|green>"
  exit 1
fi

TARGET_CONTAINER="swipe_savvy_api_${TARGET}"
TARGET_HOST="api_${TARGET}"

echo "🔍 [1/4] Verifying readiness of target environment: ${TARGET} (${TARGET_CONTAINER})..."

HEALTH_RESPONSE=$(docker exec "$TARGET_CONTAINER" wget -qO- http://localhost:3000/healthz || true)

if [[ "$HEALTH_RESPONSE" != *'"status":"ok"'* ]]; then
  echo "❌ Target environment '${TARGET}' failed readiness check (/healthz). Aborting cutover!"
  echo "Response: $HEALTH_RESPONSE"
  exit 1
fi

echo "✅ Target '${TARGET}' is healthy: $HEALTH_RESPONSE"

echo "🔀 [2/4] Updating Nginx upstream configuration to '${TARGET_HOST}:3000'..."
cat > ./nginx/upstream.conf <<EOF
upstream active_ledger_api {
    server ${TARGET_HOST}:3000;
}
EOF

echo "🔄 [3/4] Reloading Nginx gracefully (zero dropped connections)..."
docker exec swipe_savvy_nginx nginx -t
docker exec swipe_savvy_nginx nginx -s reload

echo "🩺 [4/4] Verifying public traffic via Nginx (http://localhost:8080/api/healthz)..."
PUBLIC_HEALTH=$(curl -fsS http://localhost:8080/api/healthz)
echo "🎉 Cutover complete! Live public endpoint reports:"
echo "$PUBLIC_HEALTH"