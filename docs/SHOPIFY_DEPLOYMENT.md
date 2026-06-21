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
