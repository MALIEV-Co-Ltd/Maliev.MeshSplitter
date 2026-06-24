import { FREE_GENERATIONS_PER_MONTH } from './pricing.js'

// The monthly free allowance is normally the global default, but staff accounts
// (resolved per-request from the customer's email domain) get a higher limit
// passed in. A non-positive/missing value always falls back to the default.
function resolveFreeLimit(freeLimit) {
  return Number.isInteger(freeLimit) && freeLimit > 0 ? freeLimit : FREE_GENERATIONS_PER_MONTH
}

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

  async getAccount(customerId, { freeLimit } = {}) {
    const account = await this.store.getAccount(normalizeCustomerId(customerId), this.#period())
    return this.#publicAccount(account, freeLimit)
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

  async consumeGeneration(customerId, { idempotencyKey, metadata = {}, freeLimit } = {}) {
    return this.consumeExport(customerId, { idempotencyKey, metadata, freeLimit })
  }

  async consumeExport(customerId, { idempotencyKey, metadata = {}, freeLimit } = {}) {
    if (!idempotencyKey) throw new Error('idempotencyKey is required')

    const existing = await this.store.getTransaction(idempotencyKey)
    if (existing) return existing

    const normalizedCustomerId = normalizeCustomerId(customerId)
    const account = await this.store.getAccount(normalizedCustomerId, this.#period())
    const limit = resolveFreeLimit(freeLimit)
    let source

    if (account.freeUsed < limit) {
      account.freeUsed += 1
      source = 'free_monthly'
    } else if (account.paidCredits > 0) {
      account.paidCredits -= 1
      source = 'paid_credit'
    } else {
      throw new InsufficientCreditsError(this.#publicAccount(account, freeLimit))
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
      account: this.#publicAccount(account, freeLimit),
    }
    await this.store.saveTransaction(transaction)
    return transaction
  }

  async recordExportCompletion(customerId, { idempotencyKey, authorization, metadata = {} }) {
    if (!idempotencyKey) throw new Error('idempotencyKey is required')
    if (!authorization?.exportId || !authorization?.fingerprint) {
      throw new Error('authorization is required')
    }

    const existing = await this.store.getTransaction(idempotencyKey)
    if (existing) return existing

    const normalizedCustomerId = normalizeCustomerId(customerId)
    const account = await this.store.getAccount(normalizedCustomerId, this.#period())
    const transaction = {
      idempotencyKey,
      customerId: normalizedCustomerId,
      type: 'export_complete',
      source: 'authorized_export',
      exportId: authorization.exportId,
      fingerprint: authorization.fingerprint,
      metadata,
      createdAt: this.now().toISOString(),
      account: this.#publicAccount(account),
    }
    await this.store.saveTransaction(transaction)
    return transaction
  }

  async resetCustomerAccount(customerId) {
    const normalizedCustomerId = normalizeCustomerId(customerId)
    const account = await this.store.getAccount(normalizedCustomerId, this.#period())
    const resetAccount = {
      ...account,
      freeUsed: 0,
      paidCredits: 0,
      updatedAt: this.now().toISOString(),
    }

    if (typeof this.store.resetAccount === 'function') {
      await this.store.resetAccount(resetAccount)
      return this.#publicAccount(await this.store.getAccount(normalizedCustomerId, this.#period()))
    }

    await this.store.saveAccount(resetAccount)
    return this.#publicAccount(resetAccount)
  }

  async resetAllAccounts() {
    if (typeof this.store.resetAllAccounts !== 'function') {
      throw new Error('Reset all accounts is not supported by this store')
    }
    const period = this.#period()
    await this.store.resetAllAccounts(period)
    return { ok: true, period }
  }

  #period() {
    const date = this.now()
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }

  #publicAccount(account, freeLimit) {
    const limit = resolveFreeLimit(freeLimit)
    const freeRemaining = Math.max(0, limit - account.freeUsed)
    return {
      customerId: account.customerId,
      period: account.period,
      freeUsed: account.freeUsed,
      freeRemaining,
      freeLimit: limit,
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
