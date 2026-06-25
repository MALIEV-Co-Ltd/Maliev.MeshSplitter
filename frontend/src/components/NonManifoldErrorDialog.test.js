import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NonManifoldErrorDialog from './NonManifoldErrorDialog.vue'

describe('NonManifoldErrorDialog', () => {
  it('renders holes and edges stats', () => {
    const wrapper = mount(NonManifoldErrorDialog, {
      props: { boundaryHoles: 3, boundaryEdges: 42, labels: {} },
    })
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('42')
  })

  it('is a non-blocking panel, not a modal dialog', () => {
    const wrapper = mount(NonManifoldErrorDialog, {
      props: { boundaryHoles: 1, boundaryEdges: 5, labels: {} },
    })
    // A modal <dialog> would cover the canvas with a backdrop; this must stay a
    // plain alertdialog panel so the 3D problem-edge overlay remains visible.
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
  })

  it('emits view-problem on primary button click', async () => {
    const wrapper = mount(NonManifoldErrorDialog, {
      props: { boundaryHoles: 1, boundaryEdges: 5, labels: {} },
    })
    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('view-problem')).toBeTruthy()
  })

  it('emits dismiss on dismiss button click', async () => {
    const wrapper = mount(NonManifoldErrorDialog, {
      props: { boundaryHoles: 1, boundaryEdges: 5, labels: {} },
    })
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    expect(wrapper.emitted('dismiss')).toBeTruthy()
  })
})
