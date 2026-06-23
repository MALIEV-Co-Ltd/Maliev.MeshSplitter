import { describe, expect, it } from 'vitest'
import { buildCustomerLoginUrl, normalizeReturnPath, storefrontReturnPath } from './customerLogin'

describe('customer login redirects', () => {
  it('builds a Shopify storefront login URL for the Mesh Splitter app page', () => {
    expect(buildCustomerLoginUrl({
      returnPath: '/tools/mesh-splitter/app',
      storeHomeUrl: 'https://shop.maliev.com/',
    })).toBe('https://shop.maliev.com/customer_authentication/login?return_to=%2Ftools%2Fmesh-splitter%2Fapp')
  })

  it('preserves relative query and hash return targets', () => {
    const returnPath = storefrontReturnPath({
      pathname: '/tools/mesh-splitter/app',
      search: '?lang=th',
      hash: '#export',
    })

    expect(returnPath).toBe('/tools/mesh-splitter/app?lang=th#export')
    expect(buildCustomerLoginUrl({
      returnPath,
      storeHomeUrl: 'https://shop.maliev.com/',
    })).toBe('https://shop.maliev.com/customer_authentication/login?return_to=%2Ftools%2Fmesh-splitter%2Fapp%3Flang%3Dth%23export')
  })

  it('rejects absolute or protocol-relative return targets', () => {
    expect(normalizeReturnPath('https://example.com/tools/mesh-splitter/app')).toBe('/tools/mesh-splitter')
    expect(normalizeReturnPath('//example.com/tools/mesh-splitter/app')).toBe('/tools/mesh-splitter')
  })
})
