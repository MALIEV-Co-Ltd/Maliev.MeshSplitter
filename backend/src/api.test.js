import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from './server.js'
import { createHmac } from 'node:crypto'
import { signAppProxyQuery, signShopifyOAuthQuery } from './shopifySecurity.js'

describe('HTTP API', () => {
  let baseUrl
  let server

  beforeEach(async () => {
    server = createServer({
      devCustomerBypass: true,
      shopifyAppProxySecret: 'proxy-secret',
      shopifyWebhookSecret: 'webhook-secret',
      shopifyApiKey: 'api-key',
      shopifyApiSecret: 'api-secret',
      shopifyScopes: 'read_orders',
      appUrl: 'https://mesh.example.com',
      storefrontUrl: 'https://shop.example.com/tools/mesh-splitter',
      customerLoginUrl: 'https://shop.example.com/account/login?return_url=%2Ftools%2Fmesh-splitter',
      now: () => new Date('2026-06-21T12:00:00.000Z'),
    })
    await new Promise(resolve => server.listen(0, resolve))
    const address = server.address()
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise(resolve => server.close(resolve))
  })

  it('returns pricing plans', async () => {
    const response = await fetch(`${baseUrl}/api/pricing`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.freeGenerationsPerMonth).toBe(3)
    expect(body.creditPacks).toHaveLength(3)
  })

  it('returns the current customer credit account', async () => {
    const response = await fetch(`${baseUrl}/api/account`, {
      headers: { 'x-mesh-customer-id': 'local-customer' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.account).toMatchObject({ customerId: 'local-customer', freeRemaining: 3 })
  })

  it('sets a signed customer session from a Shopify app-proxy page request', async () => {
    const query = {
      shop: 'example.myshopify.com',
      logged_in_customer_id: '12345',
      timestamp: '1782050000',
    }
    const signature = signAppProxyQuery(query, 'proxy-secret')
    const pageResponse = await fetch(`${baseUrl}/?shop=${query.shop}&logged_in_customer_id=${query.logged_in_customer_id}&timestamp=${query.timestamp}&signature=${signature}`)
    const cookie = pageResponse.headers.get('set-cookie')

    const accountResponse = await fetch(`${baseUrl}/api/account`, {
      headers: { cookie },
    })
    const body = await accountResponse.json()

    expect(cookie).toContain('mesh_splitter_session=')
    expect(accountResponse.status).toBe(200)
    expect(body.account).toMatchObject({ customerId: 'shopify:12345', freeRemaining: 3 })
  })

  it('redirects anonymous app-proxy visitors to Shopify login', async () => {
    const query = {
      shop: 'example.myshopify.com',
      path_prefix: '/tools/mesh-splitter',
      timestamp: '1782050000',
    }
    const signature = signAppProxyQuery(query, 'proxy-secret')
    const response = await fetch(`${baseUrl}/?shop=${query.shop}&path_prefix=${encodeURIComponent(query.path_prefix)}&timestamp=${query.timestamp}&signature=${signature}`, {
      redirect: 'manual',
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://shop.example.com/account/login?return_url=%2Ftools%2Fmesh-splitter')
  })

  it('starts Shopify OAuth installation', async () => {
    const response = await fetch(`${baseUrl}/auth?shop=example.myshopify.com`, {
      redirect: 'manual',
    })
    const location = new URL(response.headers.get('location'))

    expect(response.status).toBe(302)
    expect(location.origin).toBe('https://example.myshopify.com')
    expect(location.pathname).toBe('/admin/oauth/authorize')
    expect(location.searchParams.get('client_id')).toBe('api-key')
    expect(location.searchParams.get('scope')).toBe('read_orders')
    expect(location.searchParams.get('redirect_uri')).toBe('https://mesh.example.com/auth/callback')
    expect(response.headers.get('set-cookie')).toContain('mesh_splitter_oauth_state=')
  })

  it('finishes Shopify OAuth installation after HMAC and state validation', async () => {
    let exchange
    const installServer = createServer({
      devCustomerBypass: true,
      shopifyAppProxySecret: 'proxy-secret',
      shopifyWebhookSecret: 'webhook-secret',
      shopifyApiKey: 'api-key',
      shopifyApiSecret: 'api-secret',
      shopifyScopes: 'read_orders',
      appUrl: 'https://mesh.example.com',
      storefrontUrl: 'https://shop.example.com/tools/mesh-splitter',
      customerLoginUrl: 'https://shop.example.com/account/login?return_url=%2Ftools%2Fmesh-splitter',
      exchangeShopifyCode: async payload => {
        exchange = payload
        return { access_token: 'token' }
      },
    })
    await new Promise(resolve => installServer.listen(0, resolve))
    const installBaseUrl = `http://127.0.0.1:${installServer.address().port}`

    try {
      const startResponse = await fetch(`${installBaseUrl}/auth?shop=example.myshopify.com`, {
        redirect: 'manual',
      })
      const state = new URL(startResponse.headers.get('location')).searchParams.get('state')
      const query = {
        shop: 'example.myshopify.com',
        code: 'install-code',
        state,
        timestamp: '1782050000',
      }
      const hmac = signShopifyOAuthQuery(query, 'api-secret')

      const callbackResponse = await fetch(`${installBaseUrl}/auth/callback?shop=${query.shop}&code=${query.code}&state=${query.state}&timestamp=${query.timestamp}&hmac=${hmac}`, {
        headers: { cookie: startResponse.headers.get('set-cookie') },
        redirect: 'manual',
      })

      expect(callbackResponse.status).toBe(302)
      expect(callbackResponse.headers.get('location')).toBe('https://shop.example.com/tools/mesh-splitter')
      expect(exchange).toEqual({
        shop: 'example.myshopify.com',
        code: 'install-code',
        clientId: 'api-key',
        clientSecret: 'api-secret',
      })
    } finally {
      await new Promise(resolve => installServer.close(resolve))
    }
  })

  it('consumes one generation through the API', async () => {
    const response = await fetch(`${baseUrl}/api/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mesh-customer-id': 'local-customer',
      },
      body: JSON.stringify({ idempotencyKey: 'gen-1', metadata: { filename: 'part.stl' } }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.transaction).toMatchObject({ source: 'free_monthly' })
    expect(body.account.freeRemaining).toBe(2)
  })

  it('credits paid Shopify order webhooks', async () => {
    const rawBody = JSON.stringify({
      id: 8001,
      customer: { id: 991 },
      line_items: [{ sku: 'MS-CREDITS-10', quantity: 1 }],
    })
    const hmac = createHmac('sha256', 'webhook-secret').update(Buffer.from(rawBody)).digest('base64')

    const response = await fetch(`${baseUrl}/webhooks/shopify/orders-paid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shopify-hmac-sha256': hmac,
      },
      body: rawBody,
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ customerId: 'shopify:991', creditsAdded: 10 })
  })
})
