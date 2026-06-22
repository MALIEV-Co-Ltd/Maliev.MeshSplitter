import { describe, expect, it } from 'vitest'
import { DatastoreCreditStore } from './datastoreCreditStore.js'

class FakeDatastore {
  constructor() {
    this.entities = new Map()
  }

  key(parts) {
    return parts.join(':')
  }

  async get(key) {
    return [this.entities.get(key)]
  }

  async save(entry) {
    if (Array.isArray(entry.data)) {
      this.entities.set(entry.key, Object.fromEntries(entry.data.map(field => [field.name, field.value])))
      return
    }
    this.entities.set(entry.key, entry.data)
  }
}

describe('DatastoreCreditStore', () => {
  it('creates and resets monthly free allowance accounts', async () => {
    const store = createStore()

    await expect(store.getAccount('customer-1', '2026-06')).resolves.toMatchObject({
      customerId: 'customer-1',
      period: '2026-06',
      freeUsed: 0,
      paidCredits: 0,
    })

    await store.saveAccount({
      customerId: 'customer-1',
      period: '2026-06',
      freeUsed: 3,
      paidCredits: 7,
    })

    await expect(store.getAccount('customer-1', '2026-07')).resolves.toMatchObject({
      customerId: 'customer-1',
      period: '2026-07',
      freeUsed: 0,
      paidCredits: 7,
    })
  })

  it('stores transactions and processed order markers', async () => {
    const store = createStore()
    const transaction = {
      idempotencyKey: 'txn-1',
      customerId: 'customer-1',
      type: 'paid-credit',
      credits: 10,
    }

    await store.saveTransaction(transaction)
    await expect(store.getTransaction('txn-1')).resolves.toEqual(transaction)

    await expect(store.hasProcessedOrder('order-1')).resolves.toBe(false)
    await store.markOrderProcessed('order-1')
    await expect(store.hasProcessedOrder('order-1')).resolves.toBe(true)
  })
})

function createStore() {
  const store = new DatastoreCreditStore()
  store.datastore = new FakeDatastore()
  return store
}
