# Shopify deployment plan

## Current deployable state

The app is a Vite/Vue static frontend. It can be built with:

```powershell
cd frontend
npm run build
```

The generated files land in `frontend/dist`.

The production package is Docker-ready. The repository includes:

- `Dockerfile` for a single web service that serves the built frontend and the
  credit/session/webhook backend.
- `.github/workflows/publish-container.yml` for publishing the production
  container to GitHub Container Registry.
- `render.yaml` for an optional Render Blueprint with one Docker web service and
  one Postgres database.
- `shopify.app.example.toml` for the Shopify app proxy and paid-order webhook
  configuration once the public backend URL is known.
- `.env.production.example` documenting required runtime secrets.

The production Cloud Run service URL is:

```text
https://maliev-mesh-splitter-1036965383273.europe-west1.run.app
```

If the Cloud Run service URL changes, replace that URL in the Shopify app config
before validation and deploy.

The published container image is:

```text
ghcr.io/maliev-co-ltd/maliev.meshsplitter:main
```

Commit-specific images are also tagged as `sha-<short-sha>`.

## Google Cloud Run deployment

The `maliev-website` Google Cloud project already has Firestore/Datastore
enabled. For Cloud Run, use the Datastore credit ledger instead of provisioning
Cloud SQL:

```powershell
gcloud run deploy maliev-mesh-splitter `
  --project=maliev-website `
  --region=europe-west1 `
  --source=. `
  --allow-unauthenticated `
  --set-env-vars NODE_ENV=production,FRONTEND_DIST_DIR=/app/frontend/dist,CREDIT_STORE=datastore,GOOGLE_CLOUD_PROJECT=maliev-website,DATASTORE_NAMESPACE=mesh-splitter,VITE_MESH_API_BASE_URL=/api,VITE_CREDITS_ENFORCEMENT=required,VITE_SHOPIFY_STORE_DOMAIN=shop.maliev.com,SHOPIFY_APP_URL=https://maliev-mesh-splitter-1036965383273.europe-west1.run.app,STOREFRONT_URL=https://shop.maliev.com/tools/mesh-splitter,CUSTOMER_LOGIN_URL=https://shop.maliev.com/account/login?return_url=%2Ftools%2Fmesh-splitter,SHOPIFY_SCOPES=read_orders
```

Set these Cloud Run secrets or environment variables before wiring the Shopify
app proxy:

- `SHOPIFY_APP_PROXY_SECRET`
- `SHOPIFY_WEBHOOK_SECRET`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SESSION_SECRET`

After deployment, verify:

```powershell
curl.exe -L https://<cloud-run-url>/health
```

## Recommended commercial architecture

Use the backend as the Shopify app-proxy target. It serves the built frontend,
verifies the Shopify app-proxy signature, stores a signed customer session, and
enforces credits through `/api/generations`.

Do not rely on client-side limits for paid usage. Browser code can be copied or
modified, so the credit ledger and customer identity checks live on the backend.
Do not move mesh processing to the backend. Upload parsing, scaling, splitting,
connector booleans, part labeling, manifold checks, STL ZIP generation, and PDF
assembly packet generation run on the customer's device through browser-loaded
WASM and JavaScript.

## Shopify integration options

The implemented launch path uses:

- Shopify OAuth installation through `/auth` and `/auth/callback`.
- Shopify app proxy so customer requests stay under the shop domain.
- Signed app-proxy request verification.
- `logged_in_customer_id` checks before creating the customer session.
- Postgres-backed credit ledger.
- `orders/paid` webhook handling for credit purchases.
- Credit products defined in `shopify/credit-products.csv`.

## Render deployment

Create the Render Blueprint from `render.yaml` and connect it to:

```text
https://github.com/MALIEV-Co-Ltd/Maliev.MeshSplitter
```

Set the unsynced secret values in Render before the first production deploy:

- `SHOPIFY_APP_PROXY_SECRET`
- `SHOPIFY_WEBHOOK_SECRET`

Render supplies `DATABASE_URL` from `maliev-mesh-splitter-db` and generates
`SESSION_SECRET` automatically.

If Render is connected to GHCR instead of the GitHub repository, deploy:

```text
ghcr.io/maliev-co-ltd/maliev.meshsplitter:main
```

After deployment, verify:

```powershell
curl.exe -L https://maliev-mesh-splitter.onrender.com/health
```

Expected response:

```json
{"ok":true}
```

## Shopify app configuration

Copy `shopify.app.example.toml` to `shopify.app.toml` only after the Shopify
Partner app is linked or created. Replace `client_id` and the backend URL if
Cloud Run assigned a different service hostname, then validate:

```powershell
shopify app config validate --json
```

Deploy the app configuration:

```powershell
shopify app deploy
```

The app proxy must resolve:

```text
https://shop.maliev.com/tools/mesh-splitter
```

That path serves the public product presentation. The protected customer tool
launches from:

```text
https://shop.maliev.com/tools/mesh-splitter/app
```

The Shopify main menu should include a top-level `MeshSplitter` link to
`/tools/mesh-splitter` so customers can discover the tool from the storefront.

## License recommendation

Keep the repository private and proprietary while commercializing. Do not use
MIT, Apache-2.0, BSD, or ISC unless you are comfortable letting others reuse the
code commercially.

This repository currently uses an all-rights-reserved `LICENSE` file and marks
the package as `UNLICENSED`. If you later want outside contributors, use a
custom commercial license or contributor agreement instead of switching directly
to an open-source license.

## Launch QA checklist

- `npm --prefix frontend test`
- `npm --prefix frontend exec playwright test`
- `npm --prefix frontend run build`
- `npm --prefix backend test`
- Upload a known watertight STL through the Shopify app-proxy URL.
- Confirm one generation is consumed only when Split starts.
- Confirm labeled STL ZIP and assembly PDF download after split.
- Confirm non-manifold exports are blocked by the frontend validator.
- Confirm 390px mobile, 768px tablet, 1440px desktop, 2560px 2K, and 3840px 4K
  viewports have no horizontal overflow and show the 3D review canvas.
