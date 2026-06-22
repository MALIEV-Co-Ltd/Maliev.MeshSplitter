import { createServer as createHttpServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { CreditLedger, InsufficientCreditsError } from './creditLedger.js'
import { serializePricing } from './pricing.js'
import { applyPaidOrderCredits } from './shopifyOrders.js'
import {
  createOAuthState,
  createSignedSession,
  isValidShop,
  verifyAppProxyIdentity,
  verifyAppProxySignature,
  verifyOAuthState,
  verifyShopifyOAuthCallback,
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
  const shopifyApiKey = options.shopifyApiKey || process.env.SHOPIFY_API_KEY
  const shopifyApiSecret = options.shopifyApiSecret || process.env.SHOPIFY_API_SECRET || shopifyAppProxySecret
  const shopifyScopes = options.shopifyScopes || process.env.SHOPIFY_SCOPES || 'read_orders'
  const appUrl = options.appUrl || process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL
  const storefrontUrl = options.storefrontUrl || process.env.STOREFRONT_URL || 'https://shop.maliev.com/tools/mesh-splitter'
  const customerLoginUrl = options.customerLoginUrl || process.env.CUSTOMER_LOGIN_URL || 'https://shop.maliev.com/account/login?return_url=%2Ftools%2Fmesh-splitter%2Fapp'
  const adminSecret = options.adminSecret || process.env.CREDIT_ADMIN_TOKEN
  const exchangeShopifyCode = options.exchangeShopifyCode || exchangeShopifyAccessToken
  const sessionSecret = options.sessionSecret || process.env.SESSION_SECRET || shopifyAppProxySecret
  const frontendDistDir = options.frontendDistDir || process.env.FRONTEND_DIST_DIR || defaultFrontendDistDir()

  return createHttpServer(async (request, response) => {
    try {
      await route({
        request,
        response,
        ledger,
        adminSecret,
        devCustomerBypass,
        shopifyAppProxySecret,
        shopifyWebhookSecret,
        shopifyApiKey,
        shopifyApiSecret,
        shopifyScopes,
        appUrl,
        storefrontUrl,
        customerLoginUrl,
        exchangeShopifyCode,
        sessionSecret,
        frontendDistDir,
      })
    } catch (error) {
      sendError(response, error)
    }
  })
}

async function route(context) {
  const { request, response, ledger, shopifyWebhookSecret, adminSecret } = context
  const url = new URL(request.url, 'http://localhost')

  if (request.method === 'GET' && url.pathname === '/auth') {
    return startShopifyOAuth(context, url)
  }

  if (request.method === 'GET' && url.pathname === '/auth/callback') {
    return finishShopifyOAuth(context, url)
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { ok: true })
  }

  if (request.method === 'GET' && url.pathname === '/api/pricing') {
    return sendJson(response, 200, serializePricing())
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/reset-credits') {
    const adminBody = await readJson(request)
    return resetCredits({
      request,
      response,
      ledger,
      adminSecret,
      adminBody,
    })
  }

  if (request.method === 'GET' && url.pathname === '/api/account') {
    const identity = resolveIdentity(context, url)
    const account = await ledger.getAccount(identity.customerId)
    return sendJson(response, 200, { account })
  }

  if (
    request.method === 'POST'
    && (url.pathname === '/api/exports' || url.pathname === '/api/generations')
  ) {
    const identity = resolveIdentity(context, url)
    const body = await readJson(request)
    const requestType = url.pathname === '/api/exports' ? 'export' : 'generation'
    const transaction = await ledger.consumeExport(identity.customerId, {
      idempotencyKey: body.idempotencyKey,
      metadata: {
        ...(body.metadata || {}),
        requestType,
      },
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
    if (query.shop && !query.signature && !url.pathname.startsWith('/assets/')) {
      return startShopifyOAuth(context, url)
    }
    if (query.signature) {
      verifyAppProxySignature(query, context.shopifyAppProxySecret)
      if (!query.logged_in_customer_id && isProtectedAppPath(url.pathname, query.path_prefix)) {
        response.writeHead(302, {
          Location: buildLoginUrl(context.customerLoginUrl, url.pathname, query),
        })
        response.end()
        return
      }
      if (query.logged_in_customer_id) {
        const identity = verifyAppProxyIdentity(query, context.shopifyAppProxySecret)
        const session = createSignedSession(identity, context.sessionSecret)
        response.setHeader('Set-Cookie', serializeSessionCookie(session))
      }
    }
    return serveFrontend(response, context.frontendDistDir, url.pathname)
  }

  return sendJson(response, 404, { error: 'Not found' })
}

function isProtectedAppPath(pathname, pathPrefix) {
  if (!pathname || pathname === '/') return false
  const normalizedPath = normalizePath(pathname)
  if (normalizedPath === '/app' || normalizedPath.startsWith('/app/')) return true

  const normalizedPrefix = normalizePathPrefix(pathPrefix)
  if (!normalizedPrefix) return false
  return (
    normalizedPath === `${normalizedPrefix}/app`
    || normalizedPath.startsWith(`${normalizedPrefix}/app/`)
  )
}

function buildLoginUrl(customerLoginUrl, pathname, query) {
  const loginUrl = new URL(customerLoginUrl)
  const returnPath = resolveLoginReturnPath(pathname, query?.path_prefix)
  loginUrl.searchParams.set('return_url', returnPath)
  loginUrl.searchParams.set('return_to', returnPath)
  return loginUrl.toString()
}

function resolveLoginReturnPath(pathname, pathPrefix) {
  const normalizedPath = normalizePath(pathname)
  const normalizedPrefix = normalizePathPrefix(pathPrefix)
  if (normalizedPath.startsWith('/app') && !normalizedPrefix) return normalizedPath
  if (normalizedPath.startsWith('/app') && normalizedPrefix) return `${normalizedPrefix}${normalizedPath}`
  if (normalizedPrefix && (normalizedPath === `${normalizedPrefix}/app` || normalizedPath.startsWith(`${normalizedPrefix}/app/`))) {
    return normalizedPath
  }
  return normalizedPrefix ? `${normalizedPrefix}/app` : '/app'
}

function normalizePathPrefix(pathPrefix) {
  if (!pathPrefix || typeof pathPrefix !== 'string') return ''
  const trimmed = pathPrefix.trim()
  if (!trimmed || trimmed === '/') return ''
  return normalizePath(trimmed)
}

function normalizePath(value) {
  if (!value || typeof value !== 'string') return '/'
  const trimmed = value.trim()
  if (!trimmed) return '/'
  return trimmed.startsWith('/') ? trimmed.replace(/\/+$/, '') : `/${trimmed.replace(/\/+$/, '')}`
}

function startShopifyOAuth({ request, response, shopifyApiKey, shopifyApiSecret, shopifyScopes, appUrl, sessionSecret }, url) {
  const shop = url.searchParams.get('shop')
  if (!isValidShop(shop)) {
    return sendHtml(response, 400, 'Invalid Shopify shop domain.')
  }
  if (!shopifyApiKey || !shopifyApiSecret) {
    return sendHtml(response, 500, 'Shopify OAuth is not configured.')
  }

  const publicAppUrl = appUrl || inferPublicAppUrl(request)
  const redirectUri = new URL('/auth/callback', publicAppUrl).toString()
  const state = createOAuthState({
    shop,
    nonce: randomBytes(16).toString('base64url'),
    timestamp: Date.now(),
  }, sessionSecret || shopifyApiSecret)
  const installUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  installUrl.searchParams.set('client_id', shopifyApiKey)
  installUrl.searchParams.set('scope', shopifyScopes)
  installUrl.searchParams.set('redirect_uri', redirectUri)
  installUrl.searchParams.set('state', state)

  response.writeHead(302, {
    Location: installUrl.toString(),
    'Set-Cookie': serializeOAuthStateCookie(state),
  })
  response.end()
}

async function finishShopifyOAuth(context, url) {
  const {
    request,
    response,
    shopifyApiKey,
    shopifyApiSecret,
    sessionSecret,
    storefrontUrl,
    exchangeShopifyCode,
  } = context
  if (!shopifyApiKey || !shopifyApiSecret) {
    return sendHtml(response, 500, 'Shopify OAuth is not configured.')
  }

  const query = Object.fromEntries(url.searchParams.entries())
  const { shop, code } = verifyShopifyOAuthCallback(query, shopifyApiSecret)
  const state = verifyOAuthState(query.state, sessionSecret || shopifyApiSecret)
  const stateCookie = parseCookies(request.headers.cookie || '').mesh_splitter_oauth_state
  if (state.shop !== shop || (stateCookie && stateCookie !== query.state)) {
    return sendHtml(response, 400, 'Invalid Shopify OAuth state.')
  }

  await exchangeShopifyCode({ shop, code, clientId: shopifyApiKey, clientSecret: shopifyApiSecret })
  response.writeHead(302, {
    Location: storefrontUrl,
    'Set-Cookie': 'mesh_splitter_oauth_state=; Path=/auth/callback; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
  })
  response.end()
}

async function exchangeShopifyAccessToken({ shop, code, clientId, clientSecret }) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  })
  if (!response.ok) {
    throw new Error(`Shopify OAuth token exchange failed with ${response.status}`)
  }
  return response.json()
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

