import { describe, expect, it } from 'vitest'
import { calculateAutoDivisions } from './splitPlanning'

describe('calculateAutoDivisions', () => {
  it('calculates the minimum XYZ split counts required by mesh bounds and build volume', () => {
    const bounds = {
      min: { x: -10, y: 0, z: 5 },
      max: { x: 610, y: 250, z: 65 },
    }

    expect(calculateAutoDivisions(bounds, [250, 250, 200])).toEqual([3, 1, 1])
  })

  it('never returns fewer than one split on any axis', () => {
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    }

    expect(calculateAutoDivisions(bounds, [250, 250, 200])).toEqual([1, 1, 1])
  })
})
