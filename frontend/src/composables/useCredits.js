import { readonly, ref } from 'vue'

const DEFAULT_ACCOUNT = {
  freeRemaining: 3,
  freeLimit: 3,
  paidCredits: 0,
  availableGenerations: 3,
}

const DEFAULT_PRICING = {
  freeGenerationsPerMonth: 3,
  creditPacks: [
    {
      sku: 'MS-CREDITS-10',
      handle: 'mesh-splitter-starter-credit-pack',
      name: 'Starter Credit Pack',
      credits: 10,
      priceCents: 32900,
      currency: 'THB',
      bestFor: 'Trying real customer parts after the monthly free allowance.',
    },
    {
      sku: 'MS-CREDITS-30',
      handle: 'mesh-splitter-maker-credit-pack',
      name: 'Maker Credit Pack',
      credits: 30,
      priceCents: 87900,
      currency: 'THB',
      bestFor: 'Regular makers splitting several large models per month.',
    },
    {
      sku: 'MS-CREDITS-100',
      handle: 'mesh-splitter-studio-credit-pack',
      name: 'Studio Credit Pack',
      credits: 100,
      priceCents: 249000,
      currency: 'THB',
      bestFor: 'Print farms, studios, and service bureaus.',
    },
  ],
}

export function useCredits(options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? import.meta.env.VITE_MESH_API_BASE_URL ?? ''
  const enforcement = options.enforcement ?? import.meta.env.VITE_CREDITS_ENFORCEMENT ?? 'demo'
  const account = ref({ ...DEFAULT_ACCOUNT })
  const pricing = ref({ ...DEFAULT_PRICING })
  const loading = ref(Boolean(apiBaseUrl))
  const error = ref(null)
  const hasAccountData = ref(false)

  async function refresh() {
    if (!apiBaseUrl) return
    loading.value = true
    error.value = null
    try {
      const [accountResponse, pricingResponse] = await Promise.all([
        request(`${apiBaseUrl}/account`),
        request(`${apiBaseUrl}/pricing`),
      ])
      pricing.value = pricingResponse
      applyAccountResponse(accountResponse)
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

  async function refreshPublic() {
    if (!apiBaseUrl) return
    loading.value = true
    error.value = null
    try {
      pricing.value = await request(`${apiBaseUrl}/pricing`)
      try {
        const accountResponse = await request(`${apiBaseUrl}/account`)
        applyAccountResponse(accountResponse)
      } catch {
        hasAccountData.value = false
      }
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
      hasAccountData.value = true
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
    hasAccountData: readonly(hasAccountData),
    refresh,
    refreshPricing,
    refreshPublic,
    consumeExport,
    consumeGeneration,
  }

  function applyAccountResponse(response) {
    if (response?.account) {
      account.value = response.account
      hasAccountData.value = true
      return
    }

    const freeLimit = Number(pricing.value.freeGenerationsPerMonth ?? DEFAULT_ACCOUNT.freeLimit)
    account.value = {
      ...DEFAULT_ACCOUNT,
      freeLimit,
      freeRemaining: freeLimit,
      availableGenerations: freeLimit,
    }
    hasAccountData.value = false
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
