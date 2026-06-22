import { FREE_GENERATIONS_PER_MONTH } from './pricing.js'

export class InsufficientCreditsError extends Error {
  constructor(account) {
    super('No free exports or paid credits remain')
    this.name = 'InsufficientCreditsError'
    this.statusCode = 402
    this.account = account
  }
}

export class CreditLedger {
  constructor({ store, now = () => new Date() }) {
    if (!store) throw new Error('CreditLedger requires a store')
    this.store = store
    this.now = now
  }

  async getAccount(customerId) {
    const account = await this.store.getAccount(normalizeCustomerId(customerId), this.#period())
    return this.#publicAccount(account)
  }

  async addCredits(customerId, credits, { source, idempotencyKey }) {
    if (!Number.isInteger(credits) || credits <= 0) {
      throw new Error('credits must be a positive integer')
    }
    if (!idempotencyKey) throw new Error('idempotencyKey is required')

    const existing = await this.store.getTransaction(idempotencyKey)
    if (existing) return existing

    const normalizedCustomerId = normalizeCustomerId(customerId)
    const account = await this.store.getAccount(normalizedCustomerId, this.#period())
    account.paidCredits += credits
    account.updatedAt = this.now().toISOString()
    await this.store.saveAccount(account)

    const transaction = {
      idempotencyKey,
      customerId: normalizedCustomerId,
      type: 'credit_grant',
      source,
      creditsAdded: credits,
      createdAt: this.now().toISOString(),
      account: this.#publicAccount(account),
    }
    await this.store.saveTransaction(transaction)
    return transaction
  }

  async consumeGeneration(customerId, { idempotencyKey, metadata = {} }) {
    return this.consumeExport(customerId, { idempotencyKey, metadata })
  }

  async consumeExport(customerId, { idempotencyKey, metadata = {} }) {
    if (!idempotencyKey) throw new Error('idempotencyKey is required')

    const existing = await this.store.getTransaction(idempotencyKey)
    if (existing) return existing

    const normalizedCustomerId = normalizeCustomerId(customerId)
    const account = await this.store.getAccount(normalizedCustomerId, this.#period())
    let source

    if (account.freeUsed < FREE_GENERATIONS_PER_MONTH) {
      account.freeUsed += 1
      source = 'free_monthly'
    } else if (account.paidCredits > 0) {
      account.paidCredits -= 1
      source = 'paid_credit'
    } else {
      throw new InsufficientCreditsError(this.#publicAccount(account))
    }

    account.updatedAt = this.now().toISOString()
    await this.store.saveAccount(account)

    const transaction = {
      idempotencyKey,
      customerId: normalizedCustomerId,
      type: 'export',
      source,
      metadata,
      createdAt: this.now().toISOString(),
      account: this.#publicAccount(account),
    }
    await this.store.saveTransaction(transaction)
    return transaction
  }

  #period() {
    const date = this.now()
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }

  #publicAccount(account) {
    const freeRemaining = Math.max(0, FREE_GENERATIONS_PER_MONTH - account.freeUsed)
    return {
      customerId: account.customerId,
      period: account.period,
      freeUsed: account.freeUsed,
      freeRemaining,
      freeLimit: FREE_GENERATIONS_PER_MONTH,
      paidCredits: account.paidCredits,
      availableGenerations: freeRemaining + account.paidCredits,
      updatedAt: account.updatedAt,
    }
  }
}

function normalizeCustomerId(customerId) {
  if (!customerId) throw new Error('customerId is required')
  return String(customerId)
}
