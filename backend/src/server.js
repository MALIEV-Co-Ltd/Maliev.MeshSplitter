import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CreditLedger, InsufficientCreditsError } from './creditLedger.js'
import { serializePricing } from './pricing.js'
import { applyPaidOrderCredits } from './shopifyOrders.js'
import {
  createSignedSession,
  verifyAppProxyIdentity,
  verifyShopifyWebhookHmac,
  verifySignedSession,
} from './shopifySecurity.js'
import { MemoryCreditStore } from './stores/memoryCreditStore.js'
import { DatastoreCreditStore } from './stores/datastoreCreditStore.js'
import { PostgresCreditStore } from './stores/postgresCreditStore.js'

export function createServer(options = {}) {
  const store = options.store || createDefaultStore()
  const ledger = new CreditLedger({ store, now: options.now })
  const devCustomerBypass = options.devCustomerBypass ?? process.env.DEV_CUSTOMER_BYPASS === 'true'
  const shopifyAppProxySecret = options.shopifyAppProxySecret || process.env.SHOPIFY_APP_PROXY_SECRET
  const shopifyWebhookSecret = options.shopifyWebhookSecret || process.env.SHOPIFY_WEBHOOK_SECRET
  const sessionSecret = options.sessionSecret || process.env.SESSION_SECRET || shopifyAppProxySecret
  const frontendDistDir = options.frontendDistDir || process.env.FRONTEND_DIST_DIR || defaultFrontendDistDir()

  return createHttpServer(async (request, response) => {
    try {
      await route({
        request,
        response,
        ledger,
        devCustomerBypass,
        shopifyAppProxySecret,
        shopifyWebhookSecret,
        sessionSecret,
        frontendDistDir,
      })
    } catch (error) {
      sendError(response, error)
    }
  })
}

async function route(context) {
  const { request, response, ledger, shopifyWebhookSecret } = context
  const url = new URL(request.url, 'http://localhost')

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { ok: true })
  }

  if (request.method === 'GET' && url.pathname === '/api/pricing') {
    return sendJson(response, 200, serializePricing())
  }

  if (request.method === 'GET' && url.pathname === '/api/account') {
    const identity = resolveIdentity(context, url)
    const account = await ledger.getAccount(identity.customerId)
    return sendJson(response, 200, { account })
  }

  if (request.method === 'POST' && url.pathname === '/api/generations') {
    const identity = resolveIdentity(context, url)
    const body = await readJson(request)
    const transaction = await ledger.consumeGeneration(identity.customerId, {
      idempotencyKey: body.idempotencyKey,
      metadata: body.metadata || {},
    })
    return sendJson(response, 201, { transaction, account: transaction.account })
  }

  if (request.method === 'POST' && url.pathname === '/webhooks/shopify/orders-paid') {
    const rawBody = await readRaw(request)
    const hmac = request.headers['x-shopify-hmac-sha256']
    if (!verifyShopifyWebhookHmac(rawBody, hmac, shopifyWebhookSecret)) {
      return sendJson(response, 401, { error: 'Invalid Shopify webhook HMAC' })
    }

    const order = JSON.parse(rawBody.toString('utf8'))
    const result = await applyPaidOrderCredits(ledger, order)
    return sendJson(response, 200, result)
  }

  if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const query = Object.fromEntries(url.searchParams.entries())
    if (query.signature) {
      const identity = verifyAppProxyIdentity(query, context.shopifyAppProxySecret)
      const session = createSignedSession(identity, context.sessionSecret)
      response.setHeader('Set-Cookie', serializeSessionCookie(session))
    }
    return serveFrontend(response, context.frontendDistDir, url.pathname)
  }

  return sendJson(response, 404, { error: 'Not found' })
}

function resolveIdentity({ request, devCustomerBypass, shopifyAppProxySecret, sessionSecret }, url) {
  const devCustomerId = request.headers['x-mesh-customer-id']
  if (devCustomerBypass && devCustomerId) {
    return { customerId: String(devCustomerId), shop: 'local-dev' }
  }

  const sessionCookie = parseCookies(request.headers.cookie || '').mesh_splitter_session
  if (sessionCookie) {
    return verifySignedSession(sessionCookie, sessionSecret)
  }

  const query = Object.fromEntries(url.searchParams.entries())
  return verifyAppProxyIdentity(query, shopifyAppProxySecret)
}

function createDefaultStore() {
  if (process.env.CREDIT_STORE === 'datastore') {
    return new DatastoreCreditStore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      namespace: process.env.DATASTORE_NAMESPACE,
    })
  }
  if (process.env.DATABASE_URL) {
    return new PostgresCreditStore({ connectionString: process.env.DATABASE_URL })
  }
  return new MemoryCreditStore()
}

async function readJson(request) {
  const raw = await readRaw(request)
  if (!raw.length) return {}
  return JSON.parse(raw.toString('utf8'))
}

function readRaw(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('error', reject)
    request.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.CORS_ALLOW_ORIGIN || '*',
  })
  response.end(JSON.stringify(body))
}

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
  })
  response.end(body)
}

async function serveFrontend(response, frontendDistDir, requestPath) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
  const candidate = path.normalize(path.join(frontendDistDir, normalizedPath))
  const distRoot = path.normalize(frontendDistDir)
  const filePath = candidate.startsWith(distRoot) ? candidate : path.join(distRoot, 'index.html')

  try {
    const file = await readFile(filePath)
    response.writeHead(200, { 'Content-Type': contentType(filePath) })
    response.end(file)
  } catch {
    try {
      const fallback = await readFile(path.join(distRoot, 'index.html'))
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(fallback)
    } catch {
      sendHtml(response, 200, appShellHtml())
    }
  }
}

function sendError(response, error) {
  if (error instanceof InsufficientCreditsError) {
    return sendJson(response, 402, { error: error.message, account: error.account })
  }
  const statusCode = error.statusCode || 400
  return sendJson(response, statusCode, { error: error.message || 'Request failed' })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000)
  const server = createServer()
  server.listen(port, () => {
    console.log(`MeshSplitter backend listening on :${port}`)
  })
}

function serializeSessionCookie(value) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `mesh_splitter_session=${value}; Path=/; HttpOnly; SameSite=Lax${secure}`
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(';').reduce((cookies, part) => {
    const [name, ...value] = part.trim().split('=')
    if (name) cookies[name] = value.join('=')
    return cookies
  }, {})
}

function appShellHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Mesh Splitter</title>
  </head>
  <body>
    <div id="app"></div>
    <p>Mesh Splitter frontend is served by the deployed static bundle.</p>
  </body>
</html>`
}

function defaultFrontendDistDir() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(__dirname, '..', '..', 'frontend', 'dist')
}

function contentType(filePath) {
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}
