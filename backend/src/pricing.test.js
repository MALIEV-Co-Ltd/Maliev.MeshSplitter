import { describe, expect, it } from 'vitest'
import { CREDIT_PACKS, FREE_GENERATIONS_PER_MONTH, getCreditPackBySku } from './pricing.js'

describe('pricing', () => {
  it('includes a three-generation monthly free allowance', () => {
    expect(FREE_GENERATIONS_PER_MONTH).toBe(3)
  })

  it('defines launch credit packs from low-friction trial to studio volume', () => {
    expect(CREDIT_PACKS).toEqual([
      expect.objectContaining({ sku: 'MS-CREDITS-10', credits: 10, priceCents: 32900, currency: 'THB' }),
      expect.objectContaining({ sku: 'MS-CREDITS-30', credits: 30, priceCents: 87900, currency: 'THB' }),
      expect.objectContaining({ sku: 'MS-CREDITS-100', credits: 100, priceCents: 249000, currency: 'THB' }),
    ])
  })

  it('finds packs by Shopify line item SKU', () => {
    expect(getCreditPackBySku('MS-CREDITS-30')).toMatchObject({ credits: 30 })
    expect(getCreditPackBySku('unknown')).toBeNull()
  })
})
