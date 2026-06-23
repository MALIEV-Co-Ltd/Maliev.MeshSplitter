# Maliev.MeshSplitter

Commercial STL mesh splitting app for Shopify customers.

## License and repository use

This public repository is source-available for review, deployment transparency,
and security inspection only. It is not open source.

MALIEV Co., Ltd. grants no permission to copy, modify, redistribute, host, sell,
commercialize, or create derivative works from this code without prior written
permission. See `LICENSE`.

Customers get 3 free exports every month. Additional exports are sold as
Shopify credit products and enforced by the credit ledger.

## Product shape

- Vue/Vite storefront experience for STL upload, splitting preview, STL ZIP
  export, and PDF assembly report export.
- Mesh workflow for scaling, splitting, connector generation, manifold
  validation, and export gating.
- Node service for customer identity, credit balance, monthly free allowance,
  Shopify paid-order webhooks, signed export authorization, and deployment
  behind a Shopify app proxy.
- Production credit ledger with a lightweight test fallback.

## Customer workflow

1. Upload an STL in the storefront page.
2. Review watertight status, dimensions, and volume.
3. Apply scale if needed.
4. Define printer build volume and grid divisions.
5. Split the model and review the generated parts.
6. Add connector pegs/sockets when needed.
7. Review labeled parts in the 3D canvas and part list.
8. Spend one free or paid export credit to download the manifold-validated STL
   ZIP and assembly PDF.

Exports are blocked when any generated part is not watertight/manifold.

## Validation

```powershell
npm --prefix frontend test
npm --prefix frontend exec playwright test
npm --prefix frontend run build
npm --prefix backend test
```

The frontend test suite includes a 3 second performance budget for splitting a
basic 2x2x1 manifold model, manifold connector/export validation, and responsive
checks for mobile, tablet, desktop, 2K, and 4K layouts.

## Deployment

Build the frontend first, then run the service with `FRONTEND_DIST_DIR` pointing
at `frontend/dist`. Configure Shopify app proxy and paid-order webhook as
described in `docs/SHOPIFY_APP_PROXY_SETUP.md`.

The included `Dockerfile` builds the frontend and runs the app as a single
web service suitable for Render, Fly.io, Railway, or any container host with
Postgres.
