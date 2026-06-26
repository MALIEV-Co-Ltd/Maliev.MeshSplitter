import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasUploadOverlay from '../CanvasUploadOverlay.vue'

describe('CanvasUploadOverlay', () => {
  it('shows the upload prompt when no mesh is loaded', () => {
    const wrapper = mount(CanvasUploadOverlay, { props: { hasMesh: false } })
    expect(wrapper.find('[data-testid="canvas-dropzone"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="canvas-replace"]').exists()).toBe(false)
  })

  it('shows only the Replace button when a mesh is loaded', () => {
    const wrapper = mount(CanvasUploadOverlay, { props: { hasMesh: true } })
    expect(wrapper.find('[data-testid="canvas-dropzone"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="canvas-replace"]').exists()).toBe(true)
  })

  it('emits upload when a valid file is selected', async () => {
    const wrapper = mount(CanvasUploadOverlay, { props: { hasMesh: false } })
    const input = wrapper.find('input[type="file"]')
    const file = new File([new Uint8Array(10)], 'a.stl', { type: 'model/stl' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(wrapper.emitted('upload')?.[0][0]).toBe(file)
  })
})
