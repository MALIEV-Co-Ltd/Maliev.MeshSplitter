import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BuildVolumeConfig from '../BuildVolumeConfig.vue'

describe('BuildVolumeConfig', () => {
  it('renders 3 number inputs for X Y Z', () => {
    const wrapper = mount(BuildVolumeConfig, {
      props: { modelValue: [250, 250, 250] }
    })
    const inputs = wrapper.findAll('input[type="number"]')
    expect(inputs).toHaveLength(3)
  })

  it('renders preset selector with common printers', async () => {
    const wrapper = mount(BuildVolumeConfig, {
      props: { modelValue: [250, 250, 250] }
    })
    await wrapper.find('#build-volume-preset').trigger('click')
    expect(wrapper.text()).toContain('Bambu Lab X1C')
    expect(wrapper.text()).toContain('Prusa MK4')
    expect(wrapper.text()).toContain('Anycubic Kobra Max')
  })

  it('shows build volume on the second line of each preset row', async () => {
    const wrapper = mount(BuildVolumeConfig, {
      props: { modelValue: [250, 250, 250] }
    })
    await wrapper.find('#build-volume-preset').trigger('click')
    expect(wrapper.text()).toContain('256 × 256 × 250 mm')
  })

  it('emits update:modelValue on preset select', async () => {
    const wrapper = mount(BuildVolumeConfig, {
      props: { modelValue: [250, 250, 250] }
    })
    await wrapper.find('#build-volume-preset').trigger('click')
    const options = wrapper.findAll('.bv-option')
    const prusaMk4 = options.find((option) => option.text().includes('Prusa MK4 / MK4S'))
    await prusaMk4.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[250, 210, 220]])
  })

  it('returns to custom mode on manual edit', async () => {
    const wrapper = mount(BuildVolumeConfig, {
      props: { modelValue: [250, 250, 250] }
    })
    const xInput = wrapper.find('#build-volume-X')
    await xInput.setValue('333')

    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([[333, 250, 250]])
  })
})
