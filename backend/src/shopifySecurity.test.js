import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  createSignedSession,
  createOAuthState,
  signAppProxyQuery,
  signShopifyOAuthQuery,
  verifyAppProxyIdentity,
  verifyOAuthState,
  verifyShopifyOAuthCallback,
  verifyShopifyWebhookHmac,
  verifySignedSession,
} from './shopifySecurity.js'

describe('shopifySecurity', () => {
  it('verifies signed app proxy customer identity', () => {
    const secret = 'shared-secret'
    const query = {
      shop: 'example.myshopify.com',
      path_prefix: '/tools/mesh-splitter',
      timestamp: '1782050000',
      logged_in_customer_id: '12345',
    }
    const signature = signAppProxyQuery(query, secret)

    expect(verifyAppProxyIdentity({ ...query, signature }, secret)).toEqual({
      customerId: 'shopify:12345',
      shop: 'example.myshopify.com',
    })
  })

  it('rejects tampered app proxy signatures', () => {
    expect(() => verifyAppProxyIdentity({
      shop: 'example.myshopify.com',
      logged_in_customer_id: '12345',
      signature: 'bad',
    }, 'shared-secret')).toThrow('Invalid Shopify app proxy signature')
  })

  it('verifies Shopify webhook HMAC over the raw body', () => {
    const secret = 'webhook-secret'
    const rawBody = Buffer.from(JSON.stringify({ id: 1 }))
    const hmac = createHmac('sha256', secret).update(rawBody).digest('base64')

    expect(verifyShopifyWebhookHmac(rawBody, hmac, secret)).toBe(true)
    expect(verifyShopifyWebhookHmac(Buffer.from('{}'), hmac, secret)).toBe(false)
  })

  it('verifies Shopify OAuth callback HMAC', () => {
    const query = {
      shop: 'example.myshopify.com',
      code: 'install-code',
      state: 'state-token',
      timestamp: '1782050000',
    }
    const hmac = signShopifyOAuthQuery(query, 'shared-secret')

    expect(verifyShopifyOAuthCallback({ ...query, hmac }, 'shared-secret')).toEqual({
      shop: 'example.myshopify.com',
      code: 'install-code',
    })
  })

  it('rejects tampered Shopify OAuth callback HMACs', () => {
    expect(() => verifyShopifyOAuthCallback({
      shop: 'example.myshopify.com',
      code: 'install-code',
      state: 'state-token',
      hmac: 'bad',
    }, 'shared-secret')).toThrow('Invalid Shopify OAuth HMAC')
  })

  it('round-trips signed Shopify OAuth state', () => {
    const state = createOAuthState({
      shop: 'example.myshopify.com',
      nonce: 'nonce',
      timestamp: 1782050000,
    }, 'session-secret')

    expect(verifyOAuthState(state, 'session-secret')).toMatchObject({
      shop: 'example.myshopify.com',
      nonce: 'nonce',
    })
  })

  it('round-trips a signed customer session cookie', () => {
    const cookie = createSignedSession({ customerId: 'shopify:12345', shop: 'example.myshopify.com' }, 'session-secret')

    expect(verifySignedSession(cookie, 'session-secret')).toEqual({
      customerId: 'shopify:12345',
      shop: 'example.myshopify.com',
    })
  })

  it('rejects tampered customer session cookies', () => {
    const cookie = createSignedSession({ customerId: 'shopify:12345', shop: 'example.myshopify.com' }, 'session-secret')

    expect(() => verifySignedSession(`${cookie}tampered`, 'session-secret')).toThrow('Invalid customer session')
  })
})
