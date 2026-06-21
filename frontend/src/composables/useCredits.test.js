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
    await credits.refresh()

    expect(credits.account.value.availableGenerations).toBe(3)
    expect(credits.pricing.value.creditPacks[0].sku).toBe('MS-CREDITS-10')
  })

  it('posts generation consumption with a stable idempotency key', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      transaction: { source: 'free_monthly' },
      account: { freeRemaining: 2, paidCredits: 0, availableGenerations: 2 },
    }))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })
    const result = await credits.consumeGeneration({
      idempotencyKey: 'mesh:test.stl:2x2x1',
      metadata: { filename: 'test.stl' },
    })

    expect(result.source).toBe('free_monthly')
    expect(fetch).toHaveBeenCalledWith('/api/generations', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'mesh:test.stl:2x2x1',
        metadata: { filename: 'test.stl' },
      }),
    }))
    expect(credits.account.value.availableGenerations).toBe(2)
  })

  it('fails closed when required enforcement cannot reach the API', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'))

    const credits = useCredits({ apiBaseUrl: '/api', enforcement: 'required' })

    await expect(credits.consumeGeneration({
      idempotencyKey: 'mesh:test.stl:1x1x1',
    })).rejects.toThrow('Credit authorization is unavailable')
  })

  it('allows demo mode without an API for local testing', async () => {
    const credits = useCredits({ apiBaseUrl: '', enforcement: 'demo' })

    await expect(credits.consumeGeneration({
      idempotencyKey: 'mesh:test.stl:1x1x1',
    })).resolves.toMatchObject({ source: 'local_demo' })
  })
})

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }
}
