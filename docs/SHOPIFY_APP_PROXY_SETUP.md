# Shopify app-proxy setup

## Product direction

MeshSplitter is a self-serve STL splitting product for customers who need to
fit large meshes onto smaller 3D printers.

Storefront positioning:

- Headline: Print-ready mesh splitting.
- Promise: split large watertight STL files into labeled, printer-sized parts
  directly in the browser.
- Trust points: local WASM processing, manifold-validated exports, connector
  pegs/sockets, 3D review canvas, STL ZIP, and assembly PDF.

Launch pricing:

- 3 free generations per logged-in Shopify customer every calendar month.
- Starter Credit Pack: 10 generations for THB 329.
- Maker Credit Pack: 30 generations for THB 879.
- Studio Credit Pack: 100 generations for THB 2,490.

Credits are consumed when the customer starts a split. Paid credits never reset;
the free monthly allowance resets by UTC month.

## Shopify products

Import `shopify/credit-products.csv` into Shopify Products, or create the three
products manually with these SKUs:

- `MS-CREDITS-10`
- `MS-CREDITS-30`
- `MS-CREDITS-100`

The backend reads paid `orders/paid` webhooks and grants credits from the SKU
and quantity of purchased line items.

## App proxy

Configure a Shopify app proxy that points to the deployed backend URL:

- Subpath prefix: `tools`
- Subpath: `mesh-splitter`
- Proxy URL: `https://maliev-mesh-splitter-1036965383273.europe-west1.run.app/`

The first page request through `/tools/mesh-splitter` is signed by Shopify. The
backend verifies that signature, requires `logged_in_customer_id`, then sets a
signed `mesh_splitter_session` cookie. API requests use that cookie.

## Webhook

Subscribe the app to `orders/paid` and route it to:

```text
https://maliev-mesh-splitter-1036965383273.europe-west1.run.app/webhooks/shopify/orders-paid
```

Set `SHOPIFY_WEBHOOK_SECRET` to the webhook signing secret so the backend can
verify `X-Shopify-Hmac-Sha256`.

## Deployment build

Build the frontend:

```powershell
npm --prefix frontend install
npm --prefix frontend run build
```

Install and start the backend:

```powershell
npm --prefix backend install
npm --prefix backend start
```

Required backend environment:

- `DATABASE_URL`
- `SHOPIFY_APP_PROXY_SECRET`
- `SHOPIFY_WEBHOOK_SECRET`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SHOPIFY_SCOPES=read_orders`
- `STOREFRONT_URL=https://shop.maliev.com/tools/mesh-splitter`
- `CUSTOMER_LOGIN_URL=https://shop.maliev.com/account/login?return_url=%2Ftools%2Fmesh-splitter`
- `SESSION_SECRET`
- `FRONTEND_DIST_DIR`

Required frontend build environment:

- `VITE_MESH_API_BASE_URL=/api`
- `VITE_CREDITS_ENFORCEMENT=required`
- `VITE_SHOPIFY_STORE_DOMAIN=<your-store>.myshopify.com`
