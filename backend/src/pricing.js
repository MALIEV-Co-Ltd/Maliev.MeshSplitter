export const FREE_GENERATIONS_PER_MONTH = 3

export const CREDIT_PACKS = Object.freeze([
  {
    sku: 'MS-CREDITS-10',
    handle: 'mesh-splitter-10-credits',
    name: 'Starter Credit Pack',
    credits: 10,
    priceCents: 900,
    currency: 'USD',
    bestFor: 'Trying real customer parts after the monthly free allowance.',
  },
  {
    sku: 'MS-CREDITS-30',
    handle: 'mesh-splitter-30-credits',
    name: 'Maker Credit Pack',
    credits: 30,
    priceCents: 2400,
    currency: 'USD',
    bestFor: 'Regular makers splitting several large models per month.',
  },
  {
    sku: 'MS-CREDITS-100',
    handle: 'mesh-splitter-100-credits',
    name: 'Studio Credit Pack',
    credits: 100,
    priceCents: 6900,
    currency: 'USD',
    bestFor: 'Print farms, studios, and service bureaus.',
  },
])

export function getCreditPackBySku(sku) {
  if (!sku) return null
  return CREDIT_PACKS.find(pack => pack.sku === sku) || null
}

export function serializePricing() {
  return {
    freeGenerationsPerMonth: FREE_GENERATIONS_PER_MONTH,
    creditPacks: CREDIT_PACKS,
  }
}
