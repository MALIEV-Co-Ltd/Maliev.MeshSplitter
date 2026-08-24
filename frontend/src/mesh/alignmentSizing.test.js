import { describe, expect, it } from 'vitest'
import { estimatePlaMassGrams, sizeAlignmentPlug } from './alignmentSizing'

describe('alignment plug sizing', () => {
  it('converts solid volume to a PLA handling-mass estimate', () => {
    expect(estimatePlaMassGrams(1000)).toBeCloseTo(1.24, 6)
  })

  it('selects monotonic alignment bands without treating mass as a load rating', () => {
    const common = { faceAreaMm2: 900, localThicknessMm: 16, clearance: 0.3, requestedCount: 2 }
    const small = sizeAlignmentPlug({ ...common, partVolumesMm3: [5_000, 4_000] })
    const large = sizeAlignmentPlug({ ...common, partVolumesMm3: [200_000, 150_000] })

    expect(large.widthMm).toBeGreaterThan(small.widthMm)
    expect(large.purpose).toBe('alignment-only')
    expect(large.loadBearing).toBe(false)
    expect(large.densityGPerCm3).toBe(1.24)
  })

  it('clamps the plug to local wall thickness and available face area', () => {
    const resolved = sizeAlignmentPlug({
      partVolumesMm3: [80_000, 60_000],
      faceAreaMm2: 64,
      localThicknessMm: 4,
      clearance: 0.3,
      requestedCount: 4,
    })

    expect(resolved.viable).toBe(true)
    expect(resolved.depthMm).toBeLessThanOrEqual(1.6)
    expect(resolved.count).toBe(1)
  })

  it('fails closed when no printable alignment pocket safely fits', () => {
    expect(sizeAlignmentPlug({
      partVolumesMm3: [10_000, 8_000],
      faceAreaMm2: 9,
      localThicknessMm: 1.2,
      clearance: 0.3,
      requestedCount: 1,
    })).toMatchObject({ viable: false, reason: 'no-safe-fit' })
  })
})
