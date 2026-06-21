# Maliev.MeshSplitter

Commercial STL mesh splitting app for Shopify customers.

Customers get 3 free generations every month. Additional generations are sold as
Shopify credit products and enforced by the backend credit ledger.

## Product shape

- Vue/Vite frontend for STL upload, splitting preview, STL ZIP export, and PDF
  assembly report export.
- Browser-side `manifold-3d` WASM geometry kernel for scaling, splitting,
  connector booleans, manifold validation, and export gating. Mesh computation
  does not run on the backend.
- Node backend for customer identity, credit balance, monthly free allowance,
  Shopify paid-order webhooks, and deployment behind a Shopify app proxy.
- Postgres-backed production ledger with an in-memory fallback for local tests.

## Customer workflow

1. Upload an STL in the storefront page.
2. Review watertight status, dimensions, and volume.
3. Apply scale if needed.
4. Define printer build volume and grid divisions.
5. Spend one free or paid generation credit to split locally in WASM.
6. Add connector pegs/sockets when needed.
7. Review labeled parts in the 3D canvas and part list.
8. Download manifold-validated STL ZIP and assembly PDF.

Exports are blocked when any generated part is not watertight/manifold.

## Local validation

```powershell
npm --prefix frontend test
npm --prefix frontend exec playwright test
npm --prefix frontend run build
npm --prefix backend test
```

The frontend test suite includes a 3 second performance budget for splitting a
basic 2x2x1 manifold model, manifold connector/export validation, and browser
checks for mobile, tablet, desktop, 2K, and 4K layouts.

## Deployment

Build the frontend first, then run the backend with `FRONTEND_DIST_DIR` pointing
at `frontend/dist`. Configure Shopify app proxy and paid-order webhook as
described in `docs/SHOPIFY_APP_PROXY_SETUP.md`.

The included `Dockerfile` builds the frontend and runs the backend as a single
web service suitable for Render, Fly.io, Railway, or any container host with
Postgres.
