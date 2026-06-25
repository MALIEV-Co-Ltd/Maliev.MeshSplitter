import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PartList from '../PartList.vue'

describe('PartList', () => {
  it('emits selected chunk index when clicked', async () => {
    const wrapper = mount(PartList, {
      props: {
        chunks: [
          { index: 0, label: 'P01', volume: 500, color: 0xff0000 },
          { index: 1, label: 'P02', volume: 600, color: 0x00ff00 },
        ],
      },
    })

    const cards = wrapper.findAll('.cursor-pointer')
    await cards[1].trigger('click')

    expect(wrapper.emitted('select')?.[0][0]).toEqual(1)
  })

  it('marks the selected chunk card', () => {
    const wrapper = mount(PartList, {
      props: {
        chunks: [{ index: 0, label: 'P01', volume: 500 }],
        selectedChunkIndex: 0,
      },
    })

    const card = wrapper.find('.cursor-pointer')
    expect(card.classes()).toContain('ring-2')
  })

  it('consolidates key chunks into a single row and selects the first key when clicked', async () => {
    const wrapper = mount(PartList, {
      props: {
        chunks: [
          { index: 0, label: 'P01', volume: 500, color: 0xff0000 },
          { index: 1, label: 'Key', volume: 50, color: 0xffd700, isKey: true },
          { index: 2, label: 'Key', volume: 50, color: 0xffd700, isKey: true },
        ],
      },
    })

    const rows = wrapper.findAll('.cursor-pointer')
    expect(rows).toHaveLength(2)

    // The consolidated key row is pinned to the top of the list.
    expect(rows[0].text()).toContain('Key x2')
    await rows[0].trigger('click')

    expect(wrapper.emitted('select')?.[0][0]).toEqual(1)
  })

  it('shows bounding box on its own line and volume with faces on the next', () => {
    const wrapper = mount(PartList, {
      props: {
        chunks: [
          { index: 0, label: 'P01', volume: 2070400, faces: 29912, dims: { x: 153, y: 154, z: 158 }, color: 0xff0000 },
        ],
      },
    })

    const metaLines = wrapper.findAll('.pl-meta')
    expect(metaLines[0].text()).toBe('153 × 154 × 158 mm')
    expect(metaLines[0].text()).not.toContain('faces')
    expect(metaLines[1].text()).toBe('2070.4 cm³ · 29,912 faces')
  })
})
