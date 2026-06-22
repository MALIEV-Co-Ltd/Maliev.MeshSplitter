import { beforeEach, describe, expect, it } from 'vitest'
import { CreditLedger, InsufficientCreditsError } from './creditLedger.js'
import { MemoryCreditStore } from './stores/memoryCreditStore.js'

describe('CreditLedger', () => {
  let ledger

  beforeEach(() => {
    ledger = new CreditLedger({
      store: new MemoryCreditStore(),
      now: () => new Date('2026-06-21T12:00:00.000Z'),
    })
  })

  it('allows exactly three free exports per customer each month', async () => {
    await ledger.consumeExport('customer-1', { idempotencyKey: 'gen-1' })
    await ledger.consumeExport('customer-1', { idempotencyKey: 'gen-2' })
    const third = await ledger.consumeExport('customer-1', { idempotencyKey: 'gen-3' })

    expect(third.source).toBe('free_monthly')
    await expect(
      ledger.consumeExport('customer-1', { idempotencyKey: 'gen-4' })
    ).rejects.toBeInstanceOf(InsufficientCreditsError)
  })

  it('uses paid credits after the monthly allowance is exhausted', async () => {
    await ledger.addCredits('customer-1', 2, { source: 'manual-test', idempotencyKey: 'grant-1' })

    await ledger.consumeExport('customer-1', { idempotencyKey: 'gen-1' })
    await ledger.consumeExport('customer-1', { idempotencyKey: 'gen-2' })
    await ledger.consumeExport('customer-1', { idempotencyKey: 'gen-3' })
    const fourth = await ledger.consumeExport('customer-1', { idempotencyKey: 'gen-4' })

    expect(fourth.source).toBe('paid_credit')
    await expect(ledger.getAccount('customer-1')).resolves.toMatchObject({
      paidCredits: 1,
      freeRemaining: 0,
    })
  })

  it('is idempotent for repeated export requests', async () => {
    const first = await ledger.consumeExport('customer-1', { idempotencyKey: 'same-request' })
    const second = await ledger.consumeExport('customer-1', { idempotencyKey: 'same-request' })

    expect(second).toEqual(first)
    await expect(ledger.getAccount('customer-1')).resolves.toMatchObject({
      freeUsed: 1,
      freeRemaining: 2,
    })
  })
})
