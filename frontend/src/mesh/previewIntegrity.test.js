import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { splitMeshManifold, validateManifold } from './meshProcessor'
import {
  allocatePreviewBudget,
  createPreviewGeometry,
  getGeometryFaceCount,
} from './previewGeometry'

// Reproduce the reported "broken mesh" preview end-to-end with the real
// manifold-3d split, then prove the budget-allocation fix keeps the preview
// intact. A torus mirrors the reported toroidal ring: split into a grid it
// yields wildly non-uniform parts (long curved bands vs. tiny corner scraps).
function splitDenseTorus() {
  const torus = new THREE.TorusGeometry(60, 22, 32, 64)
  return splitMeshManifold(new THREE.Mesh(torus), [40, 40, 40], [4, 4, 1])
}

// The exact (old) per-chunk equal-division budget that produced the holes.
function equalDivision(faceCounts, budget) {
  return faceCounts.map(() => Math.max(12, Math.floor(budget / faceCounts.length)))
}

function buildPreviewChunks(chunks, budget, allocate) {
  const faceCounts = chunks.map((chunk) => getGeometryFaceCount(chunk.geometry))
  const targets = allocate(faceCounts, budget)
  return chunks.map((chunk, i) => createPreviewGeometry(chunk.geometry, { targetFaces: targets[i] }))
}

describe('split preview integrity', () => {
  it('produces watertight, undecimated split parts (the export is never broken)', async () => {
    const chunks = await splitDenseTorus()
    expect(chunks.length).toBeGreaterThan(2)
    chunks.forEach((chunk) => {
      expect(validateManifold(chunk.geometry).watertight).toBe(true)
    })
  })

  it('REPRO: equal per-chunk division tears large parts into holey shells even though the assembly fits the budget', async () => {
    const chunks = await splitDenseTorus()
    const faceCounts = chunks.map((chunk) => getGeometryFaceCount(chunk.geometry))
    const total = faceCounts.reduce((a, b) => a + b, 0)
    const max = Math.max(...faceCounts)
    const n = chunks.length

    // A budget the WHOLE assembly fits, yet equal division (budget / n) still
    // starves the largest part below its own face count → triangles dropped.
    expect(max * n).toBeGreaterThan(total) // parts are non-uniform
    const budget = Math.floor((total + max * n) / 2)
    expect(total).toBeLessThan(budget) // assembly fits the budget
    expect(Math.floor(budget / n)).toBeLessThan(max) // big part still starved

    const previews = buildPreviewChunks(chunks, budget, equalDivision)
    const holey = previews.some((preview) => !validateManifold(preview.geometry).watertight)
    expect(holey).toBe(true)
  })

  it('FIX: proportional allocation keeps every preview part watertight and undecimated when the assembly fits the budget', async () => {
    const chunks = await splitDenseTorus()
    const faceCounts = chunks.map((chunk) => getGeometryFaceCount(chunk.geometry))
    const total = faceCounts.reduce((a, b) => a + b, 0)
    const max = Math.max(...faceCounts)
    const n = chunks.length
    const budget = Math.floor((total + max * n) / 2) // same fitting budget as the repro

    const previews = buildPreviewChunks(chunks, budget, allocatePreviewBudget)
    previews.forEach((preview, i) => {
      expect(validateManifold(preview.geometry).watertight).toBe(true)
      // Nothing dropped: the preview is exactly the part that prints.
      expect(getGeometryFaceCount(preview.geometry)).toBe(faceCounts[i])
    })
  })
})
