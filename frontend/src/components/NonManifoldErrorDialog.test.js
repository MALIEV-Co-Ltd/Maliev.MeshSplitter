import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import NonManifoldErrorDialog from './NonManifoldErrorDialog.vue'

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
    }
  }
})

describe('NonManifoldErrorDialog', () => {
  it('renders holes and edges stats', () => {
    const wrapper = mount(NonManifoldErrorDialog, {
      props: { boundaryHoles: 3, boundaryEdges: 42, labels: {} },
    })
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('42')
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
