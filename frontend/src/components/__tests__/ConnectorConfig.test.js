import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectorConfig from '../ConnectorConfig.vue'

describe('ConnectorConfig', () => {
  it('renders connector options with reference links', () => {
    const wrapper = mount(ConnectorConfig)
    expect(wrapper.text()).toContain('Dowel')
    expect(wrapper.text()).toContain('Mortise & Tenon')
    expect(wrapper.text()).toContain('Key')
    expect(wrapper.findAll('a').map((a) => a.attributes('href')).some((href) => href.includes('wikipedia.org'))).toBe(true)
  })

  it('emits dowel payload with diameter/depth when applying', async () => {
    const wrapper = mount(ConnectorConfig)
    await wrapper.get('[for="conn-Dowel"]').trigger('click')
    expect(typeof wrapper.vm.onApply).toBe('function')
    await wrapper.vm.onApply()

    const payload = wrapper.emitted('apply')[0][0]
    expect(payload).toEqual({
      type: 'Dowel',
      depth: 10,
      clearance: 0.1,
      perFace: 1,
      diameter: 6,
    })
  })

  it('emits mortise payload with tenon dimensions', async () => {
    const wrapper = mount(ConnectorConfig)
    await wrapper.get('[for="conn-Mortise & Tenon"]').trigger('click')
    expect(typeof wrapper.vm.onApply).toBe('function')
    await wrapper.vm.onApply()

    const payload = wrapper.emitted('apply')[0][0]
    expect(payload).toEqual({
      type: 'Mortise & Tenon',
      depth: 10,
      clearance: 0.1,
      perFace: 1,
      tenonWidth: 6,
      tenonThickness: 4,
    })
  })

  it('emits key payload with key dimensions', async () => {
    const wrapper = mount(ConnectorConfig)
    await wrapper.get('[for="conn-Key"]').trigger('click')
    expect(typeof wrapper.vm.onApply).toBe('function')
    await wrapper.vm.onApply()

    const payload = wrapper.emitted('apply')[0][0]
    expect(payload).toEqual({
      type: 'Key',
      depth: 10,
      clearance: 0.1,
      perFace: 1,
      keyWidth: 6,
      keyHeight: 3.5,
    })
  })
})
