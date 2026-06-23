export const STOREFRONT_BASE_PATH = '/tools/mesh-splitter'

export function buildCustomerLoginUrl({
  returnPath,
  storeHomeUrl = 'https://shop.maliev.com/',
  fallbackPath = STOREFRONT_BASE_PATH,
} = {}) {
  const loginUrl = new URL('/customer_authentication/login', storeHomeUrl)
  loginUrl.searchParams.set('return_to', normalizeReturnPath(returnPath, fallbackPath))
  return loginUrl.toString()
}

export function storefrontReturnPath(location = window.location, fallbackPath = STOREFRONT_BASE_PATH) {
  const pathname = typeof location?.pathname === 'string' ? location.pathname : fallbackPath
  const search = typeof location?.search === 'string' ? location.search : ''
  const hash = typeof location?.hash === 'string' ? location.hash : ''
  return normalizeReturnPath(`${pathname}${search}${hash}`, fallbackPath)
}

export function normalizeReturnPath(returnPath, fallbackPath = STOREFRONT_BASE_PATH) {
  if (typeof returnPath !== 'string') return fallbackPath
  if (!returnPath.startsWith('/') || returnPath.startsWith('//')) return fallbackPath
  return returnPath
}
