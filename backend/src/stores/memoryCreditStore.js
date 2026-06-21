export class MemoryCreditStore {
  constructor() {
    this.accounts = new Map()
    this.transactions = new Map()
    this.orders = new Set()
  }

  async getAccount(customerId, period) {
    return this.#ensureAccount(customerId, period)
  }

  async saveAccount(account) {
    this.accounts.set(account.customerId, { ...account })
    return { ...account }
  }

  async getTransaction(idempotencyKey) {
    const transaction = this.transactions.get(idempotencyKey)
    return transaction ? { ...transaction } : null
  }

  async saveTransaction(transaction) {
    this.transactions.set(transaction.idempotencyKey, { ...transaction })
    return { ...transaction }
  }

  async hasProcessedOrder(orderId) {
    return this.orders.has(orderId)
  }

  async markOrderProcessed(orderId) {
    this.orders.add(orderId)
  }

  #ensureAccount(customerId, period) {
    const existing = this.accounts.get(customerId)
    if (existing) {
      if (existing.period !== period) {
        existing.period = period
        existing.freeUsed = 0
      }
      return { ...existing }
    }

    const account = {
      customerId,
      period,
      freeUsed: 0,
      paidCredits: 0,
      updatedAt: new Date().toISOString(),
    }
    this.accounts.set(customerId, account)
    return { ...account }
  }
}
