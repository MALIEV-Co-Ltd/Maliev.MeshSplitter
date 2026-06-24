import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  allocatePreviewBudget,
  createPreviewGeometry,
  getGeometryFaceCount,
  resolvePreviewPixelRatio,
} from './previewGeometry'

// Fraction of edges used by only one triangle. A closed surface scores ~0; a
// torn/holey shell (the old striding bug) scores high. Quantizes positions so
// welded-but-coincident vertices count as the same point.
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

describe('previewGeometry', () => {
  it('creates a decimated preview mesh without modifying the print mesh', () => {
    const source = new THREE.SphereGeometry(40, 64, 32)
    const originalFaces = getGeometryFaceCount(source)
    const originalVertices = source.attributes.position.count

    const result = createPreviewGeometry(source, { targetFaces: 180 })

    expect(result.optimized).toBe(true)
    expect(result.originalFaces).toBe(originalFaces)
    // Clustering welds nearby vertices rather than dropping triangles, so the
    // output is approximate (never an empty/exact-N shell) but is always a
    // meaningful reduction and never larger than the source.
    expect(result.previewFaces).toBeGreaterThan(0)
    expect(result.previewFaces).toBeLessThan(originalFaces / 2)
    expect(result.geometry).not.toBe(source)
    expect(source.attributes.position.count).toBe(originalVertices)
    expect(getGeometryFaceCount(source)).toBe(originalFaces)
    expect(result.geometry.userData.preview.optimized).toBe(true)
  })

  it('decimates without tearing the surface into holes', () => {
    // A torus is closed (watertight): every edge is shared by two triangles.
    // The old triangle-striding decimator left thousands of open edges (holes);
    // clustering must keep the decimated shell almost entirely closed.
    const source = new THREE.TorusGeometry(40, 14, 48, 96)
    const result = createPreviewGeometry(source, { targetFaces: 600 })

    expect(result.optimized).toBe(true)
    expect(boundaryEdgeRatio(result.geometry)).toBeLessThan(0.1)
  })

  it('keeps small preview meshes full detail while isolating them from export geometry', () => {
    const source = new THREE.BoxGeometry(10, 10, 10)
    const result = createPreviewGeometry(source, { targetFaces: 1000 })

    expect(result.optimized).toBe(false)
    expect(result.previewFaces).toBe(result.originalFaces)
    expect(result.geometry).not.toBe(source)
  })

  it('caps render pixel ratio for optimized large-model previews', () => {
    expect(resolvePreviewPixelRatio({ optimized: true, devicePixelRatio: 3 })).toBe(1)
    expect(resolvePreviewPixelRatio({ optimized: false, devicePixelRatio: 3 })).toBe(1.5)
    expect(resolvePreviewPixelRatio({ optimized: false, devicePixelRatio: 1 })).toBe(1)
  })
})

describe('allocatePreviewBudget', () => {
  it('gives every part its full face count when the assembly fits the budget', () => {
    // A small total split into many non-uniform parts must NOT be decimated:
    // equal division (budget/N) would starve the big part below its face count.
    const faceCounts = [8000, 40, 40, 40, 40]
    expect(faceCounts.reduce((a, b) => a + b, 0)).toBeLessThan(150_000)
    expect(allocatePreviewBudget(faceCounts, 150_000)).toEqual(faceCounts)
  })

  it('never starves a large part below its equal share when the assembly fits', () => {
    // Regression for the torn-preview blocker: equal division gave the 8000-face
    // part only budget/5 = 30000... that example fits, so pick a tighter budget
    // where equal division WOULD decimate the big part but the total still fits.
    const faceCounts = [8000, 40, 40, 40, 40]
    const total = faceCounts.reduce((a, b) => a + b, 0) // 8160
    const budget = total + 100 // assembly fits, but budget/5 = 1652 < 8000
    const targets = allocatePreviewBudget(faceCounts, budget)
    expect(targets[0]).toBeGreaterThanOrEqual(faceCounts[0])
  })

  it('spreads the budget proportionally to face count when the assembly is over budget', () => {
    const faceCounts = [9000, 1000]
    const budget = 5000
    const targets = allocatePreviewBudget(faceCounts, budget)
    expect(targets[0] + targets[1]).toBeLessThanOrEqual(budget)
    // Larger part keeps the larger share rather than an equal 2500/2500 split.
    expect(targets[0]).toBeGreaterThan(targets[1])
    expect(targets[0]).toBeCloseTo(4500, -2)
    expect(targets[1]).toBeCloseTo(500, -2)
  })

  it('keeps a minimum floor for tiny parts and ignores zero-face parts', () => {
    const targets = allocatePreviewBudget([100_000, 100_000, 0], 50_000)
    expect(targets[2]).toBe(0)
    expect(targets[0]).toBeGreaterThanOrEqual(12)
    expect(targets[1]).toBeGreaterThanOrEqual(12)
  })

  it('returns an empty allocation for no parts', () => {
    expect(allocatePreviewBudget([], 150_000)).toEqual([])
  })
})
