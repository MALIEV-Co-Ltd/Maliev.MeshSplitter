import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { analyzeBoundaries, assertBoundaryAnalysisBudget, MAX_BOUNDARY_ANALYSIS_TRIANGLES } from './boundaryAnalysis'

function steppedSolid(segments = 12) {
  const profile = [
    { radius: 5, z: -5 },
    { radius: 5, z: 0 },
    { radius: 3, z: 0 },
    { radius: 3, z: 5 },
  ]
  const vertices = []
  for (const ring of profile) {
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments
      vertices.push(ring.radius * Math.cos(angle), ring.radius * Math.sin(angle), ring.z)
    }
  }
  vertices.push(0, 0, -5, 0, 0, 5)
  const bottom = profile.length * segments
  const top = bottom + 1
  const indices = []
  for (let ring = 0; ring < profile.length - 1; ring++) {
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments
      const a = ring * segments + i
      const b = ring * segments + next
      const c = (ring + 1) * segments + i
      const d = (ring + 1) * segments + next
      indices.push(a, b, c, b, d, c)
    }
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments
    indices.push(bottom, next, i)
    const lastRing = (profile.length - 1) * segments
    indices.push(top, lastRing + i, lastRing + next)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

describe('analyzeBoundaries', () => {
  it('uses the same inclusive 1,500,000-triangle limit as model import', () => {
    expect(MAX_BOUNDARY_ANALYSIS_TRIANGLES).toBe(1_500_000)
    expect(() => assertBoundaryAnalysisBudget(1_500_000)).not.toThrow()
    expect(() => assertBoundaryAnalysisBudget(1_500_001)).toThrow('supports up to 1,500,000 triangles')
  })

  it('finds deterministic closed sharp loops that partition a stepped solid', () => {
    const geometry = steppedSolid()

    const first = analyzeBoundaries({ geometry }, { mode: 'feature', sharpAngleDeg: 40, maxCandidates: 8 })
    const second = analyzeBoundaries({ geometry }, { mode: 'feature', sharpAngleDeg: 40, maxCandidates: 8 })

    expect(first.length).toBeGreaterThanOrEqual(2)
    expect(first.map(({ id }) => id)).toEqual(second.map(({ id }) => id))
    expect(first.every((candidate) => candidate.loops[0].length === 12)).toBe(true)
    expect(first.every((candidate) => candidate.sideFaces.length === 2)).toBe(true)
  })

  it('uses triangle color regions as a closed split boundary even when the surface is smooth', () => {
    const geometry = steppedSolid()
    const nonIndexed = geometry.toNonIndexed()
    const position = nonIndexed.attributes.position
    const regions = new Uint32Array(position.count / 3)
    for (let face = 0; face < regions.length; face++) {
      const z = (position.getZ(face * 3) + position.getZ(face * 3 + 1) + position.getZ(face * 3 + 2)) / 3
      regions[face] = z < 0 ? 0 : 1
    }

    const candidates = analyzeBoundaries({ geometry: nonIndexed, triangleRegions: regions }, { mode: 'color' })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].loops[0]).toHaveLength(12)
    expect(candidates[0].metrics.regionPair).toEqual([0, 1])
  })

  it('rejects selected edge chains that do not close', () => {
    const geometry = new THREE.PlaneGeometry(10, 10, 2, 1).toNonIndexed()
    const regions = Uint32Array.from([0, 0, 1, 1])

    expect(analyzeBoundaries({ geometry, triangleRegions: regions }, { mode: 'color' })).toEqual([])
  })
})
