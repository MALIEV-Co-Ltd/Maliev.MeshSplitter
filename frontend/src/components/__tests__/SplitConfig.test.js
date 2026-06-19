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

  it('split button is disabled when ok is false', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: false, err: '' }
    })
    const btn = wrapper.find('button')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('split button is enabled when ok is true', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '' }
    })
    const btn = wrapper.find('button')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('shows total parts count', () => {
    const wrapper = mount(SplitConfig, {
      props: { v: [250, 250, 250], ok: true, err: '' }
    })
    expect(wrapper.text()).toContain('parts')
  })
})
