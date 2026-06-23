import { describe, expect, it } from 'vitest'
import {
  SUPPORT_MARGIN_MM,
  calculateAutoDivisions,
  calculateSafeZone,
  effectiveBuildVolume,
} from './splitPlanning'

describe('calculateAutoDivisions', () => {
  it('reserves the support margin on X/Y so split parts stay printable', () => {
    const bounds = {
      min: { x: -10, y: 0, z: 5 },
      max: { x: 610, y: 250, z: 65 },
    }

    // X 620mm / (250 - 2*15 = 220) -> 3, Y 250mm / 220 -> 2, Z 60mm / 200 -> 1.
    expect(calculateAutoDivisions(bounds, [250, 250, 200])).toEqual([3, 2, 1])
  })

  it('applies the support margin per side (not as a single total reduction)', () => {
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 230, y: 10, z: 10 },
    }

    // 230mm fits in a 250 axis only if the margin is a single 15mm reduction.
    // With the per-side margin the usable axis is 220mm, so it must split in two.
    expect(calculateAutoDivisions(bounds, [250, 250, 250])[0]).toBe(2)
  })

  it('leaves Z at the full build volume (margin is X/Y only)', () => {
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 240 },
    }

    // 240mm fits a 250 Z axis because Z keeps the full build height.
    expect(calculateAutoDivisions(bounds, [250, 250, 250])[2]).toBe(1)
  })

  it('never returns fewer than one split on any axis', () => {
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    }

    expect(calculateAutoDivisions(bounds, [250, 250, 200])).toEqual([1, 1, 1])
  })

  it('accepts a custom margin', () => {
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 230, y: 10, z: 10 },
    }

    // With no margin a 230mm part fits a 250 axis in one piece.
    expect(calculateAutoDivisions(bounds, [250, 250, 250], 0)[0]).toBe(1)
  })
})

describe('effectiveBuildVolume', () => {
  it('shrinks X/Y by twice the margin and keeps Z', () => {
    expect(effectiveBuildVolume([250, 250, 250])).toEqual([
      250 - SUPPORT_MARGIN_MM * 2,
      250 - SUPPORT_MARGIN_MM * 2,
      250,
    ])
  })

  it('never collapses an axis below 1mm for tiny build volumes', () => {
    expect(effectiveBuildVolume([20, 20, 20])[0]).toBe(1)
  })
})

describe('calculateSafeZone', () => {
  it('reports the build volume, inner safe zone, and margin band', () => {
    expect(calculateSafeZone([256, 256, 256])).toEqual({
      margin: SUPPORT_MARGIN_MM,
      outer: [256, 256, 256],
      inner: [256 - 30, 256 - 30, 256],
    })
  })
})
