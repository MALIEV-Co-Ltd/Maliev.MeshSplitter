import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from './server.js'
import { createHmac } from 'node:crypto'
import { signAppProxyQuery } from './shopifySecurity.js'

describe('HTTP API', () => {
  let baseUrl
  let server

  beforeEach(async () => {
    server = createServer({
      devCustomerBypass: true,
      shopifyAppProxySecret: 'proxy-secret',
      shopifyWebhookSecret: 'webhook-secret',
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