async function resetCredits({ request, response, ledger, adminSecret, adminBody }) {
  if (!adminSecret) {
    return sendJson(response, 403, { error: 'Credit reset is disabled' })
  }

  const authHeader = request.headers.authorization || ''
  const token = request.headers['x-mesh-reset-token']
    || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '')

  if (token !== adminSecret) {
    return sendJson(response, 401, { error: 'Unauthorized' })
  }

  if (adminBody?.all === true) {
    const result = await ledger.resetAllAccounts()
    return sendJson(response, 200, result)
  }

  const targetCustomerId = adminBody?.customerId
  if (!targetCustomerId) {
    return sendJson(response, 400, { error: 'customerId is required' })
  }

  const account = await ledger.resetCustomerAccount(targetCustomerId)
  return sendJson(response, 200, { account })
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

function inferPublicAppUrl(request) {
  const proto = request.headers['x-forwarded-proto'] || 'https'
  const host = request.headers['x-forwarded-host'] || request.headers.host
  return `${proto}://${host}`
}

async function serveFrontend(response, frontendDistDir, requestPath) {
  if (requestPath === '/favicon.ico') {
    response.writeHead(204, { 'Cache-Control': 'public, max-age=3600' })
    response.end()
    return
  }

  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
  const candidate = path.normalize(path.join(frontendDistDir, normalizedPath))
  const distRoot = path.normalize(frontendDistDir)
  const filePath = candidate.startsWith(distRoot) ? candidate : path.join(distRoot, 'index.html')
  const assetRequest = normalizedPath.startsWith('/assets/')

  try {
    const file = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': cacheControl(filePath),
    })
    response.end(file)
  } catch {
    if (assetRequest) {
      const fallbackAsset = await resolveFallbackAsset(distRoot, normalizedPath)
      if (fallbackAsset) {
        const file = await readFile(fallbackAsset)
        response.writeHead(200, {
          'Content-Type': contentType(fallbackAsset),
          'Cache-Control': cacheControl(fallbackAsset),
        })
        response.end(file)
        return
      }
      response.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end('Asset not found')
      return
    }

    try {
      const fallback = await readFile(path.join(distRoot, 'index.html'))
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(fallback)
    } catch {
      sendHtml(response, 200, appShellHtml())
    }
  }
}

async function resolveFallbackAsset(distRoot, normalizedPath) {
  const filename = path.basename(normalizedPath)
  const extension = path.extname(filename)
  if (!['.css', '.js'].includes(extension) || !filename.startsWith('index-')) {
    return null
  }

  const assetsDir = path.join(distRoot, 'assets')
  const files = await readdir(assetsDir).catch(() => [])
  const currentEntry = files
    .filter(file => file.startsWith('index-') && file.endsWith(extension))
    .sort()
    .at(-1)
  return currentEntry ? path.join(assetsDir, currentEntry) : null
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

function serializeOAuthStateCookie(value) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `mesh_splitter_oauth_state=${value}; Path=/auth/callback; HttpOnly; SameSite=Lax${secure}`
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
  if (filePath.endsWith('.ico')) return 'image/x-icon'
  if (filePath.endsWith('.json')) return 'application/json'
  if (filePath.endsWith('.wasm')) return 'application/wasm'
  return 'application/octet-stream'
}

function cacheControl(filePath) {
  if (filePath.endsWith('.html')) return 'no-store'
  if (filePath.includes(`${path.sep}assets${path.sep}`)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}
