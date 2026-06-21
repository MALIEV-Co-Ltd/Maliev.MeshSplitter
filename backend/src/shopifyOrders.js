import { getCreditPackBySku } from './pricing.js'

export async function applyPaidOrderCredits(ledger, order) {
  const orderId = String(order?.id || '')
  if (!orderId) throw new Error('Shopify order is missing an id')

  const customerId = getShopifyCustomerId(order)
  if (!customerId) throw new Error('Shopify order is missing a customer id')

  if (await ledger.store.hasProcessedOrder(orderId)) {
    return { customerId, creditsAdded: 0, orderId, duplicate: true }
  }

  const creditsAdded = (order.line_items || []).reduce((sum, item) => {
    const pack = getCreditPackBySku(item.sku)
    if (!pack) return sum
    return sum + pack.credits * Number(item.quantity || 1)
  }, 0)

  if (creditsAdded > 0) {
    await ledger.addCredits(customerId, creditsAdded, {
      source: 'shopify_order_paid',
      idempotencyKey: `shopify-order:${orderId}`,
    })
  }

  await ledger.store.markOrderProcessed(orderId)
  return { customerId, creditsAdded, orderId }
}

function getShopifyCustomerId(order) {
  const customerId = order?.customer?.id || order?.customer_id
  return customerId ? `shopify:${customerId}` : null
}
