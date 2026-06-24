import { createServer as createHttpServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CreditLedger, InsufficientCreditsError } from './creditLedger.js'
import { serializePricing, FREE_GENERATIONS_PER_MONTH } from './pricing.js'
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
  const now = options.now || (() => new Date())
  const ledger = new CreditLedger({ store, now })
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
  const exportAuthSecret = options.exportAuthSecret || process.env.EXPORT_AUTH_SECRET || sessionSecret || shopifyApiSecret || shopifyAppProxySecret
  const frontendDistDir = options.frontendDistDir || process.env.FRONTEND_DIST_DIR || defaultFrontendDistDir()

  // Staff free-credit policy: customers whose Shopify email is on a staff domain
  // (e.g. maliev.com) get a larger monthly free allowance. The app proxy never
  // sends the email, so we look it up by customer id via the Admin API using a
  // custom-app token, and cache the resolved limit per customer to avoid an API
  // call on every request.
  const staffEmailDomains = normalizeDomains(
    options.staffEmailDomains
      ?? (process.env.STAFF_EMAIL_DOMAINS || 'maliev.com').split(','),
  )
  const staffFreeGenerations = Number(options.staffFreeGenerations ?? process.env.STAFF_FREE_GENERATIONS ?? 100)
  const shopifyAdminApiToken = options.shopifyAdminApiToken || process.env.SHOPIFY_ADMIN_API_TOKEN
  const shopifyAdminApiVersion = options.shopifyAdminApiVersion || process.env.SHOPIFY_ADMIN_API_VERSION || '2024-01'
  const fetchCustomerEmail = options.fetchCustomerEmail
    || (({ shop, customerId }) => fetchShopifyCustomerEmail({ shop, customerId, token: shopifyAdminApiToken, apiVersion: shopifyAdminApiVersion }))
  const staffLimitCacheTtlMs = Number(options.staffLimitCacheTtlMs ?? 60 * 60 * 1000)
  const staffLimitCache = new Map()

  async function resolveFreeLimit(identity) {
    if (!identity?.customerId) return FREE_GENERATIONS_PER_MONTH
    if (!staffEmailDomains.length) return FREE_GENERATIONS_PER_MONTH

    const cached = staffLimitCache.get(identity.customerId)
    if (cached && cached.expiresAt > now().getTime()) return cached.limit

    try {
      const rawId = String(identity.customerId)
      const numericId = rawId.startsWith('shopify:') ? rawId.slice('shopify:'.length) : rawId
      const email = await fetchCustomerEmail({ shop: identity.shop, customerId: numericId })
      const domain = typeof email === 'string' ? email.split('@')[1]?.toLowerCase() : null
      const limit = domain && staffEmailDomains.includes(domain) ? staffFreeGenerations : FREE_GENERATIONS_PER_MONTH
      staffLimitCache.set(identity.customerId, { limit, expiresAt: now().getTime() + staffLimitCacheTtlMs })
      return limit
    } catch {
      // Transient lookup failure: fall back to the default, don't cache, retry next time.
      return FREE_GENERATIONS_PER_MONTH
    }
  }

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
        exportAuthSecret,
        frontendDistDir,
        resolveFreeLimit,
        now,
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
    const identity = resolveOptionalIdentity(context, url)
    if (!identity) {
      return sendJson(response, 200, { authenticated: false, account: null })
    }
    const freeLimit = await context.resolveFreeLimit(identity)
    const account = await ledger.getAccount(identity.customerId, { freeLimit })
    return sendJson(response, 200, { authenticated: true, account })
  }

  if (request.method === 'POST' && url.pathname === '/api/exports/complete') {
    const identity = resolveIdentity(context, url)
    const body = await readJson(request)
    const authorization = verifyExportAuthorization(body.authorizationToken || body.token, {
      secret: context.exportAuthSecret,
      now: context.now,
    })
    if (authorization.customerHash !== exportCustomerHash(identity.customerId, context.exportAuthSecret)) {
      const error = new Error('Export authorization does not match the signed-in customer')
      error.statusCode = 403
      throw error
    }

    const transaction = await ledger.recordExportCompletion(identity.customerId, {
      idempotencyKey: `export-complete:${authorization.exportId}`,
      authorization,
      metadata: body.metadata || {},
    })
    return sendJson(response, 200, {
      ok: true,
      exportId: authorization.exportId,
      fingerprint: authorization.fingerprint,
      transaction,
    })
  }

  if (
    request.method === 'POST'
    && (url.pathname === '/api/exports' || url.pathname === '/api/generations')
  ) {
    const identity = resolveIdentity(context, url)
    const body = await readJson(request)
    const requestType = url.pathname === '/api/exports' ? 'export' : 'generation'
    const freeLimit = await context.resolveFreeLimit(identity)
    const transaction = await ledger.consumeExport(identity.customerId, {
      idempotencyKey: body.idempotencyKey,
      freeLimit,
      metadata: {
        ...(body.metadata || {}),
        requestType,
      },
    })
    const authorization = createExportAuthorization({
      customerId: identity.customerId,
      transaction,
      secret: context.exportAuthSecret,
      now: context.now,
    })
    return sendJson(response, 201, { transaction, account: transaction.account, authorization })
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

function normalizeDomains(domains) {
  if (!Array.isArray(domains)) return []
  return domains
    .map((domain) => String(domain).trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

// Look up a Shopify customer's email by id via the Admin API. Used only to
// classify staff (by email domain) for the free-credit allowance. Returns null
// when not configured or the customer can't be resolved so the caller falls back
// to the default allowance instead of failing the request.
async function fetchShopifyCustomerEmail({ shop, customerId, token, apiVersion = '2024-01' }) {
  if (!token || !shop || !customerId) return null
  const url = `https://${shop}/admin/api/${apiVersion}/customers/${encodeURIComponent(customerId)}.json`
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Shopify Admin API customer lookup failed with ${response.status}`)
  }
  const body = await response.json()
  return body?.customer?.email || null
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

function resolveOptionalIdentity({ request, devCustomerBypass, shopifyAppProxySecret, sessionSecret }, url) {
  const devCustomerId = request.headers['x-mesh-customer-id']
  if (devCustomerBypass && devCustomerId) {
    return { customerId: String(devCustomerId), shop: 'local-dev' }
  }

  const sessionCookie = parseCookies(request.headers.cookie || '').mesh_splitter_session
  if (sessionCookie) {
    return verifySignedSession(sessionCookie, sessionSecret)
  }

  const query = Object.fromEntries(url.searchParams.entries())
  if (query.signature) {
    verifyAppProxySignature(query, shopifyAppProxySecret)
    if (!query.logged_in_customer_id) return null
    return verifyAppProxyIdentity(query, shopifyAppProxySecret)
  }

  return null
}

function createExportAuthorization({ customerId, transaction, secret, now, ttlMs = 15 * 60 * 1000 }) {
  requireExportAuthSecret(secret)
  const issuedAtDate = now()
  const payload = {
    v: 1,
    customerHash: exportCustomerHash(customerId, secret),
    exportId: transaction.idempotencyKey,
    source: transaction.source,
    issuedAt: issuedAtDate.toISOString(),
    expiresAt: new Date(issuedAtDate.getTime() + ttlMs).toISOString(),
    nonce: randomBytes(16).toString('base64url'),
  }
  const token = signExportPayload(payload, secret)
  return {
    token,
    exportId: payload.exportId,
    fingerprint: exportFingerprint(token),
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  }
}

function verifyExportAuthorization(token, { secret, now }) {
  requireExportAuthSecret(secret)
  if (!token || typeof token !== 'string') {
    const error = new Error('Export authorization is required')
    error.statusCode = 401
    throw error
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    const error = new Error('Invalid export authorization')
    error.statusCode = 401
    throw error
  }
  const [encodedPayload, signature] = parts
  if (!encodedPayload || !signature) {
    const error = new Error('Invalid export authorization')
    error.statusCode = 401
    throw error
  }

  const expected = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    const error = new Error('Invalid export authorization')
    error.statusCode = 401
    throw error
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    const error = new Error('Invalid export authorization')
    error.statusCode = 401
    throw error
  }
  if (payload.v !== 1 || !payload.customerHash || !payload.exportId || !payload.expiresAt) {
    const error = new Error('Invalid export authorization')
    error.statusCode = 401
    throw error
  }

  if (new Date(payload.expiresAt).getTime() <= now().getTime()) {
    const error = new Error('Export authorization has expired')
    error.statusCode = 401
    throw error
  }

  return {
    ...payload,
    fingerprint: exportFingerprint(token),
  }
}

function signExportPayload(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function exportFingerprint(token) {
  return createHash('sha256').update(token).digest('hex').slice(0, 16).toUpperCase()
}

function exportCustomerHash(customerId, secret) {
  return createHmac('sha256', secret).update(String(customerId)).digest('base64url')
}

function requireExportAuthSecret(secret) {
  if (secret) return
  const error = new Error('Export authorization is not configured')
  error.statusCode = 500
  throw error
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
