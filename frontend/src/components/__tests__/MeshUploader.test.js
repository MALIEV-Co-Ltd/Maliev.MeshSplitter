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

  it('shows watertight status without rendering mesh metadata rows', () => {
    const wrapper = mount(MeshUploader, {
      props: {
        meshInfo: { filename: 'test.stl', verts: 100, faces: 50, is_watertight: true, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } } },
        loading: false,
        error: '',
      }
    })
    expect(wrapper.text()).toContain('Watertight')
    expect(wrapper.text()).not.toContain('test.stl')
    expect(wrapper.text()).not.toContain('Vertices')
  })

  it('shows loading state', () => {
    const wrapper = mount(MeshUploader, {
      props: { meshInfo: null, loading: true, error: '' }
    })
    expect(wrapper.text()).toContain('Uploading')
  })

  it('shows error message', () => {
    const wrapper = mount(MeshUploader, {
      props: { meshInfo: null, loading: false, error: 'Test error' }
    })
    expect(wrapper.text()).toContain('Test error')
  })
})
