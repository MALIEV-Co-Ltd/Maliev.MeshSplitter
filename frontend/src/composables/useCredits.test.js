import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCredits } from './useCredits'

describe('useCredits', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn()
  })

  it('loads account and pricing from the credit API', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({
        account: { freeRemaining: 3, paidCredits: 0, availableGenerations: 3 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        freeGenerationsPerMonth: 3,
        creditPacks: [{ sku: 'MS-CREDITS-10', credits: 10, priceCents: 900 }],
      }))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    expect(credits.hasAccountData.value).toBe(false)
    await credits.refresh()

    expect(credits.account.value.availableGenerations).toBe(3)
    expect(credits.hasAccountData.value).toBe(true)
    expect(credits.pricing.value.creditPacks[0].sku).toBe('MS-CREDITS-10')
  })

  it('keeps the app in public free mode when the account API returns anonymous state', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({
        authenticated: false,
        account: null,
      }))
      .mockResolvedValueOnce(jsonResponse({
        freeGenerationsPerMonth: 3,
        creditPacks: [{ sku: 'MS-CREDITS-10', credits: 10, priceCents: 900 }],
      }))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    await credits.refresh()

    expect(credits.error.value).toBeNull()
    expect(credits.hasAccountData.value).toBe(false)
    expect(credits.account.value.availableGenerations).toBe(3)
    expect(credits.account.value.freeRemaining).toBe(3)
  })

  it('loads public pricing without requesting the protected account endpoint', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      freeGenerationsPerMonth: 3,
      creditPacks: [{ sku: 'MS-CREDITS-30', credits: 30, priceCents: 87900 }],
    }))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    await credits.refreshPricing()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/pricing', undefined)
    expect(credits.pricing.value.creditPacks[0].sku).toBe('MS-CREDITS-30')
  })

  it('loads public pricing and signed-in account data when available', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({
        freeGenerationsPerMonth: 3,
        creditPacks: [{ sku: 'MS-CREDITS-30', credits: 30, priceCents: 87900 }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        account: { freeRemaining: 2, paidCredits: 5, availableGenerations: 7 },
      }))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    await credits.refreshPublic()

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/pricing', undefined)
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/account', undefined)
    expect(credits.pricing.value.creditPacks[0].sku).toBe('MS-CREDITS-30')
    expect(credits.account.value.availableGenerations).toBe(7)
    expect(credits.hasAccountData.value).toBe(true)
  })

  it('keeps public pricing when public account lookup returns anonymous state', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({
        freeGenerationsPerMonth: 3,
        creditPacks: [{ sku: 'MS-CREDITS-30', credits: 30, priceCents: 87900 }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        authenticated: false,
        account: null,
      }))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    await credits.refreshPublic()

    expect(credits.pricing.value.creditPacks[0].sku).toBe('MS-CREDITS-30')
    expect(credits.hasAccountData.value).toBe(false)
    expect(credits.error.value).toBeNull()
  })

  it('keeps public pricing when anonymous account lookup is unavailable', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({
        freeGenerationsPerMonth: 3,
        creditPacks: [{ sku: 'MS-CREDITS-10', credits: 10, priceCents: 32900 }],
      }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Shopify customer login is required' }, 400))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    await credits.refreshPublic()

    expect(credits.pricing.value.creditPacks[0].sku).toBe('MS-CREDITS-10')
    expect(credits.hasAccountData.value).toBe(false)
    expect(credits.error.value).toBeNull()
  })

  it('posts export consumption with a stable idempotency key', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      transaction: { source: 'free_monthly' },
      account: { freeRemaining: 2, paidCredits: 0, availableGenerations: 2 },
      authorization: {
        token: 'signed-export-token',
        exportId: 'mesh:test.stl:2x2x1',
        fingerprint: 'ABCDEF1234567890',
      },
    }))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    const result = await credits.consumeExport({
      idempotencyKey: 'mesh:test.stl:2x2x1',
      metadata: { filename: 'test.stl' },
    })

    expect(result.source).toBe('free_monthly')
    expect(result.authorization).toMatchObject({
      token: 'signed-export-token',
      fingerprint: 'ABCDEF1234567890',
    })
    expect(fetch).toHaveBeenCalledWith('/api/exports', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'mesh:test.stl:2x2x1',
        metadata: { filename: 'test.stl' },
      }),
    }))
    expect(credits.account.value.availableGenerations).toBe(2)
  })

  it('posts export completion with the signed authorization token', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      ok: true,
      exportId: 'mesh:test.stl:2x2x1',
      fingerprint: 'ABCDEF1234567890',
    }))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    const result = await credits.completeExport({
      authorizationToken: 'signed-export-token',
      metadata: { packageFilename: 'test-package.zip' },
    })

    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/api/exports/complete', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorizationToken: 'signed-export-token',
        metadata: { packageFilename: 'test-package.zip' },
      }),
    }))
  })

  it('fails closed when required enforcement cannot reach the API', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })

    await expect(credits.consumeExport({
      idempotencyKey: 'mesh:test.stl:1x1x1',
    })).rejects.toThrow('Credit authorization is unavailable')
  })

  it('fails with the API error when credits are exhausted', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      error: 'No free exports or paid credits remain',
      account: { freeRemaining: 0, paidCredits: 0, availableGenerations: 0 },
    }, 402))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })

    await expect(credits.consumeExport({
      idempotencyKey: 'mesh:test.stl:1x1x1',
    })).rejects.toThrow('No free exports or paid credits remain')
    expect(credits.error.value).toBe('No free exports or paid credits remain')
  })

  it('allows demo mode without an API for tests', async () => {
    const credits = useCredits({ apiBaseUrl: '', enforcement: 'demo' })

    await expect(credits.consumeExport({
      idempotencyKey: 'mesh:test.stl:1x1x1',
    })).resolves.toMatchObject({ source: 'demo_export' })
    expect(credits.hasAccountData.value).toBe(false)
  })
})

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }
}
