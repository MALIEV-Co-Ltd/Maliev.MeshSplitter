import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import SplitConfig from '../SplitConfig.vue'

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

describe('SplitConfig', () => {
  it('renders sliders for X Y Z', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: false, err: '' }
    })
    expect(wrapper.text()).toContain('X')
    expect(wrapper.text()).toContain('Y')
    expect(wrapper.text()).toContain('Z')
  })

  it('also renders the connector picker inline', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: false, err: '' }
    })
    expect(wrapper.text()).toContain('Dowel')
    expect(wrapper.text()).toContain('Connectors')
  })

  it('split button is disabled when ok is false', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: false, err: '' }
    })
    // The connector pills are real <button role="radio"> elements that
    // precede the submit button in the DOM, so target the last one.
    const btn = wrapper.findAll('button').at(-1)
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('split button is enabled when ok is true', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '' }
    })
    const btn = wrapper.findAll('button').at(-1)
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('shows total parts count', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '' }
    })
    expect(wrapper.text()).toContain('parts')
  })

  it('emits split with the build volume, divisions, and connector config together', async () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '', divisions: [2, 2, 1] }
    })
    await wrapper.get('[for="conn-Dowel"]').trigger('click')
    await wrapper.findAll('button').at(-1).trigger('click')

    const [volume, divisions, connectorConfig] = wrapper.emitted('split')[0]
    expect(volume).toEqual([250, 250, 250])
    expect(divisions).toEqual([2, 2, 1])
    expect(connectorConfig).toEqual({
      type: 'Dowel',
      depth: 10,
      clearance: 0.1,
      perFace: 1,
      diameter: 6,
    })
  })
})
