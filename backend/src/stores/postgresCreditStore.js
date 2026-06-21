import pg from 'pg'

export class PostgresCreditStore {
  constructor({ connectionString }) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    })
    this.ready = this.#init()
  }

  async getAccount(customerId, period) {
    await this.ready
    await this.pool.query(
      `insert into credit_accounts (customer_id, period, free_used, paid_credits, updated_at)
       values ($1, $2, 0, 0, now())
       on conflict (customer_id) do nothing`,
      [customerId, period]
    )

    const result = await this.pool.query(
      'select customer_id, period, free_used, paid_credits, updated_at from credit_accounts where customer_id = $1',
      [customerId]
    )
    const account = result.rows[0]
    if (account.period !== period) {
      const reset = await this.pool.query(
        `update credit_accounts
         set period = $2, free_used = 0, updated_at = now()
         where customer_id = $1
         returning customer_id, period, free_used, paid_credits, updated_at`,
        [customerId, period]
      )
      return mapAccount(reset.rows[0])
    }

    return mapAccount(account)
  }

  async saveAccount(account) {
    await this.ready
    const result = await this.pool.query(
      `update credit_accounts
       set period = $2, free_used = $3, paid_credits = $4, updated_at = now()
       where customer_id = $1
       returning customer_id, period, free_used, paid_credits, updated_at`,
      [account.customerId, account.period, account.freeUsed, account.paidCredits]
    )
    return mapAccount(result.rows[0])
  }

  async getTransaction(idempotencyKey) {
    await this.ready
    const result = await this.pool.query(
      'select payload from credit_transactions where idempotency_key = $1',
      [idempotencyKey]
    )
    return result.rows[0]?.payload || null
  }

  async saveTransaction(transaction) {
    await this.ready
    await this.pool.query(
      `insert into credit_transactions (idempotency_key, customer_id, type, payload, created_at)
       values ($1, $2, $3, $4, now())
       on conflict (idempotency_key) do nothing`,
      [transaction.idempotencyKey, transaction.customerId, transaction.type, transaction]
    )
    return transaction
  }

  async hasProcessedOrder(orderId) {
    await this.ready
    const result = await this.pool.query(
      'select order_id from processed_shopify_orders where order_id = $1',
      [orderId]
    )
    return result.rowCount > 0
  }

  async markOrderProcessed(orderId) {
    await this.ready
    await this.pool.query(
      `insert into processed_shopify_orders (order_id, processed_at)
       values ($1, now())
       on conflict (order_id) do nothing`,
      [orderId]
    )
  }

  async #init() {
    await this.pool.query(`
      create table if not exists credit_accounts (
        customer_id text primary key,
        period text not null,
        free_used integer not null default 0,
        paid_credits integer not null default 0,
        updated_at timestamptz not null default now()
      );

      create table if not exists credit_transactions (
        idempotency_key text primary key,
        customer_id text not null,
        type text not null,
        payload jsonb not null,
        created_at timestamptz not null default now()
      );

      create table if not exists processed_shopify_orders (
        order_id text primary key,
        processed_at timestamptz not null default now()
      );
    `)
  }
}

function mapAccount(row) {
  return {
    customerId: row.customer_id,
    period: row.period,
    freeUsed: Number(row.free_used),
    paidCredits: Number(row.paid_credits),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}
