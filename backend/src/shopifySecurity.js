import { createHmac, timingSafeEqual } from 'node:crypto'

export function signAppProxyQuery(query, secret) {
  const message = Object.keys(query)
    .filter(key => key !== 'signature' && key !== 'hmac')
    .sort()
    .map(key => `${key}=${Array.isArray(query[key]) ? query[key].join(',') : query[key]}`)
    .join('')

  return createHmac('sha256', secret).update(message).digest('hex')
}

export function verifyAppProxyIdentity(query, secret) {
  if (!secret) throw new Error('SHOPIFY_APP_PROXY_SECRET is not configured')

  const expected = signAppProxyQuery(query, secret)
  if (!safeEqualHex(expected, query.signature || '')) {
    throw new Error('Invalid Shopify app proxy signature')
  }

  if (!query.logged_in_customer_id) {
    throw new Error('Shopify customer login is required')
  }

  return {
    customerId: `shopify:${query.logged_in_customer_id}`,
    shop: query.shop,
  }
}

export function verifyShopifyWebhookHmac(rawBody, hmacHeader, secret) {
  if (!secret || !hmacHeader) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64')
  return safeEqual(expected, hmacHeader)
}

export function createSignedSession(identity, secret) {
  if (!secret) throw new Error('Session secret is not configured')
  const payload = Buffer.from(JSON.stringify({
    customerId: identity.customerId,
    shop: identity.shop,
  })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifySignedSession(cookieValue, secret) {
  if (!secret || !cookieValue) throw new Error('Customer session is required')
  const [payload, signature] = String(cookieValue).split('.')
  if (!payload || !signature) throw new Error('Invalid customer session')

  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  if (!safeEqual(expected, signature)) throw new Error('Invalid customer session')

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (!parsed.customerId) throw new Error('Invalid customer session')
  return parsed
}

function safeEqualHex(a, b) {
  return /^[a-f0-9]+$/i.test(b) && safeEqual(a, b)
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
