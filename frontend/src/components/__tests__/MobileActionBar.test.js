import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MobileActionBar from '../MobileActionBar.vue'

describe('MobileActionBar', () => {
  it('disables split when canSplit is false', () => {
    const wrapper = mount(MobileActionBar, { props: { canSplit: false, hasChunks: false } })
    expect(wrapper.find('[data-testid="bar-split"]').attributes('disabled')).toBeDefined()
  })

  it('disables export when there are no chunks', () => {
    const wrapper = mount(MobileActionBar, { props: { canSplit: true, hasChunks: false } })
    expect(wrapper.find('[data-testid="bar-export"]').attributes('disabled')).toBeDefined()
  })

  it('emits split and export-package on click', async () => {
    const wrapper = mount(MobileActionBar, { props: { canSplit: true, hasChunks: true } })
    await wrapper.find('[data-testid="bar-split"]').trigger('click')
    await wrapper.find('[data-testid="bar-export"]').trigger('click')
    expect(wrapper.emitted('split')).toBeTruthy()
    expect(wrapper.emitted('export-package')).toBeTruthy()
  })

  it('shows the credit cost label on the export button', () => {
    const wrapper = mount(MobileActionBar, {
      props: { canSplit: true, hasChunks: true, cost: { label: '1 credit' } },
    })
    expect(wrapper.find('[data-testid="bar-export"]').text()).toContain('1 credit')
  })
})
