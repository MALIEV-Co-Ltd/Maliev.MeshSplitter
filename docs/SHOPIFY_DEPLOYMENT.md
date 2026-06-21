# Shopify deployment plan

## Current deployable state

The app is a Vite/Vue static frontend. It can be built with:

```powershell
cd frontend
npm run build
```

The generated files land in `frontend/dist`.

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
