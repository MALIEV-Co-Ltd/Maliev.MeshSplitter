import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AccordionSection from '../AccordionSection.vue'

describe('AccordionSection', () => {
  it('renders the title and hides content (display:none) when closed', () => {
    const wrapper = mount(AccordionSection, {
      props: { title: 'Build volume', open: false },
      slots: { default: '<p class="body">hi</p>' },
    })
    expect(wrapper.text()).toContain('Build volume')
    expect(wrapper.find('.body').isVisible()).toBe(false)
  })

  it('emits toggle when the header is clicked', async () => {
    const wrapper = mount(AccordionSection, { props: { title: 'Scale', open: true } })
    await wrapper.find('.acc-head').trigger('click')
    expect(wrapper.emitted('toggle')).toBeTruthy()
  })

  it('shows slot content when open', () => {
    const wrapper = mount(AccordionSection, {
      props: { title: 'Scale', open: true },
      slots: { default: '<p class="body">hi</p>' },
    })
    expect(wrapper.find('.body').isVisible()).toBe(true)
  })
})
