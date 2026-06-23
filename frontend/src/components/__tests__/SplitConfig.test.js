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
  it('shows automatic X Y Z split counts without manual sliders', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: false, err: '', divisions: [3, 1, 1] }
    })
    expect(wrapper.text()).toContain('X')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.findComponent({ name: 'Slider' }).exists()).toBe(false)
  })

  it('also renders the connector picker inline', async () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: false, err: '' }
    })
    expect(wrapper.text()).toContain('None')
    expect(wrapper.text()).toContain('Connectors')
    await wrapper.get('.conn-select-trigger').trigger('click')
    expect(wrapper.text()).toContain('Dowel')
  })

  it('split button is disabled when ok is false', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: false, err: '' }
    })
    const btn = wrapper.get('button.w-full')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('split button is enabled when ok is true', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '' }
    })
    const btn = wrapper.get('button.w-full')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('shows total parts count', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '' }
    })
    expect(wrapper.text()).toContain('parts')
  })

  it('shows a connector warning instead of splitting silently when connector type is none', async () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '', divisions: [2, 2, 1] }
    })

    await wrapper.get('button.w-full').trigger('click')

    expect(wrapper.emitted('split')).toBeUndefined()
    expect(wrapper.text()).toContain('No connector selected')
    expect(wrapper.text()).toContain('Split without connectors')
  })

  it('confirms the connector warning before splitting without connectors', async () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '', divisions: [2, 2, 1] }
    })

    await wrapper.get('button.w-full').trigger('click')
    await wrapper.get('[data-testid="confirm-split-without-connectors"]').trigger('click')

    const [volume, divisions, connectorConfig] = wrapper.emitted('split')[0]
    expect(volume).toEqual([250, 250, 250])
    expect(divisions).toEqual([2, 2, 1])
    expect(connectorConfig).toEqual({ type: 'None' })
  })

  it('emits split with the build volume, automatic divisions, and connector config together', async () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '', divisions: [2, 2, 1] }
    })
    await wrapper.get('.conn-select-trigger').trigger('click')
    const dowelOption = wrapper.findAll('[role="option"]').find((candidate) => candidate.text().includes('Dowel'))
    expect(dowelOption).toBeTruthy()
    await dowelOption.trigger('click')
    await wrapper.get('button.w-full').trigger('click')

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
