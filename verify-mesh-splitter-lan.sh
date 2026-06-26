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
  exit 1
fi

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

cd "${INSTALL_DIR}"
HOST_NAME="mesh-splitter.local"

EXPECTED_IMAGE="${MESH_SPLITTER_IMAGE:-$(sed -n 's/^[[:space:]]*MESH_SPLITTER_IMAGE[[:space:]]*=[[:space:]]*//p' "${ENV_FILE}" \
  | sed 's/[[:space:]]*#.*$//' \
  | tr -d '\r"' \
  | tr -d "'" \
  | tr -d ' ' \
  | head -n1)}"
if [ -z "${EXPECTED_IMAGE}" ]; then
  EXPECTED_IMAGE="ghcr.io/maliev-co-ltd/maliev.meshsplitter:main"
fi

echo "Service status:"
${COMPOSE_CMD} -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps
echo

if docker inspect mesh-splitter >/dev/null 2>&1; then
  RUNNING_IMAGE="$(docker inspect --format '{{.Config.Image}}' mesh-splitter)"
  echo "Running image: ${RUNNING_IMAGE}"
  if [ "${RUNNING_IMAGE}" != "${EXPECTED_IMAGE}" ]; then
    echo "Running image does not match expected image: ${EXPECTED_IMAGE}"
    exit 1
  fi
else
  echo "mesh-splitter container not found."
  exit 1
fi

echo "Checking hostname resolution for ${HOST_NAME}:"
if command -v getent >/dev/null 2>&1; then
  if ! getent hosts "${HOST_NAME}" >/dev/null 2>&1; then
    echo "Hostname ${HOST_NAME} did not resolve."
    exit 1
  fi
elif command -v ping >/dev/null 2>&1; then
  if ! ping -c 1 -W 3 "${HOST_NAME}" >/dev/null 2>&1; then
    echo "Hostname ${HOST_NAME} did not resolve."
    exit 1
  fi
else
  echo "No hostname resolver available (getent/ping); skipping DNS check."
fi

if command -v curl >/dev/null 2>&1; then
  echo "Checking local health endpoint (http://127.0.0.1:${HOST_PORT}/health):"
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/health" >/dev/null; then
    echo "Local health endpoint OK."
  else
    echo "Local health endpoint failed."
    exit 1
  fi

  echo "Checking LAN hostname endpoint (https://$HOST_NAME/health):"
  if curl -ksS "https://$HOST_NAME/health" >/dev/null; then
    echo "LAN HTTPS endpoint OK."
  else
    echo "LAN HTTPS endpoint failed."
    exit 1
  fi
else
  echo "curl not found; skip endpoint checks."
fi

echo "Watchtower activity (last 10m):"
docker logs mesh-splitter-watchtower --since 10m 2>/dev/null | grep -i "mesh-splitter" || true
echo "Watchtower auth errors (if any):"
if docker logs mesh-splitter-watchtower --since 10m 2>/dev/null | grep -Ei "unauthorized|403|auth.*not present" >/dev/null; then
  echo "Detected auth errors in watchtower logs. Check GHCR credentials or /root/.docker/config.json."
  exit 1
fi
echo "No recent watchtower auth errors detected."
echo "Watchtower auth env check:"
if docker inspect mesh-splitter-watchtower >/dev/null 2>&1; then
  docker inspect mesh-splitter-watchtower --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | grep -E '^REPO_(USER|PASS)=|^DOCKER_CONFIG=' \
    | sed -E 's/^(REPO_PASS)=.*/\1=********/'
fi
echo "Watchtower auth config check:"
if [ -r /root/.docker/config.json ]; then
  if grep -q '"ghcr.io"' /root/.docker/config.json 2>/dev/null; then
    echo "Found ghcr.io entry in /root/.docker/config.json."
  else
    echo "No ghcr.io auth entry found in /root/.docker/config.json."
  fi
else
  echo "/root/.docker/config.json is not present on NAS."
fi
