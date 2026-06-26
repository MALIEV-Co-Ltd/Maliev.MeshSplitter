# Local LAN deployment (Synology NAS)

Use this flow to make Mesh Splitter available to all devices on your LAN at `https://mesh-splitter.local`.

## 1) One-time host setup

- Ensure NAS has a stable local IP and hostname `mesh-splitter`.
- Ensure `mesh-splitter.local` resolves on the local network (Bonjour/mDNS is typical on Synology).
- Install **Container Manager** in DSM.

## 2) Prepare deployment files

On the NAS, create a folder (for example `/volume1/docker/mesh-splitter`) and copy:

- [`docker-compose.lan.yml`](docker-compose.lan.yml)
- [`.env.mesh-splitter.local.example`](.env.mesh-splitter.local.example) (rename to `.env.mesh-splitter.local` and fill values)
- [`deploy-mesh-splitter-lan.sh`](deploy-mesh-splitter-lan.sh)
- [`deploy-mesh-splitter-lan.ps1`](deploy-mesh-splitter-lan.ps1)
- [`verify-mesh-splitter-lan.sh`](verify-mesh-splitter-lan.sh)
- [`verify-mesh-splitter-lan.ps1`](verify-mesh-splitter-lan.ps1)

## 3) Fill `.env.mesh-splitter.local`

```bash
cp .env.mesh-splitter.local.example .env.mesh-splitter.local
# edit required values
```

Required minimum values:

- `SESSION_SECRET`
- `SHOPIFY_APP_PROXY_SECRET`

Optional:

- `DATABASE_URL` to persist credits and sessions
- `CREDIT_STORE=postgres` when you provide `DATABASE_URL`
- `CORS_ALLOW_ORIGIN=https://mesh-splitter.local`

## 4) Start the stack

### 4a) NAS shell (Linux)

```bash
cd /volume1/docker/mesh-splitter
chmod +x deploy-mesh-splitter-lan.sh
chmod +x verify-mesh-splitter-lan.sh
./deploy-mesh-splitter-lan.sh
```

> First-time bootstrap for private GHCR image pull:
> - Set `GHCR_USERNAME` and `GHCR_TOKEN` (PAT with `read:packages`) in `.env.mesh-splitter.local`
> - Then start the stack. No SSH trigger is needed after that.

### 4b) NAS shell (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-mesh-splitter-lan.ps1
```

### 4c) Manual compose (either shell style)

```bash
docker compose -f docker-compose.lan.yml --env-file .env.mesh-splitter.local up -d --force-recreate
```

or

```bash
docker-compose -f docker-compose.lan.yml --env-file .env.mesh-splitter.local up -d --force-recreate
```

Verify local container health:

```bash
PORT="${MESH_SPLITTER_HOST_PORT:-3000}"
curl -fsS "http://localhost:${PORT}/health"
# -> {"ok":true}
```

## 5) Expose HTTPS on `https://mesh-splitter.local`

In DSM reverse proxy create a rule:

- Source: host `mesh-splitter.local`, protocol `HTTPS`, port `443`, path `/`
- Destination: host `127.0.0.1`, protocol `HTTP`, port `3000`
- Keep destination path empty unless DSM explicitly requires it. The backend already
  supports `/tools/mesh-splitter` internally via `MESH_PROXY_PREFIX`.

Attach a certificate to `mesh-splitter.local` in DSM certificates.

Health and readiness on the LAN domain:

```bash
curl -k https://mesh-splitter.local/health
# -> {"ok":true}
```

## 5b) One-shot end-to-end validation after deployment

Run this set after first deploy, and again after a `main` push:

```bash
if ping -c 2 mesh-splitter.local >/dev/null 2>&1; then
  echo "DNS hostname resolves."
else
  echo "mesh-splitter.local did not resolve yet. Ensure Bonjour/mDNS is working."
  exit 1
fi

PORT="${MESH_SPLITTER_HOST_PORT:-3000}"
curl -fsS "http://127.0.0.1:${PORT}/health"
curl -k https://mesh-splitter.local/health
```

From NAS PowerShell:

