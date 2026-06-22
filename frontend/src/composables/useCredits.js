import { readonly, ref } from 'vue'

const DEFAULT_ACCOUNT = {
  freeRemaining: 3,
  freeLimit: 3,
  paidCredits: 0,
  availableGenerations: 3,
}

const DEFAULT_PRICING = {
  freeGenerationsPerMonth: 3,
  creditPacks: [],
}

export function useCredits(options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? import.meta.env.VITE_MESH_API_BASE_URL ?? ''
  const enforcement = options.enforcement ?? import.meta.env.VITE_CREDITS_ENFORCEMENT ?? 'demo'
  const account = ref({ ...DEFAULT_ACCOUNT })
  const pricing = ref({ ...DEFAULT_PRICING })
  const loading = ref(false)
  const error = ref(null)

  async function refresh() {
    if (!apiBaseUrl) return
    loading.value = true
    error.value = null
    try {
      const [accountResponse, pricingResponse] = await Promise.all([
        request(`${apiBaseUrl}/account`),
        request(`${apiBaseUrl}/pricing`),
      ])
      account.value = accountResponse.account
      pricing.value = pricingResponse
    } catch (e) {
      error.value = e.message
      if (enforcement === 'required') throw e
    } finally {
      loading.value = false
    }
  }

  async function refreshPricing() {
    if (!apiBaseUrl) return
    loading.value = true
    error.value = null
    try {
      pricing.value = await request(`${apiBaseUrl}/pricing`)
    } catch (e) {
      error.value = e.message
      if (enforcement === 'required') throw e
    } finally {
      loading.value = false
    }
  }

  async function consumeExport({ idempotencyKey, metadata = {} }) {
    if (!apiBaseUrl) {
      if (enforcement === 'required') {
        throw new Error('Credit authorization is unavailable')
      }
      return { source: 'local_demo', account: account.value }
    }

    loading.value = true
    error.value = null
    try {
      const response = await request(`${apiBaseUrl}/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, metadata }),
      })
      account.value = response.account
      return response.transaction
    } catch (e) {
      error.value = e.message || 'Credit authorization is unavailable'
      throw new Error(error.value === 'Failed to fetch' ? 'Credit authorization is unavailable' : error.value)
    } finally {
      loading.value = false
    }
  }

  async function consumeGeneration({ idempotencyKey, metadata = {} }) {
    return consumeExport({ idempotencyKey, metadata })
  }

  return {
    account: readonly(account),
    pricing: readonly(pricing),
    loading: readonly(loading),
    error: readonly(error),
    refresh,
    refreshPricing,
    consumeExport,
    consumeGeneration,
  }
}

async function request(url, options) {
  try {
    const response = await fetch(url, options)
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(body.error || `Request failed with ${response.status}`)
    }
    return body
  } catch (e) {
    if (e instanceof TypeError || e.message === 'network down') {
      throw new Error('Credit authorization is unavailable')
    }
    throw e
  }
}
