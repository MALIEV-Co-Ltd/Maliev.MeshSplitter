import { beforeEach, describe, expect, it } from 'vitest'
import { CreditLedger } from './creditLedger.js'
import { applyPaidOrderCredits } from './shopifyOrders.js'
import { MemoryCreditStore } from './stores/memoryCreditStore.js'

describe('applyPaidOrderCredits', () => {
  let ledger

  beforeEach(() => {
    ledger = new CreditLedger({
      store: new MemoryCreditStore(),
      now: () => new Date('2026-06-21T12:00:00.000Z'),
    })
  })

  it('credits the Shopify customer based on paid credit-pack line items', async () => {
    const result = await applyPaidOrderCredits(ledger, {
      id: 5001,
      customer: { id: 9001 },
      line_items: [
        { sku: 'MS-CREDITS-10', quantity: 2 },
        { sku: 'IGNORED-SKU', quantity: 1 },
      ],
    })

    expect(result).toEqual({ customerId: 'shopify:9001', creditsAdded: 20, orderId: '5001' })
    await expect(ledger.getAccount('shopify:9001')).resolves.toMatchObject({ paidCredits: 20 })
  })

  it('does not double-credit the same Shopify order', async () => {
    const order = {
      id: 5001,
      customer: { id: 9001 },
      line_items: [{ sku: 'MS-CREDITS-30', quantity: 1 }],
    }

    await applyPaidOrderCredits(ledger, order)
    await applyPaidOrderCredits(ledger, order)

    await expect(ledger.getAccount('shopify:9001')).resolves.toMatchObject({ paidCredits: 30 })
  })

  it('rejects credit orders that are not tied to a Shopify customer account', async () => {
    await expect(
      applyPaidOrderCredits(ledger, {
        id: 5002,
        line_items: [{ sku: 'MS-CREDITS-10', quantity: 1 }],
      })
    ).rejects.toThrow('Shopify order is missing a customer id')
  })
})
