#!/usr/bin/env sh
set -eu

INSTALL_DIR="${1:-/volume1/docker/mesh-splitter}"
COMPOSE_FILE="${2:-${INSTALL_DIR}/docker-compose.lan.yml}"
ENV_FILE="${3:-${INSTALL_DIR}/.env.mesh-splitter.local}"
COMPOSE_CMD=""

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "No docker compose binary found. Install Docker Compose from Synology Container Manager."
  exit 1
fi

if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "Compose file not found: ${COMPOSE_FILE}"
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "Env file not found: ${ENV_FILE}"
  echo "Copy .env.mesh-splitter.local.example to .env.mesh-splitter.local and fill required values."
  exit 1
fi

CURRENT_IMAGE_LINE="$(sed -n 's/^[[:space:]]*MESH_SPLITTER_IMAGE[[:space:]]*=//p' "${ENV_FILE}" | sed 's/[[:space:]]*#.*$//' | tr -d '\r"' | tr -d "'" | tr -d ' ' | head -n1)"
if [ -n "${CURRENT_IMAGE_LINE}" ] && echo "${CURRENT_IMAGE_LINE}" | grep -q ':latest$'; then
  echo "WARNING: .env.mesh-splitter.local has MESH_SPLITTER_IMAGE=${CURRENT_IMAGE_LINE}"
  echo "For this NAS workflow, use :main so watchtower tracks your CI main releases."
  echo "Set MESH_SPLITTER_IMAGE=ghcr.io/maliev-co-ltd/maliev.meshsplitter:main"
fi

if [ ! -r /root/.docker/config.json ]; then
  echo "WARNING: /root/.docker/config.json not found; private GHCR pull may fail."
  echo "Run once as root: docker login ghcr.io"
fi

cd "${INSTALL_DIR}"

# Resolve host port from env for health checks and status messages.
HOST_PORT="${MESH_SPLITTER_HOST_PORT:-3000}"
if [ -f "${ENV_FILE}" ]; then
  ENV_HOST_PORT="$(sed -n 's/^[[:space:]]*MESH_SPLITTER_HOST_PORT[[:space:]]*=[[:space:]]*//p' "${ENV_FILE}" \
    | sed 's/[[:space:]]*#.*$//' \
    | tr -d '\r"' \
    | tr -d "'" \
    | tr -d ' ' \
    | head -n1)"
  if [ -n "${ENV_HOST_PORT}" ]; then
    HOST_PORT="${ENV_HOST_PORT}"
  fi
fi

${COMPOSE_CMD} -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" pull
${COMPOSE_CMD} -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --force-recreate

echo "Waiting for startup..."
sleep 5

${COMPOSE_CMD} -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

if command -v curl >/dev/null 2>&1; then
  IMAGE_ID="$(docker inspect --format '{{json .Config.Image}}' mesh-splitter 2>/dev/null || true)"
  if [ -n "${IMAGE_ID}" ]; then
    echo "mesh-splitter image: ${IMAGE_ID}"
  fi
  echo "Health check host port: ${HOST_PORT}"

  echo "Checking container health via mapped host port:"
  attempt=1
  while [ "${attempt}" -le 24 ]; do
    if curl -fsS "http://127.0.0.1:${HOST_PORT}/health" >/dev/null; then
      echo "Container health endpoint OK."
      break
    fi
    if [ "${attempt}" -eq 24 ]; then
      echo "Timed out waiting for health endpoint."
      ${COMPOSE_CMD} -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" logs --tail 80 mesh-splitter
      exit 1
    fi
    echo "Health check attempt ${attempt}/24 failed; retrying..."
    sleep 5
    attempt=$((attempt + 1))
  done
else
  echo "curl not found on NAS; confirm mesh-splitter is healthy from DSM/Container logs."
fi

echo "Done. Configure/check HTTPS reverse proxy for https://mesh-splitter.local and test:"
echo "curl -k https://mesh-splitter.local/health"
