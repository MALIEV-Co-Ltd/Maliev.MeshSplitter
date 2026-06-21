# Maliev.MeshSplitter

Commercial STL mesh splitting app for Shopify customers.

Customers get 3 free generations every month. Additional generations are sold as
Shopify credit products and enforced by the backend credit ledger.

## Product shape

- Vue/Vite frontend for STL upload, splitting preview, STL ZIP export, and PDF
  assembly report export.
- Node backend for customer identity, credit balance, monthly free allowance,
  Shopify paid-order webhooks, and deployment behind a Shopify app proxy.
- Postgres-backed production ledger with an in-memory fallback for local tests.

## Local validation

```powershell
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix backend test
```

## Deployment

Build the frontend first, then run the backend with `FRONTEND_DIST_DIR` pointing
at `frontend/dist`. Configure Shopify app proxy and paid-order webhook as
described in `docs/SHOPIFY_APP_PROXY_SETUP.md`.

The included `Dockerfile` builds the frontend and runs the backend as a single
web service suitable for Render, Fly.io, Railway, or any container host with
Postgres.
