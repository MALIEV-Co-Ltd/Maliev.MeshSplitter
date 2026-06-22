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
})