```powershell
if (Test-Connection -Count 2 mesh-splitter.local -ErrorAction SilentlyContinue) {
  Write-Output "DNS hostname resolves."
} else {
  Write-Error "mesh-splitter.local did not resolve yet. Ensure Bonjour/mDNS is working."
  exit 1
}

$portEnv = [string]$env:MESH_SPLITTER_HOST_PORT
if (-not [int]::TryParse($portEnv, [ref]$port)) { $port = 3000 }
Invoke-WebRequest -Uri "http://127.0.0.1:$port/health" | Select-Object -ExpandProperty Content
Invoke-WebRequest -Uri https://mesh-splitter.local/health -SkipCertificateCheck | Select-Object -ExpandProperty Content
```

Quick pre-checks when something looks down:

- Ensure route resolves:
  - `ping mesh-splitter.local`
- Ensure DSM reverse proxy rule is active for host/path mapping.
- Check container status:
  - `docker compose -f docker-compose.lan.yml --env-file .env.mesh-splitter.local ps`

If your NAS exposes only `docker-compose`, run:

- `docker-compose -f docker-compose.lan.yml --env-file .env.mesh-splitter.local ps`

## 6) Keep the version updated automatically

This compose file uses Watchtower (`mesh-splitter-watchtower`) on the same stack:

- Pulls `ghcr.io/maliev-co-ltd/maliev.meshsplitter:main` from GHCR.
- Restarts `mesh-splitter` when the digest changes.
- If watchtower fails to pull from GHCR, confirm either:
  - `GHCR_USERNAME` + `GHCR_TOKEN` are set in `.env.mesh-splitter.local`, or
  - `/root/.docker/config.json` contains valid GHCR auth for the NAS daemon user.
  This compose mounts `/root/.docker` into the watchtower container when root login auth is used.

Manual refresh fallback:

```bash
docker compose -f docker-compose.lan.yml --env-file .env.mesh-splitter.local pull
docker compose -f docker-compose.lan.yml --env-file .env.mesh-splitter.local up -d --force-recreate
```

## 7) Verify `:main` refresh after main deployment

After a `main` push (CI publishes `ghcr.io/maliev-co-ltd/maliev.meshsplitter:main`),
watch for Watchtower updates:

```bash
docker logs mesh-splitter-watchtower --since 10m | grep -i "mesh-splitter"
```

Expected behavior: you'll see the image pull/update events and then a container restart for `mesh-splitter`.

### 7b) One-command post-deploy health check

Use the verifier directly:

```bash
cd /volume1/docker/mesh-splitter
./verify-mesh-splitter-lan.sh
```

or

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-mesh-splitter-lan.ps1
```

The verifier expects the running container to match `MESH_SPLITTER_IMAGE` from your env file
(default `ghcr.io/maliev-co-ltd/maliev.meshsplitter:main`).

Optional quick validation after deployment:

```bash
docker compose -f docker-compose.lan.yml --env-file .env.mesh-splitter.local logs --tail 120 mesh-splitter
curl -k https://mesh-splitter.local/health
```

Concrete one-shot check for tag refresh:

```bash
echo "Image now configured in compose:"
docker inspect mesh-splitter --format='{{.Config.Image}}'

echo "Container restart count:"
docker inspect mesh-splitter --format='{{.RestartCount}}'

echo "Container start time:"
docker inspect mesh-splitter --format='{{.State.StartedAt}}'

echo "Watchtower pull/recreate logs:"
docker logs mesh-splitter-watchtower --since 15m | grep -i "mesh-splitter"
```

## 8) Zero-touch NAS update behavior

`mesh-splitter-watchtower` checks GHCR every 60 seconds and redeploys `mesh-splitter`
whenever `ghcr.io/maliev-co-ltd/maliev.meshsplitter:main` changes.  
No inbound webhook from GitHub to your NAS is required.

Commands after any startup:

```bash
cd /volume1/docker/mesh-splitter
sudo docker compose -f docker-compose.lan.yml --env-file .env.mesh-splitter.local up -d --force-recreate
```

Commands after a `main` push:

```bash
sudo docker logs mesh-splitter-watchtower --since 15m | grep -i "mesh-splitter"
sudo docker inspect mesh-splitter --format '{{.Config.Image}}'
curl -k -H "Host: mesh-splitter.local" https://mesh-splitter.local/tools/mesh-splitter/health
```

If `/tools/mesh-splitter/app` still shows an old version in an open tab, force a hard
refresh or open it in a fresh private/incognito tab. Browser caches can retain an
old bundle briefly after an image refresh.
```
