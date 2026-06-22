import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from './server.js'
import { createHmac } from 'node:crypto'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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

  it('serves public landing for anonymous app-proxy visitors', async () => {
    const query = {
      shop: 'example.myshopify.com',
      path_prefix: '/tools/mesh-splitter',
      timestamp: '1782050000',
    }
    const signature = signAppProxyQuery(query, 'proxy-secret')
    const response = await fetch(`${baseUrl}/?shop=${query.shop}&path_prefix=${encodeURIComponent(query.path_prefix)}&timestamp=${query.timestamp}&signature=${signature}`, {
      redirect: 'manual',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('serves the app for anonymous app-proxy visitors so they can test before export', async () => {
    const query = {
      shop: 'example.myshopify.com',
      path_prefix: '/tools/mesh-splitter',
      timestamp: '1782050000',
    }
    const signature = signAppProxyQuery(query, 'proxy-secret')
    const response = await fetch(`${baseUrl}/app?shop=${query.shop}&path_prefix=${encodeURIComponent(query.path_prefix)}&timestamp=${query.timestamp}&signature=${signature}`, {
      redirect: 'manual',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('serves the prefixed mesh splitter app route for anonymous visitors', async () => {
    const query = {
      shop: 'example.myshopify.com',
      path_prefix: '/tools/mesh-splitter',
      timestamp: '1782050000',
    }
    const signature = signAppProxyQuery(query, 'proxy-secret')
    const response = await fetch(`${baseUrl}/tools/mesh-splitter/app?shop=${query.shop}&path_prefix=${encodeURIComponent(query.path_prefix)}&timestamp=${query.timestamp}&signature=${signature}`, {
      redirect: 'manual',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
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

  it('consumes one export through the API', async () => {
    const response = await fetch(`${baseUrl}/api/exports`, {
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

  it('is idempotent when reusing the same export idempotency key', async () => {
    const first = await fetch(`${baseUrl}/api/exports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mesh-customer-id': 'local-customer',
      },
      body: JSON.stringify({ idempotencyKey: 'export-repeat', metadata: { filename: 'part.stl' } }),
    })
    const firstBody = await first.json()

    const second = await fetch(`${baseUrl}/api/exports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mesh-customer-id': 'local-customer',
      },
      body: JSON.stringify({ idempotencyKey: 'export-repeat', metadata: { filename: 'part.stl' } }),
    })
    const secondBody = await second.json()

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(secondBody).toMatchObject({ transaction: firstBody.transaction, account: firstBody.account })
  })

  it('rejects reset requests when admin reset is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/admin/reset-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerId: 'local-customer' }),
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe('Credit reset is disabled')
  })

  it('rejects reset credit requests without admin token', async () => {
    const secretServer = createServer({
      devCustomerBypass: true,
      shopifyAppProxySecret: 'proxy-secret',
      shopifyWebhookSecret: 'webhook-secret',
      appUrl: 'https://mesh.example.com',
      storefrontUrl: 'https://shop.example.com/tools/mesh-splitter',
      customerLoginUrl: 'https://shop.example.com/account/login?return_url=%2Ftools%2Fmesh-splitter',
      adminSecret: 'admin-reset-token',
      now: () => new Date('2026-06-21T12:00:00.000Z'),
    })
    await new Promise(resolve => secretServer.listen(0, resolve))
    const secretBaseUrl = `http://127.0.0.1:${secretServer.address().port}`

    try {
      const response = await fetch(`${secretBaseUrl}/api/admin/reset-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerId: 'local-customer' }),
      })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    } finally {
      await new Promise(resolve => secretServer.close(resolve))
    }
  })

  it('resets all customer accounts when admin token is valid', async () => {
    const serverWithSecret = createServer({
      devCustomerBypass: true,
      shopifyAppProxySecret: 'proxy-secret',
      shopifyWebhookSecret: 'webhook-secret',
      appUrl: 'https://mesh.example.com',
      storefrontUrl: 'https://shop.example.com/tools/mesh-splitter',
      customerLoginUrl: 'https://shop.example.com/account/login?return_url=%2Ftools%2Fmesh-splitter',
      adminSecret: 'admin-reset-token',
      now: () => new Date('2026-06-21T12:00:00.000Z'),
    })
    await new Promise(resolve => serverWithSecret.listen(0, resolve))
    const secretBaseUrl = `http://127.0.0.1:${serverWithSecret.address().port}`

    try {
      await Promise.all([
        fetch(`${secretBaseUrl}/api/exports`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mesh-customer-id': 'local-customer-1',
          },
          body: JSON.stringify({ idempotencyKey: 'reset-all-1' }),
        }),
        fetch(`${secretBaseUrl}/api/exports`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mesh-customer-id': 'local-customer-2',
          },
          body: JSON.stringify({ idempotencyKey: 'reset-all-2' }),
        }),
      ])

      const beforeReset = await Promise.all([
        fetch(`${secretBaseUrl}/api/account`, { headers: { 'x-mesh-customer-id': 'local-customer-1' } }),
        fetch(`${secretBaseUrl}/api/account`, { headers: { 'x-mesh-customer-id': 'local-customer-2' } }),
      ])
      expect((await beforeReset[0].json()).account.freeRemaining).toBe(2)
      expect((await beforeReset[1].json()).account.freeRemaining).toBe(2)

      const resetResponse = await fetch(`${secretBaseUrl}/api/admin/reset-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-reset-token',
        },
        body: JSON.stringify({ all: true }),
      })
      const resetBody = await resetResponse.json()

      expect(resetResponse.status).toBe(200)
      expect(resetBody.ok).toBe(true)
    } finally {
      await new Promise(resolve => serverWithSecret.close(resolve))
    }
  })

  it('resets a customer account when admin token is valid', async () => {
    const serverWithSecret = createServer({
      devCustomerBypass: true,
      shopifyAppProxySecret: 'proxy-secret',
      shopifyWebhookSecret: 'webhook-secret',
      appUrl: 'https://mesh.example.com',
      storefrontUrl: 'https://shop.example.com/tools/mesh-splitter',
      customerLoginUrl: 'https://shop.example.com/account/login?return_url=%2Ftools%2Fmesh-splitter',
      adminSecret: 'admin-reset-token',
      now: () => new Date('2026-06-21T12:00:00.000Z'),
    })
    await new Promise(resolve => serverWithSecret.listen(0, resolve))
    const secretBaseUrl = `http://127.0.0.1:${serverWithSecret.address().port}`

    try {
      await Promise.all([
        fetch(`${secretBaseUrl}/api/exports`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mesh-customer-id': 'local-customer',
          },
          body: JSON.stringify({ idempotencyKey: 'reset-test' }),
        }),
      ])

      const beforeReset = await fetch(`${secretBaseUrl}/api/account`, {
        headers: { 'x-mesh-customer-id': 'local-customer' },
      })
      expect((await beforeReset.json()).account.freeRemaining).toBe(2)

      const resetResponse = await fetch(`${secretBaseUrl}/api/admin/reset-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-reset-token',
        },
        body: JSON.stringify({ customerId: 'local-customer' }),
      })
      const resetBody = await resetResponse.json()

      expect(resetResponse.status).toBe(200)
      expect(resetBody.account).toMatchObject({ customerId: 'local-customer', freeRemaining: 3, paidCredits: 0 })
    } finally {
      await new Promise(resolve => serverWithSecret.close(resolve))
    }
  })

  it('returns insufficient credits when monthly free exports and paid credits are exhausted', async () => {
    await Promise.all([
      fetch(`${baseUrl}/api/exports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mesh-customer-id': 'local-customer',
        },
        body: JSON.stringify({ idempotencyKey: 'export-1' }),
      }),
      fetch(`${baseUrl}/api/exports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mesh-customer-id': 'local-customer',
        },
        body: JSON.stringify({ idempotencyKey: 'export-2' }),
      }),
      fetch(`${baseUrl}/api/exports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mesh-customer-id': 'local-customer',
        },
        body: JSON.stringify({ idempotencyKey: 'export-3' }),
      }),
    ])

    const exhausted = await fetch(`${baseUrl}/api/exports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mesh-customer-id': 'local-customer',
      },
      body: JSON.stringify({ idempotencyKey: 'export-4' }),
    })
    const body = await exhausted.json()

    expect(exhausted.status).toBe(402)
    expect(body.error).toBe('No free exports or paid credits remain')
    expect(body.account.freeRemaining).toBe(0)
    expect(body.account.paidCredits).toBe(0)
  })

  it('supports legacy /api/generations path for compatibility', async () => {
    const response = await fetch(`${baseUrl}/api/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mesh-customer-id': 'local-customer',
      },
      body: JSON.stringify({ idempotencyKey: 'generation-compat' }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.transaction.type).toBe('export')
    expect(body.transaction.metadata.requestType).toBe('generation')
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

  it('serves current entry assets for stale hashed index asset requests', async () => {
    const distDir = await mkdtemp(path.join(os.tmpdir(), 'mesh-splitter-dist-'))
    const assetDir = path.join(distDir, 'assets')
    await mkdir(assetDir)
    await writeFile(path.join(distDir, 'index.html'), '<div id="app"></div>')
    await writeFile(path.join(assetDir, 'index-current.js'), 'console.log("current")')
    await writeFile(path.join(assetDir, 'index-current.css'), '.current{}')

    const assetServer = createServer({
      devCustomerBypass: true,
      shopifyAppProxySecret: 'proxy-secret',
      shopifyWebhookSecret: 'webhook-secret',
      frontendDistDir: distDir,
    })
    await new Promise(resolve => assetServer.listen(0, resolve))
    const assetBaseUrl = `http://127.0.0.1:${assetServer.address().port}`

    try {
      const jsResponse = await fetch(`${assetBaseUrl}/assets/index-stale.js`)
      const cssResponse = await fetch(`${assetBaseUrl}/assets/index-stale.css`)
      const missingResponse = await fetch(`${assetBaseUrl}/assets/vendor-stale.js`)

      expect(jsResponse.status).toBe(200)
      expect(jsResponse.headers.get('content-type')).toContain('text/javascript')
      await expect(jsResponse.text()).resolves.toContain('current')
      expect(cssResponse.status).toBe(200)
      expect(cssResponse.headers.get('content-type')).toContain('text/css')
      expect(missingResponse.status).toBe(404)
    } finally {
      await new Promise(resolve => assetServer.close(resolve))
      await rm(distDir, { recursive: true, force: true })
    }
  })
})
