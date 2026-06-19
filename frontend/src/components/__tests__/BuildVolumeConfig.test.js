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

  it('renders preset buttons', () => {
    const wrapper = mount(BuildVolumeConfig, {
      props: { modelValue: [250, 250, 250] }
    })
    expect(wrapper.text()).toContain('X1C')
    expect(wrapper.text()).toContain('MK4')
    expect(wrapper.text()).toContain('V2.4')
  })

  it('emits update:modelValue on preset click', async () => {
    const wrapper = mount(BuildVolumeConfig, {
      props: { modelValue: [250, 250, 250] }
    })
    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[250, 210, 220]])
  })
})
