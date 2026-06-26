import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useIsMobile } from './useIsMobile'

describe('useIsMobile', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((q) => ({
      matches: q.includes('700px'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  it('is true when the viewport matches the mobile query', () => {
    expect(useIsMobile().value).toBe(true)
  })
})
