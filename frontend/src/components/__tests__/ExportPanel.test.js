import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ExportPanel from '../ExportPanel.vue'

describe('ExportPanel', () => {
  it('disables the package button and shows a spinner while preparing', () => {
    const wrapper = mount(ExportPanel, {
      props: {
        hasChunks: true,
        loading: true,
      },
    })

    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Preparing package')
    expect(wrapper.find('.animate-spin').exists()).toBe(true)
  })

  it('emits export-package when ready', async () => {
    const wrapper = mount(ExportPanel, {
      props: {
        hasChunks: true,
        loading: false,
      },
    })

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('export-package')).toHaveLength(1)
  })
})
