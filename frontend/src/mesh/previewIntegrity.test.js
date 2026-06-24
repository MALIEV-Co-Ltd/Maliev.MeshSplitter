import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { splitMeshManifold, validateManifold } from './meshProcessor'
import {
  allocatePreviewBudget,
  createPreviewGeometry,
  getGeometryFaceCount,
} from './previewGeometry'

// Reproduce the reported "broken mesh" preview end-to-end with the real
// manifold-3d split, then prove the two-part fix keeps the preview intact:
//   1. a realistic split-total fits the (raised) budget → no decimation at all
//   2. when a mesh genuinely exceeds the budget, decimation is hole-free
// A torus mirrors the reported toroidal ring: split into a grid it yields wildly
// non-uniform parts (long curved bands vs. tiny corner scraps).
const DEFAULT_BUDGET = 1_000_000

function splitDenseTorus() {
  const torus = new THREE.TorusGeometry(60, 22, 32, 64)
  return splitMeshManifold(new THREE.Mesh(torus), [40, 40, 40], [4, 4, 1])
}

// Fraction of edges used by only one triangle. A closed surface scores ~0; the
// old striding decimator left a torn shell that scored high.
function boundaryEdgeRatio(geometry) {
  const pos = geometry.attributes.position
  const key = (i) =>
    `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`
  const edges = new Map()
  const faces = getGeometryFaceCount(geometry)
  for (let f = 0; f < faces; f += 1) {
    const v = [key(f * 3), key(f * 3 + 1), key(f * 3 + 2)]
    for (let e = 0; e < 3; e += 1) {
      const a = v[e]
      const b = v[(e + 1) % 3]
      if (a === b) continue
      const id = a < b ? `${a}|${b}` : `${b}|${a}`
      edges.set(id, (edges.get(id) || 0) + 1)
    }
  }
  if (edges.size === 0) return 1
  let boundary = 0
  for (const count of edges.values()) if (count === 1) boundary += 1
  return boundary / edges.size
}

describe('split preview integrity', () => {
  it('produces watertight, undecimated split parts (the export is never broken)', async () => {
    const chunks = await splitDenseTorus()
    expect(chunks.length).toBeGreaterThan(2)
    chunks.forEach((chunk) => {
      expect(validateManifold(chunk.geometry).watertight).toBe(true)
    })
  })

  it('FIX: a realistic split-total fits the budget, so every preview part stays full-resolution', async () => {
    const chunks = await splitDenseTorus()
    const faceCounts = chunks.map((chunk) => getGeometryFaceCount(chunk.geometry))
    const total = faceCounts.reduce((a, b) => a + b, 0)

    // The reported persian-cat split-total (~170k) is far under the budget; this
    // torus likewise fits many times over. allocatePreviewBudget must hand back
    // full face counts — no decimation, nothing to tear.
    expect(total).toBeLessThan(DEFAULT_BUDGET)
    const targets = allocatePreviewBudget(faceCounts, DEFAULT_BUDGET)
    expect(targets).toEqual(faceCounts)

    chunks.forEach((chunk, i) => {
      const preview = createPreviewGeometry(chunk.geometry, { targetFaces: targets[i] })
      expect(preview.optimized).toBe(false)
      expect(getGeometryFaceCount(preview.geometry)).toBe(faceCounts[i])
      expect(validateManifold(preview.geometry).watertight).toBe(true)
    })
  })

  it('FIX: when a part genuinely exceeds the budget, decimation is hole-free (no torn shell)', async () => {
    const chunks = await splitDenseTorus()
    // Force the over-budget path with a tiny budget, weighted proportionally.
    const faceCounts = chunks.map((chunk) => getGeometryFaceCount(chunk.geometry))
    const tinyBudget = Math.floor(faceCounts.reduce((a, b) => a + b, 0) / 4)
    const targets = allocatePreviewBudget(faceCounts, tinyBudget)

    chunks.forEach((chunk, i) => {
      const preview = createPreviewGeometry(chunk.geometry, { targetFaces: targets[i] })
      const faces = getGeometryFaceCount(preview.geometry)
      expect(faces).toBeGreaterThan(0)
      expect(faces).toBeLessThanOrEqual(faceCounts[i])
      // The decimated preview is not punched full of holes the way the old
      // index-striding decimator did.
      expect(boundaryEdgeRatio(preview.geometry)).toBeLessThan(0.2)
    })
  })
})
