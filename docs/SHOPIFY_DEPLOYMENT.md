# Shopify deployment plan

## Current deployable state

The app is a Vite/Vue static frontend. It can be built with:

```powershell
cd frontend
npm run build
```

The generated files land in `frontend/dist`.

## Recommended commercial architecture

Do not rely on client-side limits for paid usage. Browser code can be copied or
modified, so the credit ledger and generation/splitting enforcement must live on
a backend.

Use this deployment shape:

1. Host the frontend from a private GitHub repository through a deployment host
   such as Cloudflare Pages, Vercel, Netlify, or another static host.
2. Create a Shopify page that embeds the hosted app URL.
3. Require Shopify customer login before generation.
4. Route generation requests through a backend API.
5. Give each customer 3 free generations per calendar month in the backend
   ledger.
6. Sell credit products in Shopify, for example 10, 50, and 100 generation
   credits.
7. Subscribe the backend to paid order webhooks and add credits only after a
   qualifying paid order is confirmed.
8. Decrement credits server-side when a generation is accepted.

## Shopify integration options

For a single store, the fastest path is:

1. Deploy `frontend/dist` to a static host.
2. Add a Shopify page such as `/pages/mesh-splitter`.
3. Embed the app in that page with an iframe pointing at the deployed URL.
4. Add a "Buy credits" product or collection link below the app.

For a more robust product, build a Shopify app with:

- An app proxy so customer requests stay under the shop domain.
- Signed app proxy request verification.
- `logged_in_customer_id` checks before returning account-specific credit data.
- Order paid webhook handling for credit purchases.
- Mandatory privacy webhooks if the app is distributed beyond your own store.

## License recommendation

Keep the repository private and proprietary while commercializing. Do not use
MIT, Apache-2.0, BSD, or ISC unless you are comfortable letting others reuse the
code commercially.

This repository currently uses an all-rights-reserved `LICENSE` file and marks
the package as `UNLICENSED`. If you later want outside contributors, use a
custom commercial license or contributor agreement instead of switching directly
to an open-source license.
