import { Datastore } from '@google-cloud/datastore'

export class DatastoreCreditStore {
  constructor({ projectId, namespace } = {}) {
    this.datastore = new Datastore({ projectId, namespace })
  }

  async getAccount(customerId, period) {
    const key = this.#accountKey(customerId)
    const [entity] = await this.datastore.get(key)
    if (!entity) {
      const account = {
        customerId,
        period,
        freeUsed: 0,
        paidCredits: 0,
        updatedAt: new Date(),
      }
      await this.datastore.save({ key, data: account })
      return serializeAccount(account)
    }

    if (entity.period !== period) {
      const account = {
        ...entity,
        customerId,
        period,
        freeUsed: 0,
        updatedAt: new Date(),
      }
      await this.datastore.save({ key, data: account })
      return serializeAccount(account)
    }

    return serializeAccount({ ...entity, customerId })
  }

  async saveAccount(account) {
    const saved = {
      customerId: account.customerId,
      period: account.period,
      freeUsed: account.freeUsed,
      paidCredits: account.paidCredits,
      updatedAt: new Date(),
    }
    await this.datastore.save({ key: this.#accountKey(account.customerId), data: saved })
    return serializeAccount(saved)
  }

  async getTransaction(idempotencyKey) {
    const [entity] = await this.datastore.get(this.#transactionKey(idempotencyKey))
    return entity?.payload || null
  }

  async saveTransaction(transaction) {
    await this.datastore.save({
      key: this.#transactionKey(transaction.idempotencyKey),
      data: [
        { name: 'idempotencyKey', value: transaction.idempotencyKey },
        { name: 'customerId', value: transaction.customerId },
        { name: 'type', value: transaction.type },
        { name: 'payload', value: transaction, excludeFromIndexes: true },
        { name: 'createdAt', value: new Date() },
      ],
    })
    return transaction
  }

  async hasProcessedOrder(orderId) {
    const [entity] = await this.datastore.get(this.#processedOrderKey(orderId))
    return Boolean(entity)
  }

  async markOrderProcessed(orderId) {
    await this.datastore.save({
      key: this.#processedOrderKey(orderId),
      data: {
        orderId,
        processedAt: new Date(),
      },
    })
  }

  async resetAccount(customerId) {
    const targetCustomerId = typeof customerId === 'string'
      ? customerId
      : customerId?.customerId
    const account = await this.getAccount(String(targetCustomerId), this.#periodFromNow())
    account.freeUsed = 0
    account.paidCredits = 0
    account.updatedAt = new Date().toISOString()
    await this.saveAccount(account)
    return account
  }

  async resetAllAccounts() {
    const [accountEntities] = await this.datastore.runQuery(this.datastore.createQuery('CreditAccount'))
    if (accountEntities.length > 0) {
      const accountKeys = accountEntities.map(entity => entity[Datastore.KEY])
      await this.datastore.delete(accountKeys)
    }
    const [transactionEntities] = await this.datastore.runQuery(this.datastore.createQuery('CreditTransaction'))
    if (transactionEntities.length > 0) {
      const transactionKeys = transactionEntities.map(entity => entity[Datastore.KEY])
      await this.datastore.delete(transactionKeys)
    }
    const [orderEntities] = await this.datastore.runQuery(this.datastore.createQuery('ProcessedShopifyOrder'))
    if (orderEntities.length > 0) {
      const orderKeys = orderEntities.map(entity => entity[Datastore.KEY])
      await this.datastore.delete(orderKeys)
    }
    return { allReset: true }
  }

  #accountKey(customerId) {
    return this.datastore.key(['CreditAccount', customerId])
  }

  #transactionKey(idempotencyKey) {
    return this.datastore.key(['CreditTransaction', idempotencyKey])
  }

  #processedOrderKey(orderId) {
    return this.datastore.key(['ProcessedShopifyOrder', orderId])
  }

  #periodFromNow() {
    const date = new Date()
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }
}

function serializeAccount(account) {
  return {
    customerId: account.customerId,
    period: account.period,
    freeUsed: Number(account.freeUsed || 0),
    paidCredits: Number(account.paidCredits || 0),
    updatedAt: account.updatedAt instanceof Date ? account.updatedAt.toISOString() : account.updatedAt,
  }
}
