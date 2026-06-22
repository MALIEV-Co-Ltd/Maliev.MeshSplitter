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
- `render.yaml` for a Render Blueprint with one Docker web service and one
  Postgres database.
- `shopify.app.example.toml` for the Shopify app proxy and paid-order webhook
  configuration once the public backend URL is known.
- `.env.production.example` documenting required runtime secrets.

The expected Render service URL is:

```text
https://maliev-mesh-splitter.onrender.com
```

If Render assigns a different URL, replace that URL in the Shopify app config
before validation/deploy.

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
Render assigned a different service hostname, then validate:

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
