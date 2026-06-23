import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectorConfig from '../ConnectorConfig.vue'

describe('ConnectorConfig', () => {
  it('renders connector options with reference links', async () => {
    const wrapper = mount(ConnectorConfig)
    await wrapper.get('.conn-select-trigger').trigger('click')
    expect(wrapper.text()).toContain('Dowel')
    expect(wrapper.text()).toContain('Mortise & Tenon')
    expect(wrapper.text()).toContain('Key')
    expect(wrapper.findAll('a').map((a) => a.attributes('href')).some((href) => href.includes('wikipedia.org'))).toBe(true)
  })

  it('emits a Mortise & Tenon config by default', () => {
    const wrapper = mount(ConnectorConfig)
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual({
      type: 'Mortise & Tenon',
      depth: 5,
      clearance: 0.3,
      perFace: 1,
      tenonWidth: 6,
      tenonThickness: 4,
    })
  })

  it('emits dowel payload with diameter/depth when selected', async () => {
    const wrapper = mount(ConnectorConfig)
    await selectConnector(wrapper, 'Dowel')

    const payload = wrapper.emitted('update:modelValue').at(-1)[0]
    expect(payload).toEqual({
      type: 'Dowel',
      depth: 5,
      clearance: 0.3,
      perFace: 1,
      diameter: 6,
    })
  })

  it('emits mortise payload with tenon dimensions when selected', async () => {
    const wrapper = mount(ConnectorConfig)
    await selectConnector(wrapper, 'Mortise & Tenon')

    const payload = wrapper.emitted('update:modelValue').at(-1)[0]
    expect(payload).toEqual({
      type: 'Mortise & Tenon',
      depth: 5,
      clearance: 0.3,
      perFace: 1,
      tenonWidth: 6,
      tenonThickness: 4,
    })
  })

  it('emits key payload with key dimensions when selected', async () => {
    const wrapper = mount(ConnectorConfig)
    await selectConnector(wrapper, 'Key')

    const payload = wrapper.emitted('update:modelValue').at(-1)[0]
    expect(payload).toEqual({
      type: 'Key',
      depth: 5,
      clearance: 0.3,
      perFace: 1,
      keyWidth: 6,
      keyHeight: 3.5,
    })
  })

  it('keeps options hidden until the select is opened', async () => {
    const wrapper = mount(ConnectorConfig)
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)

    await wrapper.get('.conn-select-trigger').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="option"]')).toHaveLength(4)
  })
})

async function selectConnector(wrapper, label) {
  await wrapper.get('.conn-select-trigger').trigger('click')
  const option = wrapper.findAll('[role="option"]').find((candidate) => candidate.text().includes(label))
  expect(option).toBeTruthy()
  await option.trigger('click')
}
