import { useMediaQuery } from '@vueuse/core'

// Single source of truth for the mobile breakpoint. Matches the CSS
// `@media (max-width: 700px)` block so layout and behaviour switch together.
export function useIsMobile() {
  return useMediaQuery('(max-width: 700px)')
}
