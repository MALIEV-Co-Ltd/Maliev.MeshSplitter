import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MeshUploader from '../MeshUploader.vue'

describe('MeshUploader', () => {
  it('renders upload prompt when no mesh', () => {
    const wrapper = mount(MeshUploader, {
      props: { meshInfo: null, loading: false, error: '' }
    })
    expect(wrapper.text()).toContain('Drag & drop')
  })

  it('shows the loaded-file summary once a mesh is loaded', () => {
    const wrapper = mount(MeshUploader, {
      props: {
        meshInfo: { filename: 'test.stl', verts: 100, faces: 50, is_watertight: true, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } } },
        loading: false,
        error: '',
      }
    })
    expect(wrapper.text()).toContain('test.stl')
    // Replace control moved into the panel header once a mesh is loaded.
    expect(wrapper.text()).toContain('Replace file')
    // Watertight status is shown in the top status bar and canvas mesh-details,
    // not duplicated here, so no "Watertight" label appears in this panel.
    expect(wrapper.text()).not.toContain('Watertight')
    expect(wrapper.text()).not.toContain('100')
    expect(wrapper.text()).not.toContain('50')
    expect(wrapper.text()).not.toContain('vertices')
    expect(wrapper.text()).not.toContain('faces')
    // The drop prompt is replaced by the summary once a mesh is loaded.
    expect(wrapper.text()).not.toContain('Drag & drop')
  })

  it('asks for optional material files after an OBJ is selected', async () => {
    const wrapper = mount(MeshUploader, {
      props: { meshInfo: null, loading: false, error: '' },
    })
    const input = wrapper.get('[data-testid="mesh-file-input"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['v 0 0 0'], 'figure.obj', { type: 'text/plain' })],
    })

    await input.trigger('change')

    expect(wrapper.text()).toContain('figure.obj')
    expect(wrapper.text()).toContain('Add MTL / textures')
    expect(wrapper.text()).toContain('Continue without materials')
    expect(wrapper.emitted('upload')).toBeUndefined()
  })

  it('renders the mesh thumbnail image when one is provided', () => {
    const wrapper = mount(MeshUploader, {
      props: {
        meshInfo: { filename: 'test.stl', verts: 100, faces: 50, is_watertight: true, thumbnail: 'data:image/png;base64,AAAA', bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } } },
        loading: false,
        error: '',
      }
    })
    const img = wrapper.find('.mesh-loaded__thumb img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,AAAA')
  })

  it('shows loading state', () => {
    const wrapper = mount(MeshUploader, {
      props: { meshInfo: null, loading: true, error: '' }
    })
    expect(wrapper.text()).toContain('Loading')
  })

  it('shows error message', () => {
    const wrapper = mount(MeshUploader, {
      props: { meshInfo: null, loading: false, error: 'Test error' }
    })
    expect(wrapper.text()).toContain('Test error')
  })
})
